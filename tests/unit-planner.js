'use strict';

require('../js/constants.js');
require('../js/time.js');
require('../js/templates.js');
require('../js/storage.js');
require('../js/costs.js');
require('../js/monthly.js');
require('../js/networks.js');
require('../js/estimate.js');
require('../js/planner.js');
const Amber = global.Amber;

let failed = 0;
function assert(cond, message) {
    if (!cond) { failed += 1; console.error('FAIL:', message); } else { console.log('ok:', message); }
}
const near = (a, b, tol) => Math.abs(a - b) < (tol || 1e-6);
const pad = (n) => String(n).padStart(2, '0');

// Deterministic pseudo-random numbers.
let seed = 12345;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

/**
 * A year of Amber-style readings (E1 general, B1 feed-in, E2 controlled load) ending lastDay:
 * evening peaks, midday solar exports, overnight hot water, prices that vary every interval,
 * Amber demand window 3–9pm NEM.
 */
function amberYear(lastDay, minutes) {
    const byDate = {};
    const first = Amber.addDays(lastDay, -364);
    const per = 1440 / minutes;
    for (let d = first; d <= lastDay; d = Amber.addDays(d, 1)) {
        const items = [];
        for (let k = 0; k < per; k++) {
            const endMin = (k + 1) * minutes;
            const endDate = endMin === 1440 ? Amber.addDays(d, 1) : d;
            const nemTime = `${endDate}T${pad(Math.floor((endMin % 1440) / 60))}:${pad(endMin % 60)}:00+10:00`;
            const hour = (k * minutes) / 60;
            const scale = minutes / 30;
            const load = (hour >= 17 && hour < 21 ? 1.1 : (hour >= 7 && hour < 9 ? 0.6 : 0.25)) * (0.6 + 0.8 * rand()) * scale;
            const solar = hour >= 9 && hour < 15 ? (1.5 + 2.5 * rand()) * scale : 0;
            const hot = hour < 4 ? 0.9 * scale : 0;
            const wholesale = 4 + 12 * rand() + (hour >= 17 && hour < 20 && rand() > 0.97 ? 150 : 0) - (hour >= 11 && hour < 14 ? 6 : 0);
            const base = { date: d, nemTime, duration: minutes, quality: 'billable', type: 'Usage' };
            items.push(Object.assign({}, base, { channelIdentifier: 'E1', channelType: 'general', kwh: Math.max(0, load - solar * 0.3), perKwh: wholesale * 1.1 + 20, tariffInformation: { demandWindow: hour >= 15 && hour < 21 } }));
            items.push(Object.assign({}, base, { channelIdentifier: 'B1', channelType: 'feedIn', kwh: Math.max(0, solar - load), perKwh: -wholesale + (hour >= 10 && hour < 15 ? 1.23 : 0) }));
            items.push(Object.assign({}, base, { channelIdentifier: 'E2', channelType: 'controlledLoad', kwh: hot, perKwh: wholesale * 1.1 + 8 }));
        }
        byDate[d] = items;
    }
    return byDate;
}

const site = {
    id: 's', network: 'Ausgrid',
    channels: [{ identifier: 'E1', type: 'general', tariff: 'EA116' }, { identifier: 'B1', type: 'feedIn', tariff: 'EA029' }, { identifier: 'E2', type: 'controlledLoad', tariff: 'EA030' }]
};
const amberRates = { connectionCents: 120.5, subscriptionCents: 59.9, demandCents: 43.4, demandByMonth: { 1: 50, 2: 50, 7: 30 } };
const channelTypes = { E1: 'general', B1: 'feedIn', E2: 'controlledLoad' };

// The same readings through the app's own pipeline.
function appTotals(byDate, from, to, planConfig) {
    const ct = {};
    site.channels.forEach((c) => { ct[c.identifier] = Amber.emptyChannel(c); });
    Object.keys(byDate).sort().forEach((d) => Amber.processUsageData(byDate[d].map((x) => Object.assign({}, x)), ct, false));
    return Amber.periodTotals(ct, from, to, { site, planConfig, state: 'NSW', amberRates });
}

const plans = Object.keys(Amber.supplierTemplates.NSW)
    .filter((name) => Amber.planMatchesNetwork(name, Amber.supplierTemplates.NSW[name], 'Ausgrid'))
    .map((name) => ({ name, config: Amber.supplierTemplates.NSW[name] }));
