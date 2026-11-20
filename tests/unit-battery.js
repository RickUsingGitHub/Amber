'use strict';

/*
 * How good is the planner's battery (Amber.simulateBattery)? It picks a charge and a discharge
 * price threshold for each day, knowing that day's prices. Here the same battery, prices and home
 * are solved exactly: a dynamic program over the stored energy finds the cheapest possible schedule
 * with the same rules (power limit shared by charging and discharging, round-trip losses split
 * evenly, the same wear cost per kWh discharged, perfect knowledge of prices).
 *
 * The share of the best possible saving the planner finds is printed and held to a floor, so a
 * change that makes the battery model worse fails here. With 'realistic' foresight (spikes seen
 * dimly, 8% held back) the planner should find less, as it is meant to.
 */

require('../js/constants.js');
require('../js/time.js');
require('../js/planner.js');
const Amber = global.Amber;
const fs = require('fs');
const path = require('path');

let failed = 0;
function assert(cond, message) {
    if (!cond) { failed += 1; console.error('FAIL:', message); } else { console.log('ok:', message); }
}

const SLOTS = 48;
const DAYS = 14;
const N = DAYS * SLOTS;

// ---- A home: evening-heavy use and 6.6 kW of panels (kWh per half hour) ----
function home() {
    const load = new Float64Array(N);
    const solar = new Float64Array(N);
    for (let i = 0; i < N; i++) {
        const d = Math.floor(i / SLOTS);
        const h = (i % SLOTS) / 2;
        const base = h >= 17 && h < 22 ? 1.0 : (h >= 6.5 && h < 9 ? 0.6 : 0.25);
        load[i] = base * (0.85 + 0.3 * ((d * 7 + i) % 5) / 4);
        const sun = h >= 6 && h < 18 ? Math.sin(Math.PI * (h - 6) / 12) : 0;
        const cloud = [1, 0.9, 0.5, 1, 0.95, 0.7, 1, 1, 0.4, 0.9, 1, 0.8, 1, 0.95][d];
        solar[i] = 6.6 * 0.5 * 0.8 * sun * cloud;
    }
    return { load, solar };
}

// ---- Prices (c/kWh) ----
// Amber: two weeks of real NSW wholesale prices (data/prices), plus a typical 22 c network and GST.
function amberPrices() {
    const file = path.join(__dirname, '..', 'data', 'prices', 'NSW1', '2026-10.json');
    const rrp = JSON.parse(fs.readFileSync(file, 'utf8')).rrp;
    const buy = new Float64Array(N);
    const sell = new Float64Array(N);
    for (let i = 0; i < N; i++) {
        let s = 0;
        for (let k = 0; k < 6; k++) s += rrp[i * 6 + k];
        const c = s / 6 / 10; // $/MWh -> c/kWh
        buy[i] = c * 1.1 + 22;
        sell[i] = c;
    }
    return { buy, sell };
}
// A time-of-use plan: peak 3–9 pm, shoulder 7 am–3 pm and 9–10 pm, off-peak otherwise; 5 c feed-in.
function touPrices() {
    const buy = new Float64Array(N);
    const sell = new Float64Array(N).fill(5);
    for (let i = 0; i < N; i++) {
        const h = (i % SLOTS) / 2;
        buy[i] = h >= 15 && h < 21 ? 52 : ((h >= 7 && h < 15) || (h >= 21 && h < 22) ? 30 : 22);
    }
    return { buy, sell };
}

const battery = { kwh: 13.5, kw: 5, rte: 0.9, wear: 2 };

/** Bill plus wear for a home's import and export (the objective both methods minimise). */
function cost(prices, imp, exp, discharged) {
    let c = 0;
    for (let i = 0; i < N; i++) c += prices.buy[i] * imp[i] - prices.sell[i] * exp[i];
    return c + battery.wear * discharged;
}

/** The planner's battery on this home. */
function planner(h, prices, foresight) {
    const imp = new Float64Array(N);
    const exp = new Float64Array(N);
    for (let i = 0; i < N; i++) {
        const net = h.load[i] - h.solar[i];
        if (net > 0) imp[i] = net; else exp[i] = -net;
    }
    const year = { days: DAYS, n: N };
    const p = { buy: prices.buy, sell: prices.sell, shadow: new Float64Array(N), noGrid: new Uint8Array(N) };
    const sim = Amber.simulateBattery(year, { imp, exp, expCap: null }, p, Object.assign({ foresight }, battery));
    return { none: cost(prices, imp, exp, 0), with: cost(prices, sim.imp, sim.exp, sim.discharged) };
}

/** The cheapest possible schedule: dynamic programming over the stored energy (STEPS levels). */
function optimum(h, prices) {
    const STEPS = 675; // 0.02 kWh a step for 13.5 kWh: fine enough that the planner never comes out ahead
    const step = battery.kwh / STEPS;
    const eta = Math.sqrt(battery.rte);
    const P = battery.kw * 0.5; // kWh in or out per half hour
    const upMax = Math.floor((P * eta) / step + 1e-9); // stored kWh gained per slot at full charge
    const downMax = Math.floor(P / (eta * step) + 1e-9); // stored kWh lost per slot at full discharge
    let next = new Float64Array(STEPS + 1); // value of each level after the last slot: nothing
    for (let i = N - 1; i >= 0; i--) {
        const cur = new Float64Array(STEPS + 1).fill(Infinity);
        const net = h.load[i] - h.solar[i];
        const b = prices.buy[i];
        const s = prices.sell[i];
        for (let j = 0; j <= STEPS; j++) {
            const lo = Math.max(0, j - downMax);
            const hi = Math.min(STEPS, j + upMax);
            for (let k = lo; k <= hi; k++) {
                let flow = net;
                let wear = 0;
                if (k > j) flow += ((k - j) * step) / eta; // charging draws more than it stores
                else if (k < j) { const out = (j - k) * step * eta; flow -= out; wear = battery.wear * out; }
                const c = (flow > 0 ? b * flow : s * flow) + wear + next[k];
                if (c < cur[j]) cur[j] = c;
            }
        }
        next = cur;
    }
    return next[0]; // starting empty, as the planner does
}

function compare(label, prices, floor) {
    const h = home();
    const p = planner(h, prices, 'optimal');
    const real = planner(h, prices, 'realistic');
    const best = optimum(h, prices);
    const most = p.none - best;
    const share = (p.none - p.with) / most;
    const realShare = (p.none - real.with) / most;
    console.log(`  ${label}: best possible saving ${(most / 100).toFixed(2)} $ over ${DAYS} days; planner finds ${(100 * share).toFixed(1)}%, realistic foresight ${(100 * realShare).toFixed(1)}%`);
    assert(p.with >= best - 0.5, `${label}: the planner never beats the exact optimum (a sanity check on both)`);
    assert(share >= floor, `${label}: the planner finds at least ${Math.round(floor * 100)}% of the best possible saving (${(100 * share).toFixed(1)}%)`);
    assert(realShare <= share + 1e-9, `${label}: realistic foresight finds no more than perfect foresight (${(100 * realShare).toFixed(1)}%)`);
    return share;
}

const t0 = Date.now();
compare('Amber, NSW 1–14 Oct 2026', amberPrices(), 0.85);
compare('time-of-use plan', touPrices(), 0.97);
console.log(`  (${Date.now() - t0} ms)`);

if (failed) {
    console.error(`${failed} battery test(s) failed`);
    process.exit(1);
}
console.log('battery tests passed');
