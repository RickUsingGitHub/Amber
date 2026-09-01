'use strict';

require('../js/constants.js');
require('../js/time.js');
require('../js/templates.js');
require('../js/costs.js');
require('../js/api.js');
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

const clockItem = { nemTime: '2026-01-15T16:00:00+10:00', processedTime: true };
const clockA = Amber.clockPartsForItem(clockItem, vicLocal, 'VIC');
const clockB = Amber.clockPartsForItem(clockItem, vicLocal, 'VIC');
assert(clockA === clockB, 'clock parts are cached on the usage item');
assert(clockA.hours === 17, 'cached Melbourne DST hour is 17');
assert(Amber.APP_VERSION === '1.01', 'app version is 1.01');

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

assert(Amber.RATES_ARE_GST_INCLUSIVE === true, 'all rates are GST-inclusive');
assert(Math.abs(Amber.adjustForGst(110, true, false) - 110) < 1e-9, 'inc GST leaves cost unchanged');
assert(Math.abs(Amber.adjustForGst(110, false, false) - 100) < 1e-9, 'ex GST display divides by 1.1');
assert(Math.abs(Amber.adjustForGst(110, false, true) - 110) < 1e-9, 'FIT skips GST strip');

const dmo = Amber.supplierTemplates.NSW['2026-27 DMO (Ausgrid)'];
assert(dmo && dmo.daily === 166 && dmo.flat === 33.14, 'DMO Ausgrid GST-inc published rates');
const vdo = Amber.supplierTemplates.VIC['2026-27 VDO (CitiPower)'];
assert(vdo && vdo.daily === 121.14 && vdo.flat === 25.96, 'VDO CitiPower GST-inc published rates');

const thirtyDates = [];
for (let i = 1; i <= 30; i++) thirtyDates.push(`2026-07-${String(i).padStart(2, '0')}`);
const thirtyRanges = Amber.buildFetchRanges(thirtyDates);
assert(thirtyRanges.length === 1 && thirtyRanges[0].start === '2026-07-01' && thirtyRanges[0].end === '2026-07-30', '30-day usage chunk');
const thirtyOneDates = thirtyDates.concat(['2026-07-31']);
const splitRanges = Amber.buildFetchRanges(thirtyOneDates);
assert(splitRanges.length === 2 && splitRanges[0].end === '2026-07-30' && splitRanges[1].start === '2026-07-31', '31 days split into two chunks');

assert(Amber.FETCH_SITES_TIMEOUT_MS > 0 && Amber.FETCH_SITES_TIMEOUT_MS <= Amber.FETCH_TIMEOUT_MS, 'sites timeout is finite and not longer than usage');

if (failed) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll unit tests passed');
