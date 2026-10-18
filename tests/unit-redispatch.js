'use strict';

require('../js/constants.js');
require('../js/time.js');
require('../js/templates.js');
require('../js/costs.js');
require('../js/monthly.js');
require('../js/redispatch.js');
const Amber = global.Amber;

let failed = 0;
function assert(cond, message) {
    if (!cond) { failed += 1; console.error('FAIL:', message); } else { console.log('ok:', message); }
}
const near = (a, b, tol) => Math.abs(a - b) < (tol || 1e-6);
const pad = (n) => String(n).padStart(2, '0');

// One day of 30-minute data in NEM time (October 2026: Sydney is UTC+11, NEM +10).
// genAt/expAt: map "HH:MM" (local interval start) -> kWh.
function dayData(dateStr, genAt, expAt) {
    const items = [];
    for (let i = 0; i < 48; i++) {
        // Local start time h:m; NEM end time = local start + 30 min - 1 h (DST).
        const startMin = i * 30;
        const local = `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}`;
        const nemEndMs = Date.parse(`${dateStr}T00:00:00+11:00`) + (startMin + 30) * 60000;
        const nemTime = Amber.msToNemIso(nemEndMs);
        items.push({ nemTime, kwh: (genAt && genAt[local]) || 0, perKwh: 20, channelIdentifier: 'E1', duration: 30 });
        items.push({ nemTime, kwh: (expAt && expAt[local]) || 0, perKwh: -10, channelIdentifier: 'B1', duration: 30 });
    }
    return items;
}

function channels(items) {
    const ct = {
        E1: Amber.emptyChannel({ identifier: 'E1', type: 'general' }),
        B1: Amber.emptyChannel({ identifier: 'B1', type: 'feedIn' })
    };
    Amber.processUsageData(items, ct, true);
    return ct;
}

const nsw = Amber.supplierTemplates.NSW;
const solarMax = nsw['CovaU SolarMax (Ausgrid, TOU)'];
const sso = nsw['Solar Sharer Offer (Ausgrid, TOU)'];
const four = nsw['GloBird Four4Free (Ausgrid, TOU)'];
const ovo = nsw['OVO The Free 4 Plan (Ausgrid, TOU)'];

// ---- Period lookup ----
const at = (local, dateStr) => ({
    nemTime: Amber.msToNemIso(Date.parse(`${dateStr || '2026-10-14'}T${local}:00+11:00`) + 60000),
    processedTime: true
});
assert(Amber.otherRateForItem(at('12:00'), 'general', solarMax, 'NSW') === 0, 'SolarMax 12:00 is free');
assert(Amber.otherRateForItem(at('02:00'), 'general', solarMax, 'NSW') === 16.5, 'SolarMax 02:00 is the EV rate');
assert(Amber.otherRateForItem(at('17:00'), 'general', solarMax, 'NSW') === 61.39, 'SolarMax 17:00 is peak');
assert(Amber.otherRateForItem(at('08:00'), 'general', solarMax, 'NSW') === 28.02, 'SolarMax 08:00 is off-peak');
assert(Amber.otherRateForItem(at('19:00'), 'feedIn', solarMax, 'NSW') === 15, 'SolarMax 7pm FIT 15c');
assert(Amber.otherRateForItem(at('13:00'), 'feedIn', solarMax, 'NSW') === 5, 'SolarMax midday FIT 5c');
assert(Amber.otherRateForItem(at('17:00'), 'general', sso, 'NSW') === 27.56, 'Solar Sharer has no peak in October');
assert(Amber.otherRateForItem(at('17:00', '2026-12-14'), 'general', sso, 'NSW') === 63.72, 'Solar Sharer peak in December');
assert(Amber.otherRateForItem(at('14:30'), 'general', four, 'NSW') === 0, 'Four4Free 2:30pm is free');
assert(Amber.otherRateForItem(at('14:30'), 'general', solarMax, 'NSW') === 28.02, 'SolarMax 2:30pm is not free');

