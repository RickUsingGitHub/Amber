'use strict';

require('../js/constants.js');
require('../js/time.js');
require('../js/costs.js');
require('../js/bill.js');
require('../js/monthly.js');
const Amber = global.Amber;

let failed = 0;
function assert(cond, message) {
    if (!cond) { failed += 1; console.error('FAIL:', message); } else { console.log('ok:', message); }
}
const near = (a, b, tol) => Math.abs(a - b) < (tol || 1e-6);

const billText = `Understand your bill
Plan: Amber Core
Billing Period: 31 days (01/07/2025 - 31/07/2025)
CHARGES SUMMARY
Usage 744.00 kWh 0.2000 $/kWh $148.80
Network Daily Supply Charges 31 days 1.1397 $/Day $35.33
Network Demand Charges $24.48
Amber Monthly Subscription $23.16
GST - 10% $23.18
CHARGES TOTAL $254.95
Network - Peak Demand 01 Jul - 31 Jul 2.00 kW 12.2397 $/kW/Day $24.48
Network - Daily 01 Jul - 31 Jul 31 0.7103 $22.02
Metering Charge 01 Jul - 31 Jul 31 0.4294 $13.31
Daily Supply Totals (excl GST): $35.33
Amber Monthly Subscription 01 Jul - 31 Jul 31 0.7471 $23.16
Amber Fee Totals (excl GST): $23.16
Solar Feed-in 120.5 kWh -$6.02
`;

const parsed = Amber.parseAmberBillText(billText);
const c = parsed.check;
assert(c.ok && c.start === '2025-07-01' && c.end === '2025-07-31', 'bill period dates');
assert(c.usageKwh === 744 && c.usageCost === 148.8, 'usage kWh and $');
assert(c.demandKw === 2 && c.demandCost === 24.48, 'peak demand kW and $');
assert(c.supplyCost === 35.33 && c.subscriptionCost === 23.16, 'supply and subscription');
assert(c.gst === 23.18 && c.chargesTotal === 254.95, 'GST and charges total');
assert(c.feedInKwh === 120.5 && c.feedInCredit === 6.02, 'feed-in line');

// Meter data that matches the bill: 0.5 kWh every half hour at 22c inc GST; 2 kW demand peak.
function julyData() {
    const items = [];
    for (let d = 1; d <= 31; d++) {
        const date = `2025-07-${String(d).padStart(2, '0')}`;
        const next = d === 31 ? '2025-08-01' : `2025-07-${String(d + 1).padStart(2, '0')}`;
        for (let i = 1; i <= 48; i++) {
            const h = Math.floor(i / 2);
            const nemTime = i === 48 ? `${next}T00:00:00+10:00` : `${date}T${String(h).padStart(2, '0')}:${i % 2 ? '30' : '00'}:00+10:00`;
            const peak = d === 10 && i === 36;
            items.push({ nemTime, date, kwh: peak ? 1 : (d === 10 && i === 35 ? 0 : 0.5), perKwh: 22, duration: 30, channelIdentifier: 'E1', quality: 'billable', tariffInformation: { demandWindow: h >= 15 && h < 21 } });
            items.push({ nemTime, date, kwh: h >= 10 && h < 14 && d <= 15 ? 1.0042 : 0, perKwh: -5, duration: 30, channelIdentifier: 'B1', quality: 'billable' });
        }
    }
    const ct = { E1: Amber.emptyChannel({ identifier: 'E1', type: 'general' }), B1: Amber.emptyChannel({ identifier: 'B1', type: 'feedIn' }) };
    Amber.processUsageData(items, ct, true);
    return ct;
}
const ct = julyData();
const rates = { connectionCents: parsed.connectionCents, subscriptionCents: parsed.subscriptionCents, demandCents: parsed.demandCents };
const totals = Amber.periodTotals(ct, c.start, c.end, { amberRates: rates, state: 'NSW' });
assert(near(totals.importKwh, 744), `meter import ${totals.importKwh}`);
const rows = Amber.compareBill(c, totals);
const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
['usageKwh', 'usageCost', 'demandKw', 'demandCost', 'supplyCost', 'subscriptionCost', 'gst', 'chargesTotal'].forEach((k) => {
    assert(byKey[k] && byKey[k].ok, `${k} matches (bill ${byKey[k] && byKey[k].bill}, meter ${byKey[k] && byKey[k].meter.toFixed(3)})`);
});
assert(byKey.feedInKwh && byKey.feedInKwh.ok, `feed-in kWh matches (${byKey.feedInKwh.meter.toFixed(1)})`);

const wrong = Object.assign({}, c, { usageKwh: 760, demandCost: 35 });
const wrongRows = Object.fromEntries(Amber.compareBill(wrong, totals).map((r) => [r.key, r]));
assert(!wrongRows.usageKwh.ok && !wrongRows.demandCost.ok && wrongRows.supplyCost.ok, 'mismatches are flagged');

