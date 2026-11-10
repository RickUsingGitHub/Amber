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
const pending = [];
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
        // The battery starts from the spare power before the export limit (expRaw); what the limit
        // still throws away afterwards is sim.limited.
        return near(d(sim.imp) - d(sim.exp), d(f.imp) - d(f.expRaw || f.exp) + sim.charged - sim.discharged + sim.curtailed + sim.limited, 1e-6);
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
    pending.push((async () => {
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
        const capex = 1500 + 1150 * 6 - 280 * 6 + 1500 + 900 * 13.5 - f.batteryRebatePerKwh * 13.5;
        assert(near(fin.capex.total, capex) && fin.flows.length === 20, `capex after rebates $${fin.capex.total.toFixed(0)}`);
        // The battery rebate is tiered by size: full on the first 14 kWh, 60 % to 28 kWh, 15 % to 50 kWh.
        const rebateKwh = [5, 14, 20, 28, 30, 50, 60].map((b) => Amber.batteryRebateKwh(b));
        assert(rebateKwh.every((v, i) => near(v, [5, 14, 17.6, 22.4, 22.7, 25.7, 25.7][i])),
            `battery rebate tiers: 20 kWh earns it on ${rebateKwh[2].toFixed(1)} kWh, 30 kWh on ${rebateKwh[4].toFixed(1)}, nothing more past 50 kWh`);
        const cap20 = Amber.plannerCapex(0, 20, f);
        assert(near(cap20.batteryRebate, f.batteryRebatePerKwh * 17.6) && near(cap20.rebates, cap20.batteryRebate) && near(cap20.total, 1500 + 900 * 20 - cap20.batteryRebate)
            && near(Amber.plannerCapex(6, 0, f).solarRebate, 280 * 6),
            `a 20 kWh battery gets $${cap20.batteryRebate.toFixed(0)} off, not the flat $${(f.batteryRebatePerKwh * 20).toFixed(0)}`);
        assert(fin.flows[12].spend > 0 && fin.flows[12].capacity === 1 && fin.flows[11].capacity < 0.8, 'battery replaced after 12 years (capacity back to full)');
        assert(fin.payback > 0 && fin.payback < 20 && Number.isFinite(fin.npv) && fin.irr > 0, `payback ${fin.payback.toFixed(1)} years, NPV $${fin.npv.toFixed(0)}, IRR ${(fin.irr * 100).toFixed(1)}%`);
        const never = Amber.plannerFinance(Object.assign({}, opt, { solarOnly: opt.planOnly, batteryBills: [] , solarKw: 6, batteryKwh: 0 }), f);
        assert(never.payback === null && never.npv < 0, 'no savings: never pays back');

        // 10 kW + 30 kWh: back to $0 in year 11, behind again when the battery is replaced in year 13,
        // ahead for good later. The replacement's 4 unused years count toward its worth.
        const big = { solarKw: 10, batteryKwh: 30, today: 4000, free: 3200, planOnly: 3200, solarOnly: 2200, batteryBills: [{ kwh: 0, bill: 2200 }, { kwh: 30, bill: 900 }] };
        // (With a battery rebate that leaves $28,800 up front, whatever the current rate is.)
        const bigF = Object.assign({}, f, { batteryRebatePerKwh: 9900 / Amber.batteryRebateKwh(30) });
        const bigFin = Amber.plannerFinance(big, bigF);
        assert(near(bigFin.capex.total, 28800) && bigFin.firstPayback > 9 && bigFin.firstPayback < 13 && bigFin.payback > 13 && bigFin.payback <= 20 && bigFin.flows[12].cumulative < 0,
            `ahead for good: first back to $0 at ${bigFin.firstPayback.toFixed(1)} years, behind again after the year-13 replacement, ahead for good at ${bigFin.payback.toFixed(1)}`);
        const replacement = 900 * 30 * Math.pow(0.96, 12);
        assert(near(bigFin.residual.battery, replacement * 4 / 12, 1e-6) && near(bigFin.residual.inverter, 2000 * 4 / 12, 1e-6),
            `what's left of the year-13 battery and inverter at year 20: $${bigFin.residual.battery.toFixed(0)} + $${bigFin.residual.inverter.toFixed(0)}`);
        const cashOnly = bigFin.flows.reduce((sum, x) => sum + x.net / Math.pow(1.05, x.year), -bigFin.capex.total);
        assert(near(bigFin.npv, cashOnly + bigFin.residual.total / Math.pow(1.05, 20), 1e-6) && bigFin.npv - cashOnly > 2200,
            `worth in today's money counts it: $${cashOnly.toFixed(0)} → $${bigFin.npv.toFixed(0)}`);
        // How keen to be. A 15 kW system costing $14,550 that's worth $5,105 (about $1.35 back per $1,
        // paying back in 9.7 years) is only Modest; $1.70 back and 7 years is Good; Strong needs more.
        const keen = (npv, cost, payback, lowNpv) => Amber.plannerKeenLevel({ npv, capex: cost, payback, lowNpv });
        assert(keen(5105, 14550, 9.7, 900) === 2 && keen(11932, 17010, 7.0, 6000) === 3 && keen(14000, 17000, 6.5, 8000) === 4
            && keen(14000, 17000, 9, 8000) === 3 && keen(9000, 17000, 7, -50) === 2 && keen(1500, 17000, 15, -3000) === 1
            && keen(-500, 17000, null, -4000) === 0 && keen(0, 0, 0, 0) === null,
            'how keen to be: Not worth it, Marginal, Modest, Good, Strong from value per $1, robustness and payback');
        const short = Amber.plannerFinance(big, Object.assign({}, bigF, { years: 12 }));
        assert(short.residual.total === 0 && short.payback === short.firstPayback, 'nothing replaced within 12 years: no credit, one payback');

        // One option in full: its months add up to its year, and the search's bill for it.
        const one = Amber.plannerEvaluate(res.prep, 'Flat', 6, 13.5);
        const monthsTotal = one.months.reduce((s, m) => s + m.bill, 0);
        assert(one.months.length === 12 && near(monthsTotal, one.cost.total, 1e-6) && near(one.cost.total, pick(6, 13.5, 'Flat'), 1e-6),
            `an option's 12 months add up to its year ($${one.cost.total.toFixed(2)})`);
        const amberOne = Amber.plannerEvaluate(res.prep, 'Amber', 6, 13.5);
        const amberMonths = amberOne.months.reduce((s, m) => s + m.bill, 0);
        assert(near(amberMonths, amberOne.cost.total, 1e-6), `Amber's 12 months add up to its year too (the export allowance and demand are both monthly): $${amberMonths.toFixed(2)} vs $${amberOne.cost.total.toFixed(2)}`);

        const allowedOnly = await Amber.plannerSearch(Object.assign({}, ctx, { allowPlans: ['Flat', 'Amber'] }));
        assert(allowedOnly.searchedPlans.sort().join() === 'Amber,Flat' && allowedOnly.rows.filter((r) => r.batteryKwh > 0).every((r) => r.plan !== free.name)
            && allowedOnly.rows.filter((r) => r.batteryKwh === 0).length === 9,
            'plans left out get no battery search, but keep their nothing-new rows');
        const exCtx = Object.assign({}, ctx, { existing: { kwh: 5, kw: 2.5 }, allowPlans: ['Flat'], alsoPlans: ['Amber'], batterySizes: [0] });
        const exRows = (await Amber.plannerSearch(exCtx)).rows;
        assert(exRows.length === 6 && exRows.every((r) => r.plan === 'Flat' || r.plan === 'Amber'), 'with a battery already, only the plans used and the one to compare against are run');
        assert(Amber.planCompany('OVO The Free 4 Plan (Ausgrid, TOU)') === 'OVO' && Amber.planCompany('Red Energy Living Energy Saver (Ausgrid, Flat)') === 'Red Energy'
            && Amber.planCompany('2026-27 VDO (Jemena, TOU)') === 'Default offer (DMO / VDO)' && Amber.planCompany('My plan', true) === 'Your own plans', 'plans are grouped by company');
        // Negative feed-in prices: by default the panels switch off rather than pay to export, with or
        // without a battery; told they can't, the exports go out and cost money.
        const prepOn = Amber.plannerPrepare(ctx);
        const prepOff = Amber.plannerPrepare(Object.assign({}, ctx, { switchOffNegative: false }));
        const on = Amber.plannerEvaluate(prepOn, 'Amber', 6, 0);
        const off = Amber.plannerEvaluate(prepOff, 'Amber', 6, 0);
        const sell = prepOn.pricesOf(prepOn.byName.Amber).sell;
        let negOn = 0;
        let negOff = 0;
        for (let i = 0; i < year.n; i++) if (sell[i] < 0) { negOn += on.exp[i]; negOff += off.exp[i]; }
        assert(on.switchedOff > 0 && negOn === 0 && negOff > 0 && on.cost.total < off.cost.total && off.switchedOff === 0,
            `negative feed-in: panels switch off (${on.switchedOff.toFixed(0)} kWh not sent), or pay to export when they can't ($${(off.cost.total - on.cost.total).toFixed(2)} more)`);
        assert(Amber.plannerBill(prepOn, 'Amber', 6, 13.5) <= Amber.plannerBill(prepOff, 'Amber', 6, 13.5) + 1e-6 && near(Amber.plannerBill(prepOn, 'Amber', 6, 0), on.cost.total, 1e-6),
            'the same rule with a battery, and plannerBill matches plannerEvaluate');

        // What if feed-in from 10am to 3pm halves: dearer, and more so with more panels.
        const prepDay = Amber.plannerPrepare(Object.assign({}, ctx, { dayFeedInScale: 0.5 }));
        const lift = (p, kw) => Amber.plannerBill(prepDay, p, kw, 0) - Amber.plannerBill(prepOn, p, kw, 0);
        assert(lift('Flat', 6) > lift('Flat', 0) + 10 && lift('Amber', 6) > lift('Amber', 0) && lift('Flat', 0) >= 0,
            `middle-of-the-day feed-in halving costs 6 kW of panels $${(lift('Flat', 6) - lift('Flat', 0)).toFixed(0)} a year more on the flat plan`);
        assert(Amber.plannerKeenLevel({ npv: 11932, capex: 17010, payback: 7, lowNpv: 6000, dayNpv: -200 }) === 2
            && Amber.plannerKeenLevel({ npv: 11932, capex: 17010, payback: 7, lowNpv: 6000, dayNpv: 3000 }) === 3,
            'how keen to be drops to Modest if halving middle-of-the-day feed-in would sink it');

        const pinned = await Amber.plannerSearch(Object.assign({}, ctx, { batteryPlans: [free.name] }));
        assert(pinned.searchedPlans.join() === free.name && pinned.rows.filter((r) => r.batteryKwh > 0).every((r) => r.plan === free.name), 'a chosen plan: only it gets the battery search');

        const wait = Amber.plannerWaitAYear(opt, f);
        assert(wait.capexLater < wait.capexNow + 1e-9 || f.rebateStepDown > f.hardwareDecline, `wait a year: up-front $${wait.capexNow.toFixed(0)} now vs $${wait.capexLater.toFixed(0)} next year`);
        assert(Number.isFinite(wait.change), `waiting changes the 20-year value by $${wait.change.toFixed(0)}`);
    })());
}

