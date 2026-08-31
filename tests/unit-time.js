'use strict';

require('../js/constants.js');
require('../js/time.js');
require('../js/costs.js');
const Amber = global.Amber;

let failed = 0;
function assert(cond, message) {
    if (!cond) {
        failed += 1;
        console.error('FAIL:', message);
    } else {
        console.log('ok:', message);
    }
}

assert(Amber.inclusiveDayCount('2025-01-01', '2025-01-15') === 15, 'inclusive day count 15');
assert(Amber.addDays('2025-01-10', -6) === '2025-01-04', 'addDays backward');

const adjusted = Amber.adjustNemTime('2025-01-02T00:00:00+10:00');
assert(adjusted.startsWith('2025-01-01T23:59:59'), 'midnight NEM interval buckets to previous day');

const itemPeak = { nemTime: '2026-01-07T17:30:00+10:00', processedTime: true };
const touPlan = {
    rateType: 'tou',
    clock: 'nem',
    tou: {
        peak: { rate: 50, windows: [{ start: '17:00', end: '21:00', days: [1, 2, 3, 4, 5] }] },
        offpeak: { rate: 20 }
    }
};
assert(Amber.otherRateForItem(itemPeak, 'general', touPlan, 'NSW') === 50, 'NEM peak window at 17:30 weekday');

const itemOff = { nemTime: '2026-01-07T10:00:00+10:00', processedTime: true };
assert(Amber.otherRateForItem(itemOff, 'general', touPlan, 'NSW') === 20, 'NEM off-peak at 10:00');

const itemWeekend = { nemTime: '2026-01-10T17:30:00+10:00', processedTime: true };
assert(Amber.otherRateForItem(itemWeekend, 'general', touPlan, 'NSW') === 20, 'weekend is off-peak');

const aurora = {
    rateType: 'tou',
    clock: 'nem',
    tou: {
        peak: {
            rate: 36.1878,
            windows: [
                { start: '07:00', end: '10:00', days: [1, 2, 3, 4, 5] },
                { start: '16:00', end: '21:00', days: [1, 2, 3, 4, 5] }
            ]
        },
        offpeak: { rate: 17.02 }
    }
};
assert(Amber.otherRateForItem({ nemTime: '2026-01-07T08:00:00+10:00', processedTime: true }, 'general', aurora, 'TAS') === 36.1878, 'Aurora morning peak');
assert(Amber.otherRateForItem({ nemTime: '2026-01-07T12:00:00+10:00', processedTime: true }, 'general', aurora, 'TAS') === 17.02, 'Aurora midday off-peak');

const vicLocal = {
    rateType: 'tou',
    clock: 'local',
    timeZone: 'Australia/Melbourne',
    tou: {
        peak: { rate: 47.64, windows: [{ start: '16:00', end: '21:00', days: [0, 1, 2, 3, 4, 5, 6] }] },
        offpeak: { rate: 22.6 }
    }
};
// 16:00 NEM (+10) in January is 17:00 Melbourne (AEDT) — still inside 16:00-21:00 local peak
assert(Amber.otherRateForItem({ nemTime: '2026-01-15T16:00:00+10:00', processedTime: true }, 'general', vicLocal, 'VIC') === 47.64, 'VIC local DST peak');
// 15:00 NEM (+10) in January is 16:00 Melbourne — start of peak
assert(Amber.otherRateForItem({ nemTime: '2026-01-15T15:00:00+10:00', processedTime: true }, 'general', vicLocal, 'VIC') === 47.64, 'VIC local DST peak at 16:00 local');
// 14:30 NEM (+10) in January is 15:30 Melbourne — off-peak
assert(Amber.otherRateForItem({ nemTime: '2026-01-15T14:30:00+10:00', processedTime: true }, 'general', vicLocal, 'VIC') === 22.6, 'VIC local DST off-peak');

const flatCl = { rateType: 'flat', flat: 36, cl: 18, feedIn: 5 };
assert(Amber.otherRateForItem({ nemTime: '2026-01-07T12:00:00+10:00', processedTime: true }, 'controlledLoad', flatCl, 'NSW') === 18, 'flat plan uses dedicated CL rate');
assert(Amber.otherRateForItem({ nemTime: '2026-01-07T12:00:00+10:00', processedTime: true }, 'general', flatCl, 'NSW') === 36, 'flat general rate');

const waFit = {
    rateType: 'flat',
    flat: 33,
    feedIn: 2,
    feedInWindows: [{ rate: 10, start: '15:00', end: '21:00', days: [0, 1, 2, 3, 4, 5, 6] }],
    clock: 'nem'
};
assert(Amber.otherRateForItem({ nemTime: '2026-01-07T16:00:00+10:00', processedTime: true }, 'feedIn', waFit, 'WA') === 10, 'WA peak FIT');
assert(Amber.otherRateForItem({ nemTime: '2026-01-07T11:00:00+10:00', processedTime: true }, 'feedIn', waFit, 'WA') === 2, 'WA off-peak FIT');

const channels = {
    E1: {
        identifier: 'E1',
        type: 'general',
        usageData: [
            { nemTime: '2026-01-07T17:05:00+10:00', processedTime: true, kwh: 1, perKwh: 20 }
        ]
    }
};
Amber.calculateOtherSupplierCosts(channels, touPlan, 'NSW');
assert(Math.abs(channels.E1.totalOtherCost - 0.5) < 1e-9, 'TOU cost 1 kWh at 50c = $0.50');

if (failed) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll unit tests passed');
