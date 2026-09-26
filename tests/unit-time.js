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
assert(Amber.APP_VERSION === '1.22', 'app version is 1.22');
assert(Amber.DEFAULT_AMBER_CONNECTION_CENTS === 116.787, 'Amber daily connection default');
assert(Amber.DEFAULT_AMBER_SUBSCRIPTION_CENTS === 82.181, 'Amber subscription default');
assert(Amber.DEFAULT_AMBER_DEMAND_CENTS === 42.345, 'Amber demand default');
assert(Amber.intervalEndInWindow({ timeValue: 1200 }, '10:00', '15:00') === true, 'noon is midday export window');
assert(Amber.intervalEndInWindow({ timeValue: 1000 }, '10:00', '15:00') === false, '10:00 end is before midday window');
assert(Amber.intervalEndInWindow({ timeValue: 1500 }, '10:00', '15:00') === true, '15:00 end is last midday interval');
assert(Amber.intervalEndInWindow({ timeValue: 1605 }, '10:00', '15:00') === false, '16:05 is not midday');

const fitChannel = {
    type: 'feedIn',
    tariff: 'EA029',
    usageData: [{
        nemTime: '2026-08-20T12:00:00+10:00',
        processedTime: true,
        kwh: 233.12,
        perKwh: -1.643
    }]
};
const fitSite = { network: 'Ausgrid', channels: [{ type: 'feedIn', tariff: 'EA029' }] };
const settled = Amber.settleAmberFeedIn(fitChannel, fitSite, 31);
assert(settled && Math.abs(settled.middayKwh - 233.12) < 1e-6, 'midday kWh from interval end');
assert(Math.abs(settled.freeKwh - 6.83 * 31) < 1e-6, 'BEL is 6.83 kWh times 31 days');
assert(settled.cost < settled.intervalCost, 'free midday allowance increases the solar credit');
assert(Math.abs(settled.cost - (settled.intervalCost - settled.addBack)) < 1e-9, 'settled cost is interval minus BEL add-back');
assert(Math.abs(settled.chargedKwh - (233.12 - 6.83 * 31)) < 1e-6, 'export charge kWh is midday above BEL');
assert(Math.abs(settled.charge - settled.chargedKwh * 1.3552 / 100) < 1e-9, 'export charge uses EA029 GST-inc rate');
const totals = {
    E1: { type: 'general', totalAmberCost: 85.56, amberExportCharge: 0 },
    B1: fitChannel
};
fitChannel.totalAmberCost = 0;
Amber.applyAmberFeedInSettlement(totals, fitSite, 31);
assert(Math.abs(totals.E1.amberExportCharge - settled.charge) < 1e-9, 'export charge is added to general usage');
assert(Math.abs(totals.E1.totalAmberCost - (85.56 + settled.charge)) < 1e-9, 'general Amber total includes export charge');
const noTariff = Amber.settleAmberFeedIn({
    type: 'feedIn',
    usageData: [{ nemTime: '2026-08-20T12:00:00+10:00', processedTime: true, kwh: 1, perKwh: -10 }]
}, { network: 'Unknown' }, 31);
assert(noTariff == null, 'no two-way tariff leaves interval FIT unchanged');
assert(Amber.formatCentsPerKwh(60.2) === '(60.2c/kWh) ', 'format peak rate');
assert(Amber.formatCentsPerKwh(28) === '(28c/kWh) ', 'format whole-cent rate');
assert(Amber.canonicalNetwork('Ausgrid') === 'ausgrid', 'canonical Ausgrid');
assert(Amber.canonicalNetwork('Endeavour Energy') === 'endeavour', 'canonical Endeavour');
assert(Amber.planMatchesNetwork('Red Energy Living Energy Saver (Ausgrid, Flat)', {}, 'Ausgrid') === true, 'Ausgrid plan matches Ausgrid site');
assert(Amber.planMatchesNetwork('Red Energy Living Energy Saver (Endeavour, Flat)', {}, 'Ausgrid') === false, 'Endeavour plan hidden on Ausgrid');
assert(Amber.planMatchesNetwork('Aurora Single Rate (Tariff 32, Flat)', {}, 'Ausgrid') === true, 'statewide plan still shown');
assert(Amber.hintPlanForNetwork('Ausgrid') === '2026-27 DMO (Ausgrid, Flat)', 'hint DMO for Ausgrid');
assert(Amber.planListLabel('Red Energy Living Energy Saver (Ausgrid, Flat)', 'Ausgrid') === 'Red Energy Living Energy Saver (Flat)', 'dropdown hides known network');
assert(Amber.planListLabel('Red Energy Living Energy Saver (Ausgrid, TOU)', 'Ausgrid') === 'Red Energy Living Energy Saver (TOU)', 'TOU label without network');