// ---- Daily caps ----
// 8 kWh in each of six free-window half hours (11:00–14:00) = 48 kWh; SSO cap is 24 kWh.
const midday = {};
['11:00', '11:30', '12:00', '12:30', '13:00', '13:30'].forEach((t) => { midday[t] = 8; });
const capCt = channels(dayData('2026-10-14', midday, { '19:00': 20, '19:30': 20 }));
Amber.calculateOtherSupplierCosts(capCt, sso, 'NSW');
assert(near(capCt.E1.totalOtherCost, 24 * 27.56 / 100), `SSO: 24 kWh free then off-peak (got ${capCt.E1.totalOtherCost.toFixed(4)})`);
Amber.calculateOtherSupplierCosts(capCt, solarMax, 'NSW');
assert(near(capCt.E1.totalOtherCost, 0), 'SolarMax: 48 kWh is under its 50 kWh cap');
assert(near(capCt.B1.totalOtherCost, -(30 * 15 + 10 * 5) / 100), 'SolarMax FIT: 30 kWh at 15c then 5c');
Amber.calculateOtherSupplierCosts(capCt, ovo, 'NSW');
assert(near(capCt.E1.totalOtherCost, 0), 'OVO Free 4 has no cap');

const breakdown = Amber.channelPeriodBreakdown(capCt.E1, sso, 'NSW');
const freeRow = breakdown.find((r) => r.period === 'free');
const overRow = breakdown.find((r) => r.period === 'freeOverCap');
assert(freeRow && near(freeRow.kwh, 24) && overRow && near(overRow.kwh, 24) && overRow.rate === 27.56, 'breakdown splits free and over-cap kWh');
const fitRows = Amber.channelPeriodBreakdown(capCt.B1, solarMax, 'NSW');
assert(fitRows.some((r) => r.period === 'feedInOverCap' && near(r.kwh, 10)), 'breakdown shows feed-in over cap');

const daily = Amber.precalculateDailySummaries(capCt, sso, { demandCents: 0, connectionCents: 0, subscriptionCents: 0 }, 'NSW');
const dayOther = Object.values(daily.summaries).reduce((s, d) => s + d.otherCost, 0);
assert(near(dayOther, 24 * 27.56 / 100), 'calendar costs honour the cap too');

// A second day resets the cap.
const twoDays = channels(dayData('2026-10-14', midday).concat(dayData('2026-10-15', midday)));
Amber.calculateOtherSupplierCosts(twoDays, sso, 'NSW');
assert(near(twoDays.E1.totalOtherCost, 2 * 24 * 27.56 / 100), 'cap is per day');

// ---- Re-dispatch ----
// 10 kWh at 7pm (peak), 0.1 kWh in each free half hour, 5 kWh battery export at 10pm.
const smallMidday = {};
['11:00', '11:30', '12:00', '12:30', '13:00', '13:30'].forEach((t) => { smallMidday[t] = 0.1; });
const evening = Object.assign({ '19:00': 10 }, smallMidday);
const base = channels(dayData('2026-10-14', evening, { '22:00': 5 }));
const before = JSON.stringify(base);
const re = Amber.redispatchForPlan(base, solarMax, 'NSW', { budgetKwh: 20, rte: 90, windowKw: 13, exportKw: 5 });
assert(JSON.stringify(base) === before, 're-dispatch leaves the original data alone');
const s = re.summary;
assert(near(s.shiftedKwh, 10), `peak use shifted into the free window (${s.shiftedKwh})`);
assert(near(s.retimedKwh, 5), 'battery export moved into 6–9pm');
assert(near(s.extraExportKwh, 10), `extra export uses the rest of the budget (${s.extraExportKwh})`);
const gen = re.channels.E1.usageData;
const genKwh = (local) => gen.find((item) => Amber.getClockParts(item.nemTime, { clock: 'local', timeZone: 'Australia/Sydney' }).hours === parseInt(local, 10)).kwh;
assert(near(genKwh('19'), 0), 'no grid use left at 7pm');
assert(near(re.channels.E1.totalKWh, 0.6 + 10 / 0.9 + 10 / 0.9), 'window import includes round-trip losses');
assert(near(re.channels.B1.totalKWh, 15), 'exports: 5 moved + 10 extra');
const priced = (ct) => Amber.computePlanTotals(ct, solarMax, { startDateStr: '2026-10-14', endDateStr: '2026-10-14', numDays: 1, state: 'NSW' }).otherTotal;
assert(priced(re.channels) < priced(base), 're-timed day costs less');
// SolarMax: supply 1.52, no usage cost, -15 kWh × 15c.
assert(near(priced(re.channels), 1.52 - 15 * 0.15), `re-timed day priced as expected (${priced(re.channels).toFixed(4)})`);

