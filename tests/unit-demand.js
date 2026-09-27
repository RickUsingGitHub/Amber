'use strict';

require('../js/constants.js');
require('../js/time.js');
require('../js/costs.js');
require('../js/api.js');
const Amber = global.Amber;

let failed = 0;
function assert(cond, message) {
    if (!cond) { failed += 1; console.error('FAIL:', message); } else { console.log('ok:', message); }
}
const near = (a, b) => Math.abs(a - b) < 1e-6;

// Two months of demand-window data: one 8 kW spike in July, 2 kW otherwise.
function demandData() {
    const items = [];
    const add = (date, kwh) => items.push({
        nemTime: `${date}T18:00:00+10:00`, date, kwh, perKwh: 30, duration: 30, channelIdentifier: 'E1',
        tariffInformation: { demandWindow: true }
    });
    for (let d = 1; d <= 31; d++) add(`2026-07-${String(d).padStart(2, '0')}`, d === 10 ? 4 : 1);
    for (let d = 1; d <= 31; d++) add(`2026-08-${String(d).padStart(2, '0')}`, 1);
    const ct = { E1: Amber.emptyChannel({ identifier: 'E1', type: 'general' }) };
    Amber.processUsageData(items, ct, true);
    return ct;
}

const ct = demandData();
const amber = Amber.calculateDemandTariff(ct, 40);
// July: 8 kW × $0.40 × 31 = 99.20; August: 2 kW × $0.40 × 31 = 24.80
assert(near(amber.cost, 124), `Amber demand is per month (got ${amber.cost.toFixed(2)}, want 124.00)`);
assert(amber.months.length === 2 && near(amber.months[0].maxDemandKwh * 2, 8) && near(amber.months[1].maxDemandKwh * 2, 2), 'each month keeps its own peak');
assert(near(amber.maxDemandKwh * 2, 8) && amber.demandDays === 62, 'overall peak and demand days');

const { monthlyDemandInfo } = Amber.precalculateDailySummaries(ct, { rateType: 'flat', flat: 30 }, { demandCents: 40, connectionCents: 0, subscriptionCents: 0 }, 'NSW');
const calendarSum = Object.values(monthlyDemandInfo).reduce((s, m) => s + m.amber.cost, 0);
assert(near(calendarSum, amber.cost), 'Results table and calendar demand agree');

const plan = { rateType: 'flat', flat: 30, demand: { e: true, r: 50, s: '17:00', f: '20:00', days: [0, 1, 2, 3, 4, 5, 6] } };
const other = Amber.calculateOtherDemandTariff(ct, '2026-07-15', '2026-08-31', plan, 'NSW');
// July clipped to 15–31 Jul (17 days): the 8 kW spike was 10 Jul, so July's peak in range is still from data (data spans the month).
const july = other.months.find((m) => m.month === '2026-07');
const aug = other.months.find((m) => m.month === '2026-08');
assert(july.days === 17 && aug.days === 31, `competitor demand days clipped to range (Jul ${july.days}, Aug ${aug.days})`);
assert(near(other.cost, july.cost + aug.cost) && near(aug.cost, 2 * 0.5 * 31), 'competitor demand summed per month');

const single = Amber.calculateDemandTariff({ E1: { type: 'general', usageData: ct.E1.usageData.filter((i) => i.date < '2026-08-01') } }, 40);
assert(near(single.cost, 8 * 0.4 * 31) && !single.months, 'single month unchanged');

// Local-time helpers
const TZ = 'Australia/Sydney';
assert(Amber.localWallToNemIso('2026-01-15', 18, 0, TZ) === '2026-01-15T17:00:00+10:00', '18:00 AEDT is 17:00 NEM');
assert(Amber.localWallToNemIso('2026-07-15', 18, 0, TZ) === '2026-07-15T18:00:00+10:00', '18:00 AEST is 18:00 NEM');
const halfHour = { nemTime: '2026-01-15T17:29:59+10:00', processedTime: true, duration: 30, kwh: 0.5 };
const slots = Amber.intervalLocalSlots(halfHour, 5, TZ);
assert(slots.length === 6 && near(slots.reduce((s, x) => s + x.fraction, 0), 1), '30-min reading spread over six 5-min slots');
assert(slots[0].parts.hours === 18 && slots[0].parts.minutes === 0 && slots[5].parts.minutes === 25, 'NEM 17:00–17:30 is 18:00–18:30 local in summer');

// Fetch chunks across the April DST change stay 7 days
const dates = [];
for (let d = 0; d < 14; d++) dates.push(Amber.addDays('2026-04-01', d));
const ranges = Amber.buildFetchRanges(dates, 7);
assert(ranges.length === 2 && ranges[0].end === '2026-04-07', `DST-safe 7-day chunks (got ${JSON.stringify(ranges)})`);

if (failed) { console.error(`${failed} demand/time test(s) failed`); process.exit(1); }
console.log('demand/time tests passed');