// Monthly breakdown: whole calendar months only, each costed like periodTotals for that month
const plan = { rateType: 'flat', flat: 30, feedIn: 5, daily: 100 };
const opts = { amberRates: rates, state: 'NSW', planConfig: plan };
const julyDates = ct.E1.usageData.map((i) => i.date);
assert(Amber.fullMonths(julyDates.concat(['2025-06-30', '2025-08-01', '2025-08-02'])).join() === '2025-07', 'only whole months count');
assert(Amber.fullMonths(julyDates.filter((d) => d !== '2025-07-20')).length === 0, 'a missing day drops the month');
assert(Amber.fullMonths(['2024-02-01'].concat(Array.from({ length: 28 }, (_, i) => `2024-02-${String(i + 1).padStart(2, '0')}`))).length === 0, 'leap February needs 29 days');

const twoMonths = julyData();
const june = [];
for (let d = 1; d <= 30; d++) {
    const date = `2025-06-${String(d).padStart(2, '0')}`;
    const next = d === 30 ? '2025-07-01' : `2025-06-${String(d + 1).padStart(2, '0')}`;
    for (let i = 1; i <= 48; i++) {
        const h = Math.floor(i / 2);
        const nemTime = i === 48 ? `${next}T00:00:00+10:00` : `${date}T${String(h).padStart(2, '0')}:${i % 2 ? '30' : '00'}:00+10:00`;
        june.push({ nemTime, date, kwh: d === 3 && i === 38 ? 2 : 0.4, perKwh: 25, duration: 30, channelIdentifier: 'E1', quality: 'billable', tariffInformation: { demandWindow: h >= 15 && h < 21 } });
        june.push({ nemTime, date, kwh: h >= 10 && h < 14 ? 0.8 : 0, perKwh: -3, duration: 30, channelIdentifier: 'B1', quality: 'billable' });
    }
}
Amber.processUsageData(june, twoMonths, true);
const mb = Amber.monthlyBreakdown(twoMonths, ['2025-06', '2025-07'], opts);
assert(mb.rows.length === 2 && mb.rows[0].days === 30 && mb.rows[1].days === 31 && mb.rows[0].dataDays === 30, 'one row per whole month');
const julyOnly = Amber.periodTotals(ct, '2025-07-01', '2025-07-31', opts);
assert(near(mb.rows[1].amberTotal, julyOnly.amberTotal) && near(mb.rows[1].otherTotal, julyOnly.otherTotal), 'July row matches July costed on its own');
assert(near(mb.rows[0].importKwh, 30 * 48 * 0.4 + 1.6) && mb.rows[0].demandKw > mb.rows[1].demandKw, 'June row has June usage and its own demand peak');
const whole = Amber.periodTotals(twoMonths, '2025-06-01', '2025-07-31', opts);
assert(near(mb.total.amberTotal - mb.total.amberDemand, whole.amberTotal - whole.amberDemand, 1e-6), 'monthly Amber (ex demand) sums to the period');
assert(near(mb.total.otherTotal, whole.otherTotal, 1e-6), 'monthly competitor totals sum to the period');
assert(near(mb.total.amberDemand, whole.amberDemand, 1e-6), 'monthly demand sums match (both per-month)');
assert(Amber.monthlyBreakdown(twoMonths, ['2025-07'], opts).rows.length === 1, 'months not asked for are left out');

// Other date layouts
[['Billing period 1 Jul 2025 - 31 Jul 2025', '2025-07-01', '2025-07-31'],
 ['Bill period: 01 July 2025 to 31 July 2025', '2025-07-01', '2025-07-31'],
 ['Billing Period 1st June 2025 – 30th June 2025', '2025-06-01', '2025-06-30'],
 ['Period 1/7/25 - 31/7/25', '2025-07-01', '2025-07-31'],
 ['Billing Period: 31 days ( 01 / 08 / 2026 - 31 / 08 / 2026 )', '2026-08-01', '2026-08-31'],
 ['Network - Daily 01 Aug - 31 Aug 2026 31 0.7103', '2026-08-01', '2026-08-31'],
 ['Network - Daily 15 Dec - 14 Jan 2026 31 0.7103', '2025-12-15', '2026-01-14']].forEach(([t, a, b]) => {
    const p = Amber.parseBillPeriod(Amber.normalizeBillText(t));
    assert(p.start === a && p.end === b, `period from "${t}"`);
});

