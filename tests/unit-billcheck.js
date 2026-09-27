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

// Monthly breakdown sums to the whole period and handles partial months
const plan = { rateType: 'flat', flat: 30, feedIn: 5, daily: 100 };
const opts = { amberRates: rates, state: 'NSW', planConfig: plan };
const mb = Amber.monthlyBreakdown(ct, '2025-07-15', '2025-08-10', opts);
assert(mb.rows.length === 2 && mb.rows[0].partial && mb.rows[0].days === 17 && mb.rows[1].days === 10, 'partial months clipped to range');
assert(mb.rows[1].dataDays === 0 && mb.rows[0].dataDays === 17, 'data days counted per month (no August data)');
const whole = Amber.periodTotals(ct, '2025-07-15', '2025-08-10', opts);
assert(near(mb.total.amberTotal - mb.total.amberDemand, whole.amberTotal - whole.amberDemand, 1e-6), 'monthly Amber (ex demand) sums to the period');
assert(near(mb.total.otherTotal, whole.otherTotal, 1e-6), 'monthly competitor totals sum to the period');
assert(near(mb.total.amberDemand, whole.amberDemand, 1e-6), 'monthly demand sums match (both per-month)');

if (failed) { console.error(`${failed} bill check test(s) failed`); process.exit(1); }
console.log('bill check tests passed');