// ---- Solar from a town's typical weather year (PVGIS) ----
{
    require('../js/solar.js');
    const fs = require('fs');
    const path = require('path');
    const files = fs.readdirSync(path.join(__dirname, '..', 'data', 'solar')).filter((f) => f.endsWith('.json'));
    assert(files.length === Amber.SOLAR_LOCATIONS.length && Amber.SOLAR_LOCATIONS.every((l) => files.includes(`${l.id}.json`)), `every planner town has its weather year (${files.length})`);
    const weather = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'solar', 'sydney.json'), 'utf8'));
    const yearOf = (o) => Amber.solarHourlyPerKw(weather, o).reduce((s, x) => s + x, 0);
    const north = yearOf({ tilt: 20, orientation: 'north' });
    assert(near(north, weather.pvcalc.kwhPerYear, 1e-6), `calibrated to PVGIS: 1 kW north at 20° makes ${north.toFixed(0)} kWh a year in Sydney`);
    const raw = yearOf({ tilt: 20, orientation: 'north', calibrate: false });
    assert(Math.abs(raw / weather.pvcalc.kwhPerYear - 1) < 0.08, `uncalibrated model within 8 % of PVGIS (${((raw / weather.pvcalc.kwhPerYear - 1) * 100).toFixed(1)} %)`);
    const ratio = (o) => yearOf({ tilt: 20, orientation: o }) / north;
    assert(ratio('east') < 1 && ratio('west') < 1 && ratio('northeast') > ratio('east') && ratio('eastwest') > ratio('west') && ratio('eastwest') < ratio('east'),
        `directions rank sensibly (NE ${(ratio('northeast') * 100).toFixed(0)} %, E ${(ratio('east') * 100).toFixed(0)} %, W ${(ratio('west') * 100).toFixed(0)} %, E+W ${(ratio('eastwest') * 100).toFixed(0)} % of north)`);
    assert(yearOf({ tilt: 20, orientation: 'north', shadingPct: 10 }) / north > 0.899 && yearOf({ tilt: 20, orientation: 'north', shadingPct: 10 }) / north < 0.901, 'shading takes its share off');

    const year = Amber.planYear(amberYear('2026-09-30', 30), { channelTypes });
    const slots = Amber.solarSlotsPerKw(year, weather, { tilt: 20, orientation: 'north' });
    const total = slots.reduce((s, x) => s + x, 0);
    assert(Math.abs(total / north - 1) < 0.01, `half hours keep the year's energy (${total.toFixed(0)} vs ${north.toFixed(0)} kWh)`);
    const bySlot = new Float64Array(48);
    for (let i = 0; i < year.n; i++) bySlot[i % 48] += slots[i];
    const peak = bySlot.indexOf(Math.max(...bySlot));
    assert(peak >= 22 && peak <= 25 && bySlot[0] === 0 && bySlot[47] === 0, `peaks around noon NEM time (slot ${peak}), nothing at night`);
    const clipped = Amber.clipToInverter(slots.map((x) => x * 10), 5);
    assert(clipped.every((x) => x <= 2.5 + 1e-12) && clipped.clipped > 0, `10 kW of panels on a 5 kW inverter loses ${clipped.clipped.toFixed(0)} kWh at the peaks`);
}