// Amber's font: private-use glyphs for brackets and dash (as seen by pdfplumber)
const pua = Amber.normalizeBillText('Billing Period: 31 days \ue08101/08/2026 \ue088 31/08/2026\ue082 Time period: 01/08/2026\ue08931/08/2026');
assert(pua.includes('(01/08/2026 - 31/08/2026)'), `PUA brackets/dash restored (${pua})`);
let pp = Amber.parseBillPeriod(pua);
assert(pp.start === '2026-08-01' && pp.end === '2026-08-31', 'period with PUA dash');
pp = Amber.parseBillPeriod(Amber.normalizeBillText('Due Date 14/09/2026 Time period: 01/08/2026 31/08/2026 Usage'));
assert(pp.start === '2026-08-01' && pp.end === '2026-08-31', 'Time period with space-only separator, ignoring due date');
pp = Amber.parseBillPeriod(Amber.normalizeBillText('Issued 05/09/2026 Paid 06/09/2026'));
assert(!pp.start, 'two unrelated nearby dates (1 day apart) are not a period');

// Export credits table (Aug 2026 bill layout, Amber font dashes)
const credits = Amber.parseAmberBillText(`Time period: 01/08/2026 \ue088 31/08/2026
Usage 900.00 kWh 0.2000 $/kWh $180.00
CHARGES TOTAL $300.00
YOUR EXPORT CREDITS
Charge Description Dates Amount Rate ($/kWh) Credit
Export Reward Energy 01 Aug \ue088 31 Aug 1.25 kWh 0.0401 $0.05
Solar Exports 01 Aug \ue088 31 Aug 44.39 kWh 0.1428 $6.34
Export Totals (excl GST): $6.39`).check;
assert(credits.feedInKwh === 44.39, `solar exports kWh from the Solar Exports row (got ${credits.feedInKwh})`);
assert(credits.feedInCredit === 6.39, 'export credit is the Export Totals line');
assert(credits.exportRewardKwh === 1.25 && credits.exportRewardCredit === 0.05, 'export reward row');
const creditRows = Object.fromEntries(Amber.compareBill(credits, { importKwh: 900, amberUsage: 198, amberDemand: 0, amberConnection: 0, amberSubscription: 0, amberCharges: 330, exportKwh: 44.4, amberFeedIn: -6.3, eveningExportKwh: 1.2 }).map((r) => [r.key, r]));
assert(creditRows.feedInKwh.ok && creditRows.feedInCredit.ok && creditRows.exportRewardKwh.ok, 'exports, credit and reward compare OK');

// EA025 bill layout: card fee under Other Charges, "Wholesale Export Credit/Charge" row, vouchers
const ea025 = Amber.parseAmberBillText(`Billing Period: 31 days (19/08/2026 \ue088 18/09/2026)
Usage 480.09 kWh 0.1626 $/kWh $78.06
Network Daily Supply Charges 31 days 1.0616 $/Day $32.91
Other Charges $2.31
Amber Monthly Subscription $23.16
GST - 10% $13.61
CHARGES TOTAL $150.05
CREDITS SUMMARY
Solar Exports 320.32 kWh 0.0209 $/kWh $6.70
Vouchers & Concessions $9.09
Card Payment Processing Fee 19 Aug - 19 Aug 1 $2.3100 $2.31
Other Total ( excl GST): $2.31
YOUR EXPORT CREDITS
Charge Description Dates Amount Rate ($/kWh) Credit
Export Reward Energy 19 Aug - 18 Sep 18.79 kWh 0.0383 $0.72
Wholesale Export Credit/Charge 19 Aug - 18 Sep 320.32 kWh 0.0187 $5.98
Export Totals (excl GST): $6.70
Voucher & Concession Totals ( excl GST): $9.09`).check;
assert(ea025.feedInKwh === 320.32 && ea025.feedInCredit === 6.7, `exports not double-counted (got ${ea025.feedInKwh} kWh)`);
assert(ea025.exportRows[1].label === 'Wholesale Export Credit/Charge', `row label keeps "/" (${ea025.exportRows[1].label})`);
assert(ea025.otherCost === 2.31 && ea025.voucherCredit === 9.09, 'other charges and vouchers');
// Meter totals for that bill period (from its 5-minute data)
const ea025Totals = { importKwh: 480.092, amberUsage: 85.848, amberDemand: 0, amberConnection: 36.204, amberSubscription: 25.476, amberCharges: 147.528, exportKwh: 320.322, amberFeedIn: -6.700, eveningExportKwh: 18.786 };
const ea025Rows = Amber.compareBill(ea025, ea025Totals);
assert(ea025Rows.every((r) => r.ok), `EA025 bill checks out line by line (${ea025Rows.filter((r) => !r.ok).map((r) => r.key).join(', ')})`);