const zero = Amber.redispatchForPlan(base, solarMax, 'NSW', { budgetKwh: 0, rte: 90, windowKw: 13, exportKw: 5 });
assert(near(zero.summary.shiftedKwh, 0) && near(zero.summary.redirectedKwh, 5), 'zero budget: battery export covers peak use instead');
assert(near(zero.channels.E1.totalKWh, 0.6 + 5), 'zero budget leaves 5 kWh at peak');

// Window import limited by the daily cap and the import power limit.
const big = Object.assign({ '19:00': 80 }, smallMidday);
const capped = Amber.redispatchForPlan(channels(dayData('2026-10-14', big)), sso, 'NSW', { budgetKwh: 200, rte: 100, windowKw: 13, exportKw: 5 });
assert(near(capped.summary.addedWindowImportKwh, 24 - 0.6), `SSO window filled only to its 24 kWh cap (${capped.summary.addedWindowImportKwh})`);
const limited = Amber.redispatchForPlan(channels(dayData('2026-10-14', big)), ovo, 'NSW', { budgetKwh: 200, rte: 100, windowKw: 5, exportKw: 5 });
assert(near(limited.summary.addedWindowImportKwh, 5 * 4 - 0.6), 'OVO window limited by import power');

assert(Amber.redispatchForPlan(base, nsw['2026-27 DMO (Ausgrid, TOU)'], 'NSW', { budgetKwh: 10 }) === null, 'plans without a free window are skipped');
assert(Amber.windowHoursOn([{ start: '22:00', end: '02:00', days: [] }], 1, 1) === 4, 'overnight window hours wrap');

// ---- Whole-month table ----
let month = [];
for (let d = 1; d <= 30; d++) month = month.concat(dayData(`2026-11-${pad(d)}`, evening, { '22:00': 5 }));
const monthCt = channels(month);
const table = Amber.batteryShiftTable(monthCt, ['2026-11'], [{ name: 'SolarMax', config: solarMax }], {
    state: 'NSW', gstInclusive: true, budgets: [0, 20], params: { rte: 90, windowKw: 13, exportKw: 5 }
});
const row = table.plans[0];
assert(table.amber.total > 0 && table.months.length === 1, 'Amber total for the month');
assert(row.shifted[1] < row.shifted[0] && row.shifted[0] <= row.metered + 1e-9, 'more budget never costs more');
assert(near(row.shifted[1], 30 * (1.52 - 15 * 0.15)), `month total at 20 kWh/day (${row.shifted[1].toFixed(2)})`);

(async () => {
    const asyncTable = await Amber.batteryShiftTableAsync(monthCt, ['2026-11'], [{ name: 'SolarMax', config: solarMax }], {
        state: 'NSW', gstInclusive: true, budgets: [0, 20], params: { rte: 90, windowKw: 13, exportKw: 5 }
    });
    assert(near(asyncTable.plans[0].shifted[1], row.shifted[1]) && near(asyncTable.amber.total, table.amber.total), 'async table matches the sync one');
    const cancelled = await Amber.batteryShiftTableAsync(monthCt, ['2026-11'], [{ name: 'SolarMax', config: solarMax }], { state: 'NSW' }, () => true);
    assert(cancelled === null, 'async table can be cancelled');

    if (failed) {
        console.error(`${failed} re-dispatch test(s) failed`);
        process.exit(1);
    }
    console.log('re-dispatch tests passed');
})();