// ---- Future changes ----
{
    const year = Amber.planYear(amberYear('2026-09-30', 30), { channelTypes });
    const total = (a) => a.reduce((s, x) => s + x, 0);
    const ev = Amber.plannerExtraLoads(year, { ev: { kmPerYear: 12000, chargeAt: 'overnight' } }, 'Australia/Sydney');
    const evDaily = (12000 / 365) * 0.17 * 1.1;
    assert(near(ev.kwh.ev, evDaily * 365, 1e-6) && near(total(ev.extra), evDaily * 365, 1e-6), `EV: ${ev.kwh.ev.toFixed(0)} kWh a year`);
    // June (AEST = NEM): overnight charging at 7 kW fills the first slots after midnight.
    const june = year.dates.indexOf('2026-06-10') * 48;
    assert(near(ev.extra[june], 3.5) && ev.extra[june + 1] > 0 && ev.extra[june + 2] === 0 && ev.extra[june + 20] === 0, 'EV charges at 7 kW from midnight until full');
    const solarEv = Amber.plannerExtraLoads(year, { ev: { kmPerYear: 12000, chargeAt: 'solar' } }, 'Australia/Sydney');
    assert(near(solarEv.extra[june + 24], evDaily / 10) && solarEv.extra[june + 18] === 0, 'daytime charging follows the sun, spread 10am–3pm');

    const hw = Amber.plannerExtraLoads(year, { hotWater: { from: 'controlled', runAt: 'solar' } }, 'Australia/Sydney');
    assert(hw.clScale === 0 && near(hw.kwh.hotWater, total(year.cl) / 3.5, 1e-6), `heat pump replaces the controlled-load heater: ${total(year.cl).toFixed(0)} → ${hw.kwh.hotWater.toFixed(0)} kWh`);
    const flows = Amber.plannerFlows(year, { extra: hw.extra, clScale: hw.clScale });
    assert(total(flows.cl) === 0 && near(total(flows.imp), total(year.imp) + hw.kwh.hotWater, 1e-6), 'its use moves onto the general meter');

    const gas = Amber.plannerExtraLoads(year, { gas: { heatingMJ: 20000, cooking: true, allGone: true }, hotWater: { from: 'gas', people: 2 } }, 'Australia/Sydney');
    const jan = year.dates.indexOf('2026-01-15') * 48;
    const winter = year.dates.indexOf('2026-07-15') * 48;
    let janHeat = 0;
    let julHeat = 0;
    for (let s = 34; s < 46; s++) { janHeat += gas.extra[jan + s]; julHeat += gas.extra[winter + s]; }
    assert(near(gas.kwh.heating, 20000 * 0.75 / 3.6 / 4, 1e-6) && julHeat > 5 * janHeat, `gas heating becomes ${gas.kwh.heating.toFixed(0)} kWh of reverse-cycle, mostly winter evenings`);
    assert(gas.gasSaving > 20000 * 0.045 + 365 * 0.8 && gas.kwh.cooking > 0 && gas.kwh.hotWater > 0, `no more gas bill: $${gas.gasSaving.toFixed(0)} a year`);
}