plans.push({
    name: 'Custom demand plan',
    config: { rateType: 'tou', daily: 110, feedIn: 4, cl: 15, tou: { peak: { rate: 45, windows: [{ start: '15:00', end: '21:00', days: [1, 2, 3, 4, 5] }] }, offpeak: { rate: 22 } }, demand: { e: true, r: 30, s: '16:00', f: '20:00', days: [1, 2, 3, 4, 5] } }
});
assert(plans.some((p) => p.config.tou && p.config.tou.free && p.config.tou.free.capKwh) && plans.some((p) => (p.config.feedInWindows || []).some((w) => w.capKwh)),
    `test plans include a capped free window and a capped feed-in window (${plans.length} plans)`);

[30, 5].forEach((minutes) => {
    const byDate = amberYear('2026-09-30', minutes);
    const t0 = Date.now();
    const year = Amber.planYear(byDate, { channelTypes });
    assert(year.ok && year.first === '2025-10-01' && year.last === '2026-09-30' && year.n === 365 * 48 && !year.filled.length, `${minutes}-minute year read (${year.first} – ${year.last})`);
    const model = Amber.amberPlannerModel(year, site, amberRates);
    const amber = Amber.amberCardCost(year, model, year.imp, year.exp, year.cl);
    const app = appTotals(byDate, year.first, year.last, plans[0].config);
    assert(near(amber.total, app.amberTotal, 1e-6), `${minutes}-min: Amber total matches the app (${amber.total.toFixed(4)} vs ${app.amberTotal.toFixed(4)})`);
    assert(amber.exportCharge > 0 && amber.demand > 0, `${minutes}-min: export charge over the free level and demand are both in play ($${amber.exportCharge.toFixed(2)}, $${amber.demand.toFixed(2)})`);
    let worst = 0;
    // 5-minute data: one plan of each kind (the app pipeline is slow on 315,000 readings).
    const kinds = minutes === 30 ? plans : plans.filter((p, i) => i === 0 || p.config.demand || (p.config.feedInWindows || []).length || (p.config.tou && p.config.tou.free && p.config.tou.free.capKwh)).slice(0, 4);
    kinds.forEach((p) => {
        const card = Amber.planRateCard(year, p.config, 'NSW');
        const mine = Amber.planCardCost(year, card, year.imp, year.exp, year.cl).total;
        const theirs = appTotals(byDate, year.first, year.last, p.config).otherTotal;
        worst = Math.max(worst, Math.abs(mine - theirs));
        if (!near(mine, theirs, 1e-6)) console.error(`  ${p.name}: ${mine} vs ${theirs}`);
    });
    assert(worst < 1e-6, `${minutes}-min: plans match the app to the cent (${kinds.length} plans, worst diff ${worst.toExponential(2)}, ${Date.now() - t0} ms)`);
});

// Missing days are filled from the same weekday; too many missing is refused.
{
    const byDate = amberYear('2026-09-30', 30);
    delete byDate['2026-05-13'];
    delete byDate['2026-05-14'];
    const year = Amber.planYear(byDate, { channelTypes });
    assert(year.ok && year.filled.join() === '2026-05-13,2026-05-14', 'two missing days filled');
    const d = year.dates.indexOf('2026-05-13');
    const src = year.dates.indexOf('2026-05-06');
    assert(near(year.imp[d * 48 + 36], year.imp[src * 48 + 36]), 'filled from the same weekday a week earlier');
    Object.keys(byDate).slice(0, 60).forEach((k) => delete byDate[k]);
    const short = Amber.planYear(byDate, { channelTypes });
    assert(!short.ok && short.reason === 'short' && short.have === 303, `too few days refused (${short.have} of ${short.need})`);
}

// No solar today: feed-in prices are rebuilt from wholesale prices and the export tariff.
{
    const byDate = amberYear('2026-09-30', 30);
    Object.values(byDate).forEach((items) => items.splice(0, items.length, ...items.filter((x) => x.channelIdentifier !== 'B1')));
    const year = Amber.planYear(byDate, { channelTypes });
    assert(year.ok && !year.hasFeedIn && Number.isNaN(year.amberExp[100]), 'no feed-in channel: feed-in prices unknown at first');
    const months = Amber.priceMonthsFor(year.first, year.last);
    const prices = {};
    months.forEach((m) => { prices[m] = new Array(31 * 288).fill(80); });
    const unpriced = Amber.fillPlannerExportPrices(year, { net: Amber.NETWORKS.ausgrid, exportCode: 'EA029', prices });
    const noonSlot = year.dates.indexOf('2026-06-15') * 48 + 25; // 12:30–13:00 NEM = local in June
    const nightSlot = year.dates.indexOf('2026-06-15') * 48 + 4;
    assert(unpriced === 0 && near(year.amberExp[noonSlot], -1.048 * 8 + 1.23) && near(year.amberExp[nightSlot], -1.048 * 8),
        `feed-in rebuilt: −LF × wholesale + EA029 band (${year.amberExp[noonSlot].toFixed(3)} at midday)`);
}