const touItem = { nemTime: '2026-08-12T17:30:00+10:00', processedTime: true, kwh: 2, perKwh: 20 };
const dmoTou = Amber.supplierTemplates.NSW['2026-27 DMO (Ausgrid, TOU)'];
assert(Amber.getTouPeriod(Amber.clockPartsForItem(touItem, dmoTou, 'NSW'), dmoTou.tou, 0).period === 'peak', '17:30 is DMO Ausgrid peak');
const offItem = { nemTime: '2026-08-12T10:00:00+10:00', processedTime: true, kwh: 1, perKwh: 10 };
assert(Amber.getTouPeriod(Amber.clockPartsForItem(offItem, dmoTou, 'NSW'), dmoTou.tou, 0).period === 'offpeak', '10:00 is DMO Ausgrid off-peak');
const ch = {
    type: 'general',
    usageData: [
        { nemTime: '2026-08-12T17:30:00+10:00', processedTime: true, kwh: 2, perKwh: 20 },
        { nemTime: '2026-08-12T10:00:00+10:00', processedTime: true, kwh: 1, perKwh: 10 }
    ]
};
const broken = Amber.channelPeriodBreakdown(ch, dmoTou, 'NSW');
assert(broken.length === 2, 'TOU breakdown has peak and off-peak rows');
const peakRow = broken.find((r) => r.period === 'peak');
assert(peakRow && peakRow.kwh === 2 && Math.abs(peakRow.otherCost - (2 * 60.20) / 100) < 1e-9, 'peak kWh and Red-style TOU cost');
assert(peakRow.rate === 60.2, 'peak row carries the TOU rate');
const redSaver = Amber.supplierTemplates.NSW['Red Energy Living Energy Saver (Ausgrid, Flat)'];
assert(redSaver && redSaver.daily === 122.5 && redSaver.flat === 28.0, 'Red Living Energy Saver Ausgrid Flat current inc-GST rates');
const redTou = Amber.supplierTemplates.NSW['Red Energy Living Energy Saver (Ausgrid, TOU)'];
assert(redTou && redTou.rateType === 'tou' && redTou.daily === 116.5 && redTou.tou.peak.rate === 44, 'Red Living Energy Saver Ausgrid TOU');
const redEnd = Amber.supplierTemplates.NSW['Red Energy Living Energy Saver (Endeavour, Flat)'];
assert(redEnd && redEnd.daily === 140.73 && redEnd.flat === 29.46, 'Red Living Energy Saver Endeavour Flat current inc-GST rates');
const essential = Amber.supplierTemplates.NSW['2026-27 DMO (Essential Energy, Flat)'];
assert(essential && essential.daily === 272 && essential.flat === 35.01, 'DMO Essential 2026-27 tariff cap');
const ovo = Amber.supplierTemplates.VIC['OVO The One Plan (CitiPower, Flat)'];
assert(ovo && ovo.daily === 90.30 && ovo.flat === 19.35, 'OVO The One Plan CitiPower Flat current rates');

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

const dmo = Amber.supplierTemplates.NSW['2026-27 DMO (Ausgrid, Flat)'];
assert(dmo && dmo.daily === 166 && dmo.flat === 33.14, 'DMO Ausgrid GST-inc published rates');
const vdo = Amber.supplierTemplates.VIC['2026-27 VDO (CitiPower, Flat)'];
assert(vdo && vdo.daily === 121.14 && vdo.flat === 25.96, 'VDO CitiPower GST-inc published rates');

const sevenDates = [];
for (let i = 1; i <= 7; i++) sevenDates.push(`2026-07-${String(i).padStart(2, '0')}`);
const sevenRanges = Amber.buildFetchRanges(sevenDates);
assert(sevenRanges.length === 1 && sevenRanges[0].start === '2026-07-01' && sevenRanges[0].end === '2026-07-07', '7-day usage chunk');
const eightDates = sevenDates.concat(['2026-07-08']);
const splitRanges = Amber.buildFetchRanges(eightDates);
assert(splitRanges.length === 2 && splitRanges[0].end === '2026-07-07' && splitRanges[1].start === '2026-07-08', '8 days split into two 7-day max chunks');

assert(Amber.FETCH_SITES_TIMEOUT_MS > 0 && Amber.FETCH_SITES_TIMEOUT_MS <= Amber.FETCH_TIMEOUT_MS, 'sites timeout is finite and not longer than usage');

if (failed) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll unit tests passed');