// ---- A battery the home already has ----
{
    require('../js/solar.js');
    const year = Amber.planYear(amberYear('2026-09-30', 30), { channelTypes });
    const model = Amber.amberPlannerModel(year, site, amberRates);
    const cosZ = Amber.solarCosZenithSlots(year, -33.87, 151.21);
    // amberYear's panels make 1.5–4 kWh a half hour from 9am to 3pm: a typical 2.75, about 8 kW.
    const pv = new Float64Array(year.n);
    for (let i = 0; i < year.n; i++) { const s = i % 48; if (s >= 18 && s < 30) pv[i] = 2.75; }
    const total = (a) => a.reduce((x, v) => x + v, 0);
    const flat = { name: 'Flat', config: { rateType: 'flat', flat: 30, feedIn: 5, daily: 100 } };
    const amberPlan = { name: 'Amber', amber: true };
    const flatCard = Amber.planRateCard(year, flat.config, 'NSW');
    const battery = { kwh: 10, kw: 5, rte: 0.9, wear: 2 };
    const truth = Amber.plannerFlows(year, {});
    const flatPrices = Amber.plannerBatteryPrices(year, flat, flatCard, model);
    const amberPrices = Amber.plannerBatteryPrices(year, amberPlan, null, model);
    const flatCost = (imp, exp) => Amber.planCardCost(year, flatCard, imp, exp, year.cl).total;
    const amberCost = (imp, exp) => Amber.amberCardCost(year, model, imp, exp, year.cl).total;

    // What the meter would have shown with a battery: storing solar on a flat plan, or chasing Amber's prices.
    const selfUse = Amber.simulateBattery(year, truth, flatPrices, battery);
    const onAmber = Amber.simulateBattery(year, truth, amberPrices, battery);
    const readings = (sim) => Object.assign({}, year, { imp: sim.imp, exp: sim.exp });
    const none = Amber.plannerDetectExisting(year, cosZ);
    const quiet = Amber.plannerDetectExisting(readings(selfUse), cosZ);
    const dark = Amber.plannerDetectExisting(readings(onAmber), cosZ);
    assert(!none.battery && none.solarKw >= 5 && none.solarKw <= 12, `no battery in plain readings; panels guessed at ${none.solarKw} kW`);
    assert(quiet.battery && quiet.reason === 'quiet' && dark.battery && dark.reason === 'dark',
        `a battery is spotted from quiet nights (${quiet.quietNights} nights) and from selling after dark (${dark.darkDays} days)`);

    const opts = { kwh: 10, kw: 5, rte: 0.9, solarKw: 8, pv, cosZ };
    const back = Amber.plannerUnwindBattery(readings(selfUse), opts);
    const off = (a, b) => Math.abs(a / b - 1);
    assert(off(total(back.year.imp), total(truth.imp)) < 0.1 && off(total(back.year.exp), total(truth.exp)) < 0.1,
        `storing solar: readings without it rebuilt (bought ${total(back.year.imp).toFixed(0)} vs ${total(truth.imp).toFixed(0)} kWh, sent out ${total(back.year.exp).toFixed(0)} vs ${total(truth.exp).toFixed(0)})`);
    const again = Amber.simulateBattery(back.year, Amber.plannerFlows(back.year, {}), Amber.plannerBatteryPrices(back.year, flat, flatCard, model), battery);
    const real = flatCost(selfUse.imp, selfUse.exp);
    const redone = flatCost(again.imp, again.exp);
    assert(off(redone, real) < 0.05, `storing solar: run again on its plan, $${redone.toFixed(0)} vs $${real.toFixed(0)} from the readings`);

    const backA = Amber.plannerUnwindBattery(readings(onAmber), opts);
    let darkLeft = 0;
    let visible = 0; // what it sold outside the panels' hours (at midday it looks just like solar)
    for (let i = 0; i < year.n; i++) {
        if (cosZ[i] < -0.05) darkLeft += backA.year.exp[i];
        if (!pv[i]) visible += Math.max(0, onAmber.exp[i] - truth.exp[i]);
    }
    assert(darkLeft < 1 && backA.stats.toGrid > 0.9 * visible, `Amber battery: its selling outside the panels' hours is taken out (${backA.stats.toGrid.toFixed(0)} of ${visible.toFixed(0)} kWh found)`);
    const againA = Amber.simulateBattery(backA.year, Amber.plannerFlows(backA.year, {}), Amber.plannerBatteryPrices(backA.year, amberPlan, null, model), battery);
    const realA = amberCost(onAmber.imp, onAmber.exp);
    const redoneA = amberCost(againA.imp, againA.exp);
    assert(Math.abs(redoneA - realA) < Math.max(60, 0.1 * Math.abs(realA)), `Amber battery: run again on Amber, $${redoneA.toFixed(0)} vs $${realA.toFixed(0)} from the readings`);
    // The point: on another plan the battery behaves differently. Replaying Amber's pattern on a flat
    // plan overstates its bill; running the battery afresh gets close to what it would really do there.
    const replay = flatCost(onAmber.imp, onAmber.exp);
    const fresh = Amber.simulateBattery(backA.year, Amber.plannerFlows(backA.year, {}), Amber.plannerBatteryPrices(backA.year, flat, flatCard, model), battery);
    const freshCost = flatCost(fresh.imp, fresh.exp);
    assert(replay - freshCost > 50 && off(freshCost, real) < 0.08,
        `Amber battery moved to a flat plan: replayed $${replay.toFixed(0)}, run afresh $${freshCost.toFixed(0)}, really about $${real.toFixed(0)}`);

    // The export limit is measured against what the meter sent out (not the solar the old battery
    // soaked up), and a battery stores what the limit would otherwise throw away.
    const meterExp = readings(selfUse).exp;
    const big = Amber.plannerFlows(back.year, { solar: pv.map((x) => x * 2), exportLimitKw: 5 });
    const run = Amber.simulateBattery(back.year, big, Amber.plannerBatteryPrices(back.year, flat, flatCard, model), battery);
    let over = 0;
    for (let i = 0; i < year.n; i++) over = Math.max(over, run.exp[i] - Math.max(2.5, meterExp[i]));
    assert(back.year.meterExp === meterExp && over < 1e-9 && run.limited > 0,
        `never more than the 5 kW limit (or what the meter already sent) goes to the grid; ${run.limited.toFixed(0)} kWh is lost to the limit`);
    // Zero export allowed: spare midday solar can only go into the battery (on a flat plan, with no
    // reason to charge from the grid). Capping first would have thrown it all away.
    const spareArr = new Float64Array(year.n);
    for (let i = 0; i < year.n; i++) { const h = i % 48; if (h >= 20 && h < 28) spareArr[i] = 2; }
    const zeroExport = { imp: truth.imp, exp: new Float64Array(year.n), expRaw: spareArr, cl: truth.cl, expCap: new Float64Array(year.n) };
    const flatPrices0 = Amber.plannerBatteryPrices(year, flat, flatCard, model);
    const stored = Amber.simulateBattery(year, zeroExport, flatPrices0, battery);
    const thrown = Amber.simulateBattery(year, Object.assign({}, zeroExport, { expRaw: null }), flatPrices0, battery);
    assert(stored.charged > 3000 && thrown.charged < 1 && stored.exp.every((v) => v === 0) && near(stored.limited + stored.charged, total(spareArr), 1e-6)
        && flatCost(stored.imp, stored.exp) < flatCost(thrown.imp, thrown.exp) - 300,
        `zero export: the battery stores ${stored.charged.toFixed(0)} kWh of solar the limit would have thrown away, and nothing reaches the grid`);

    pending.push((async () => {
        const ctx = { year: back.year, plans: [flat, amberPlan], state: 'NSW', amberModel: model, solarSizes: [0], batterySizes: [0, 5], existing: { kwh: 10, kw: 5 }, battery: { rte: 0.9 } };
        const res = await Amber.plannerSearch(ctx);
        assert(res.rows.length === 4 && res.rows.every((r) => r.battery), `with a battery already: every option runs it, new or not (${res.rows.length} rows)`);
        const now = res.rows.find((r) => r.plan === 'Flat' && r.batteryKwh === 0);
        assert(near(now.bill, Amber.plannerEvaluate(res.prep, 'Flat', 0, 0).cost.total, 1e-6) && res.prep.batteryOf(5).kwh === 15 && res.prep.batteryOf(5).kw === 7.5,
            'a new 5 kWh battery adds to the 10 kWh one (15 kWh, 7.5 kW)');
        const check = Amber.plannerExistingCheck(res.prep, 'Flat', readings(selfUse));
        assert(near(check.readings.bill, real, 1e-6) && off(check.modelled.bill, real) < 0.05 && check.without.bill > check.modelled.bill + 300,
            `the check: readings $${check.readings.bill.toFixed(0)}, planner's battery $${check.modelled.bill.toFixed(0)}, without it $${check.without.bill.toFixed(0)}`);
    })());
}

Promise.all(pending).then(finish, (err) => { console.error(err); failed += 1; finish(); });

function finish() {
    if (failed) {
        console.error(`${failed} planner test(s) failed`);
        process.exit(1);
    }
    console.log('planner tests passed');
}