// The Ausgrid export allowance is settled per calendar month (as demand is), so the answer for a
// longer period, month by month and the Free? tab agree. A bill is one settlement of its own.
{
    const site = { network: 'Ausgrid', channels: [{ identifier: 'E1', type: 'general', tariff: 'EA116' }, { identifier: 'B1', type: 'feedIn', tariff: 'EA029' }] };
    const two = { E1: Amber.emptyChannel(site.channels[0]), B1: Amber.emptyChannel(site.channels[1]) };
    const items = [];
    const addDay = (date, middayKwh) => {
        // Midday (10am–3pm Sydney summer time) is 9am–2pm NEM time: the 10 half hours ending 09:30–14:00.
        const next = new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().substring(0, 10);
        for (let i = 1; i <= 48; i++) {
            const h = Math.floor(i / 2);
            const nemTime = i === 48 ? `${next}T00:00:00+10:00` : `${date}T${String(h).padStart(2, '0')}:${i % 2 ? '30' : '00'}:00+10:00`;
            items.push({ nemTime, date, kwh: 0.3, perKwh: 25, duration: 30, channelIdentifier: 'E1', quality: 'billable' });
            items.push({ nemTime, date, kwh: i >= 19 && i <= 28 ? middayKwh / 10 : 0, perKwh: -4, duration: 30, channelIdentifier: 'B1', quality: 'billable' });
        }
    };
    for (let d = 1; d <= 31; d++) addDay(`2025-12-${String(d).padStart(2, '0')}`, 20); // well over the free 6.83 kWh a day
    for (let d = 1; d <= 31; d++) addDay(`2026-01-${String(d).padStart(2, '0')}`, 2); // well under it
    Amber.processUsageData(items, two, true);
    const o = { amberRates: rates, state: 'NSW', site, planConfig: plan };
    const t = Amber.EXPORT_TARIFFS.EA029;
    const decCharge = (31 * 20 - 31 * t.belKwhPerDay) * t.chargeIncGst / 100;
    const pooledCharge = (31 * 20 + 31 * 2 - 62 * t.belKwhPerDay) * t.chargeIncGst / 100;
    const period = Amber.periodTotals(two, '2025-12-01', '2026-01-31', o);
    const months = Amber.monthlyBreakdown(two, ['2025-12', '2026-01'], o);
    assert(near(period.amberExportCharge, decCharge) && near(months.rows[0].amberExportCharge, decCharge) && months.rows[1].amberExportCharge === 0,
        `export charge is settled month by month: $${period.amberExportCharge.toFixed(2)}, all of it December's (a quiet January doesn't lend its allowance)`);
    assert(near(months.total.amberTotal, period.amberTotal), `so the months add up to the period ($${months.total.amberTotal.toFixed(2)} vs $${period.amberTotal.toFixed(2)})`);
    const bill = Amber.periodTotals(two, '2025-12-01', '2026-01-31', Object.assign({ billPeriod: true }, o));
    assert(near(bill.amberExportCharge, pooledCharge) && bill.amberExportCharge < period.amberExportCharge,
        `a bill covering both months is one settlement: $${bill.amberExportCharge.toFixed(2)}`);
    // Part months get the allowance for their days in the range.
    const part = Amber.periodTotals(two, '2025-12-22', '2026-01-10', o);
    assert(near(part.amberExportCharge, (10 * 20 - 10 * t.belKwhPerDay) * t.chargeIncGst / 100), 'a part month gets the allowance for its own days in the dates');
    assert(Amber.monthsInRange('2025-12-22', '2026-02-03').map((m) => `${m.key}:${m.days}`).join() === '2025-12:10,2026-01:31,2026-02:3', 'months in a range, clipped to it');
    // Daily rows: each month's charge lands on that month's days.
    Amber.applyAmberFeedInSettlement(two, site, 62, { from: '2025-12-01', to: '2026-01-31' });
    const daily = Amber.precalculateDailySummaries(two, plan, rates, 'NSW').summaries;
    const amberOf = (prefix) => Object.keys(daily).filter((d) => d.startsWith(prefix)).reduce((sum, d) => sum + daily[d].amberCost, 0);
    const energyOnly = (kwhPerDay) => 31 * (48 * 0.3 * 25 - kwhPerDay * (4 + t.chargeExGst)) / 100;
    assert(near(amberOf('2025-12'), energyOnly(20) + decCharge) && near(amberOf('2026-01'), energyOnly(2)),
        'daily rows carry December\'s export charge in December and none in January');
}

const fromName = Amber.parseBillPeriod('no dates here', '20260801-20260831.pdf');
assert(fromName.start === '2026-08-01' && fromName.end === '2026-08-31' && fromName.fromFileName, 'period from Amber file name');
const viaFile = Amber.parseAmberBillText('Usage 744.00 kWh 0.2000 $/kWh $148.80\nCHARGES TOTAL $254.95', '20260801-20260831.pdf').check;
assert(viaFile.ok && viaFile.periodFromFileName, 'bill check ok with period from file name');

if (failed) { console.error(`${failed} bill check test(s) failed`); process.exit(1); }
console.log('bill check tests passed');
