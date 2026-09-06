'use strict';

require('../js/constants.js');
require('../js/bill.js');
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

const sampleBill = `
Understand your bill
Plan: Amber Core
Billing Period: 31 days (01/07/2026 - 31/07/2026)
CHARGES SUMMARY
Charge Description Amount Rate Cost
Usage 1264.53 kWh 0.1184 $/kWh $149.75
Network Daily Supply Charges 31 days 1.1397 $/Day $35.33
Network Demand Charges $81.59
Amber Monthly Subscription $23.16
GST - 10% $28.98
CHARGES TOTAL $318.81
Understand Your Bill: Charges
USAGE FEES
Usage Totals (excl GST): $149.75
DEMAND CHARGES
Charge Description Dates Amount Price Cost
Network - Peak Demand 01 Jul - 31 Jul 6.67 kW 12.2397 $/kW/Day $81.59
Demand Totals (excl GST): $81.59
NETWORK DAILY SUPPLY CHARGES
Charge Description Dates Days Price $/day Cost
Network - Daily 01 Jul - 31 Jul 31 0.7103 $22.02
Metering Charge 01 Jul - 31 Jul 31 0.4294 $13.31
Daily Supply Totals (excl GST): $35.33
AMBER FEES
Charge Description Dates Days Price $/day Cost
Amber Monthly Subscription 01 Jul - 31 Jul 31 0.7471 $23.16
Amber Fee Totals (excl GST): $23.16
GST - 10% $28.98
CHARGES TOTAL $318.81
`;

assert(Amber.inferBillDays(sampleBill) === 31, 'billing period 31 days');
assert(Amber.billRatesAreExGst(sampleBill) === true, 'detailed totals are ex GST');
assert(Math.abs(Amber.parseConnectionDollarsPerDay(sampleBill) - 1.1397) < 1e-6, 'connection is network daily + metering');
assert(Math.abs(Amber.parseSubscriptionDollarsPerDay(sampleBill, 31) - 0.7471) < 1e-6, 'subscription $/day from Amber fees row');
assert(Math.abs(Amber.parseDemandDollarsPerKwDay(sampleBill, 31) - (12.2397 / 31)) < 1e-6, 'demand price is period $/kW, convert to $/kW/day');

const parsed = Amber.parseAmberBillText(sampleBill);
assert(parsed.ok, 'parser finds rates');
assert(parsed.found.indexOf('daily connection') !== -1, 'found daily connection');
assert(parsed.found.indexOf('subscription') !== -1, 'found subscription');
assert(parsed.found.indexOf('demand') !== -1, 'found demand');
assert(Math.abs(parsed.connectionCents - 125.367) < 0.01, 'connection 125.367 c/day inc GST');
assert(Math.abs(parsed.subscriptionCents - 82.181) < 0.01, 'subscription 82.181 c/day inc GST');
assert(Math.abs(parsed.demandCents - 43.431) < 0.02, 'demand 43.431 c/kW/day inc GST');

const summaryOnly = `
Billing Period: 30 days
Network Daily Supply Charges 30 days 1.1397 $/Day $34.19
Amber Monthly Subscription $22.41
Usage Totals (excl GST): $10.00
`;
const summaryParsed = Amber.parseAmberBillText(summaryOnly);
assert(Math.abs(summaryParsed.connectionCents - 125.367) < 0.01, 'summary $/Day still converts to inc GST cents');
assert(Math.abs(summaryParsed.subscriptionCents - 82.17) < 0.05, 'subscription from period $ / days');
assert(summaryParsed.demandCents == null, 'demand omitted when the rate row is missing');

if (failed) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll bill parser tests passed');