// ---- Solar, export limit and battery ----
{
    const byDate = amberYear('2026-09-30', 30);
    const year = Amber.planYear(byDate, { channelTypes });
    const model = Amber.amberPlannerModel(year, site, amberRates);
    const solar = new Float64Array(year.n);
    for (let i = 0; i < year.n; i++) { const s = i % 48; if (s >= 16 && s < 34) solar[i] = 1.5 * Math.sin(Math.PI * (s - 16) / 18); }
    const base = Amber.plannerFlows(year, {});
    const flows = Amber.plannerFlows(year, { solar, exportLimitKw: 5 });
    const gen = solar.reduce((s, x) => s + x, 0);
    const before = base.imp.reduce((s, x) => s + x, 0) - base.exp.reduce((s, x) => s + x, 0);
    const after = flows.imp.reduce((s, x) => s + x, 0) - flows.exp.reduce((s, x) => s + x, 0);
    assert(near(flows.solarKwh, gen) && near(after, before - gen + flows.curtailed, 1e-6) && near(flows.solarSelf + (flows.exp.reduce((s, x) => s + x, 0) - base.exp.reduce((s, x) => s + x, 0)) + flows.curtailed, gen, 1e-6),
        `solar covers the home first, the rest is exported (${gen.toFixed(0)} kWh made, ${flows.solarSelf.toFixed(0)} used at home)`);
    const tight = Amber.plannerFlows(year, { solar: solar.map((x) => x * 4), exportLimitKw: 5 });
    assert(tight.curtailed > 0 && tight.exp.every((x, i) => x <= Math.max(2.5, year.exp[i]) + 1e-9), `export limit clips new solar (${tight.curtailed.toFixed(0)} kWh lost)`);

    const flat = { name: 'Flat', config: { rateType: 'flat', flat: 30, feedIn: 5, daily: 100 } };
    const flatCard = Amber.planRateCard(year, flat.config, 'NSW');
    const battery = { kwh: 13.5, kw: 5, rte: 0.9, wear: 2 };
    const balance = (f, sim) => {
        const d = (a) => a.reduce((s, x) => s + x, 0);
        return near(d(sim.imp) - d(sim.exp), d(f.imp) - d(f.exp) + sim.charged - sim.discharged + sim.curtailed, 1e-6);
    };

    // Flat plan, no solar: nothing to gain, so the battery sits idle.
    const noSolar = { imp: base.imp, exp: new Float64Array(year.n), cl: base.cl, expCap: null };
    const idle = Amber.simulateBattery(year, noSolar, Amber.plannerBatteryPrices(year, flat, flatCard, model), battery);
    assert(idle.discharged < 1 && near(Amber.planCardCost(year, flatCard, idle.imp, idle.exp, base.cl).total, Amber.planCardCost(year, flatCard, noSolar.imp, noSolar.exp, base.cl).total, 0.5),
        `flat plan without solar: the battery doesn't cycle (${idle.discharged.toFixed(1)} kWh)`);

    // Flat plan with solar: it stores what would export at 5c and uses it instead of buying at 30c.
    const t1 = Date.now();
    const solarSim = Amber.simulateBattery(year, flows, Amber.plannerBatteryPrices(year, flat, flatCard, model), battery);
    const flatMs = Date.now() - t1;
    const noBat = Amber.planCardCost(year, flatCard, flows.imp, flows.exp, flows.cl).total;
    const withBat = Amber.planCardCost(year, flatCard, solarSim.imp, solarSim.exp, flows.cl).total;
    assert(balance(flows, solarSim) && solarSim.gridCharged === 0 && withBat < noBat - 300 && solarSim.cycles > 150 && solarSim.cycles < 366,
        `flat + solar: battery saves $${(noBat - withBat).toFixed(0)}/yr, ${solarSim.cycles.toFixed(0)} cycles, no grid charging, energy balances (${flatMs} ms)`);

    // A free-window plan for a home with no solar: fill up free at midday, cover the evening.
    const free = plans.find((p) => /OVO The Free 4/.test(p.name));
    const freeCard = Amber.planRateCard(year, free.config, 'NSW');
    const freeSim = Amber.simulateBattery(year, noSolar, Amber.plannerBatteryPrices(year, free, freeCard, model), battery);
    const freeSave = Amber.planCardCost(year, freeCard, noSolar.imp, noSolar.exp, base.cl).total - Amber.planCardCost(year, freeCard, freeSim.imp, freeSim.exp, base.cl).total;
    assert(balance(noSolar, freeSim) && freeSim.gridCharged > 2000 && freeSave > 400, `free-window plan, no solar: charges ${freeSim.gridCharged.toFixed(0)} kWh free, saves $${freeSave.toFixed(0)}/yr`);

    // Amber: the battery sells into price spikes.
    const amberPlan = { name: 'Amber', amber: true };
    const t2 = Date.now();
    const amberSim = Amber.simulateBattery(year, flows, Amber.plannerBatteryPrices(year, amberPlan, null, model), battery);
    const amberMs = Date.now() - t2;
    const amberSave = Amber.amberCardCost(year, model, flows.imp, flows.exp, flows.cl).total - Amber.amberCardCost(year, model, amberSim.imp, amberSim.exp, flows.cl).total;
    assert(balance(flows, amberSim) && amberSim.exported > 0 && amberSave > 300, `Amber: saves $${amberSave.toFixed(0)}/yr, sells ${amberSim.exported.toFixed(0)} kWh into spikes (${amberMs} ms)`);
    assert(flatMs < 400 && amberMs < 800, 'a year of battery simulation is quick enough to search');

    // Search: every combination, a plan's battery bills to read wear off, and the payback maths.
    (async () => {
        const perKw = solar.map((x) => x / 3);
        const ctx = { year, plans: [flat, free, amberPlan], state: 'NSW', amberModel: model, solarPerKw: perKw, solarSizes: [0, 3, 6], batterySizes: [0, 5, 13.5], exportLimitKw: 5 };
        const res = await Amber.plannerSearch(Object.assign({}, ctx, { keepPlans: 3 }));
        assert(res.rows.length === 3 * 3 + 3 * 2 * 3 && res.searchedPlans.length === 3, `search covers 3 solar × 3 battery × 3 plans (${res.rows.length} rows)`);
        const pruned = await Amber.plannerSearch(Object.assign({}, ctx, { keepPlans: 1, mustPlans: ['Amber'] }));
        const kept = pruned.searchedPlans.length;
        assert(pruned.searchedPlans.includes('Amber') && kept >= 1 && kept <= 2 && pruned.rows.length === 9 + 3 * 2 * kept,
            `battery search narrowed to the probe's best plan plus a plan that must be shown (${pruned.searchedPlans.join(', ')})`);
        const pick = (s, b, p) => res.rows.find((r) => r.solarKw === s && r.batteryKwh === b && r.plan === p).bill;
        const f = Amber.PLANNER_FINANCE_DEFAULTS;
        const today = pick(0, 0, 'Flat');
        const freeBest = Math.min(...['Flat', free.name, 'Amber'].map((p) => pick(0, 0, p)));
        const opt = {
            solarKw: 6, batteryKwh: 13.5, today, free: freeBest, planOnly: pick(0, 0, 'Flat'), solarOnly: pick(6, 0, 'Flat'),
            batteryBills: [0, 5, 13.5].map((b) => ({ kwh: b, bill: pick(6, b, 'Flat') }))
        };
        const fin = Amber.plannerFinance(opt, f);
        const capex = 1500 + 1150 * 6 - 280 * 6 + 1500 + 900 * 13.5 - 330 * 13.5;
        assert(near(fin.capex.total, capex) && fin.flows.length === 20, `capex after rebates $${fin.capex.total.toFixed(0)}`);
        assert(fin.flows[12].spend > 0 && fin.flows[12].capacity === 1 && fin.flows[11].capacity < 0.8, 'battery replaced after 12 years (capacity back to full)');
        assert(fin.payback > 0 && fin.payback < 20 && Number.isFinite(fin.npv) && fin.irr > 0, `payback ${fin.payback.toFixed(1)} years, NPV $${fin.npv.toFixed(0)}, IRR ${(fin.irr * 100).toFixed(1)}%`);
        const never = Amber.plannerFinance(Object.assign({}, opt, { solarOnly: opt.planOnly, batteryBills: [] , solarKw: 6, batteryKwh: 0 }), f);
        assert(never.payback === null && never.npv < 0, 'no savings: never pays back');
        finish();
    })();
}

function finish() {
    if (failed) {
        console.error(`${failed} planner test(s) failed`);
        process.exit(1);
    }
    console.log('planner tests passed');
}
