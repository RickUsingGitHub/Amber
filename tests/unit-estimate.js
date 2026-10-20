'use strict';

require('../js/constants.js');
require('../js/time.js');
require('../js/costs.js');
require('../js/monthly.js');
require('../js/networks.js');
require('../js/estimate.js');
const Amber = global.Amber;

let failed = 0;
function assert(cond, message) {
    if (!cond) { failed += 1; console.error('FAIL:', message); } else { console.log('ok:', message); }
}
const near = (a, b, tol) => Math.abs(a - b) < (tol || 1e-6);

// ---- NEM12 parsing ----
const day = (values) => values.join(',');
const flat = (v, n) => new Array(n || 48).fill(v);
const nightOnly = Array.from({ length: 48 }, (_, i) => (i < 14 || i >= 44 ? 0.5 : 0));
const middayExport = Array.from({ length: 48 }, (_, i) => (i >= 20 && i < 30 ? 1 : 0));
const nem12 = [
    '100,NEM12,202601010000,AUSGRID,RETAILER',
    '200,4102000001,E1E2B1,E1,E1,N1,123,kWh,30,',
    `300,20260115,${day(flat(0.5))},A,,,20260116000000,`,
    `300,20260116,${day(flat(0.4))},A,,,20260117000000,`,
    // A corrected reading for 16 Jan replaces the first.
    `300,20260116,${day(flat(0.6))},A,,,20260118000000,`,
    '400,1,48,A,,',
    '200,4102000001,E1E2B1,E2,E2,N2,123,Wh,30,',
    `300,20260115,${day(nightOnly.map((v) => v * 1000))},A,,,20260116000000,`,
    `300,20260116,${day(nightOnly.map((v) => v * 1000))},A,,,20260116000000,`,
    '200,4102000001,E1E2B1,B1,B1,N3,123,kWh,30,',
    `300,20260115,${day(middayExport)},A,,,20260116000000,`,
    `300,20260116,${day(middayExport)},A,,,20260116000000,`,
    '200,4102000001,E1E2B1,Q1,Q1,N4,123,kVArh,30,',
    `300,20260115,${day(flat(0.1))},A,,,20260116000000,`,
    '900'
].join('\r\n');

const parsed = Amber.parseNem12(nem12);
assert(parsed.ok && parsed.nmi === '4102000001', 'NEM12 parsed, NMI found');
const n = parsed.nmis[parsed.nmi];
assert(Object.keys(n.channels).sort().join() === 'B1,E1,E2', `energy channels only (${Object.keys(n.channels)})`);
assert(near(n.channels.E1.kwh, 48 * 0.5 + 48 * 0.6), 'later 300 row replaces the earlier one for the same day');
assert(near(n.channels.E2.kwh, 2 * 18 * 0.5), 'Wh converted to kWh');
assert(n.days.join() === '2026-01-15,2026-01-16' && n.firstDay === '2026-01-15', 'days');
assert(!Amber.parseNem12('Date,Time,kWh\n2026-01-01,00:30,1').ok, 'rejects files that are not NEM12');

const roles = Amber.guessNem12Roles(n);
assert(roles.E1 === 'general' && roles.E2 === 'controlledLoad' && roles.B1 === 'feedIn', `roles guessed (${JSON.stringify(roles)})`);
assert(Amber.networkForNmi('4102000001') === 'ausgrid' && Amber.networkForNmi('6203123456') === 'powercor' && Amber.networkForNmi('9999') === null, 'network from NMI');

// ---- Wholesale price lookup ----
// January 2026 and February 2026 at flat prices; the interval ending 1 Feb 00:00 belongs to January's file.
const prices = { '2026-01': new Array(31 * 288).fill(100), '2026-02': new Array(28 * 288).fill(200) };
const feb1 = Date.parse('2026-02-01T00:00:00Z');
assert(Amber.rrpForInterval(prices, feb1, 30) === 100, 'interval ending at midnight on the 1st uses the previous month');
assert(Amber.rrpForInterval(prices, feb1 + 900000, 30) === (3 * 100 + 3 * 200) / 6, '30-minute price averages six 5-minute prices across months');
assert(Amber.rrpForInterval(prices, Date.parse('2026-03-01T00:05:00Z'), 5) === null, 'missing month gives null');

// ---- Amber price rebuild (Ausgrid EA116 + EA029 + EA030) ----
const est = Amber.estimateAmberUsage(n, { networkKey: 'ausgrid', tariffCode: 'EA116', exportCode: 'EA029', clCode: 'EA030', roles, prices });
assert(Object.keys(est.days).length === 2 && !est.missingPrice.length, 'both days priced');
const items = est.days['2026-01-15'];
const gen = items.filter((i) => i.channelType === 'general');
const expectGeneral = (1.048 * 10 + 2.81 + 1.01 + 0.96 + 1.00) * 1.1;
assert(gen.length === 48 && near(gen[0].perKwh, expectGeneral), `general price = (LF × wholesale + EA116 + charges) + GST (${gen[0].perKwh.toFixed(4)})`);
const cl = items.find((i) => i.channelType === 'controlledLoad');
assert(near(cl.perKwh, (1.048 * 10 + 2.97 + 2.97) * 1.1), 'controlled load at EA030');
// January is daylight saving: NEM 11:00–11:30 is local 12:00–12:30 (export charge); NEM 15:30–16:00 is local 16:30 (reward).
const fiAt = (nemEnd) => items.find((i) => i.channelType === 'feedIn' && i.nemTime === `2026-01-15T${nemEnd}:00+10:00`);
assert(near(fiAt('11:30').perKwh, -10.48 + 1.23), 'midday export carries the EA029 charge (settled on the bill)');
assert(near(fiAt('16:00').perKwh, -10.48 - 3.86), 'evening export gets the EA029 reward');
assert(near(fiAt('03:00').perKwh, -10.48), 'other exports at the wholesale price');
const flagged = gen.filter((i) => i.tariffInformation && i.tariffInformation.demandWindow);
assert(flagged.length === 12 && flagged[0].nemTime === '2026-01-15T14:30:00+10:00', `demand window 3–9pm local (${flagged.length}, first ${flagged[0] && flagged[0].nemTime})`);

// Quarterly wholesale cap: at $300/MWh the wholesale part (34.6c) is credited down to 14.98c.
const dear = { '2026-01': new Array(31 * 288).fill(300) };
const capped = Amber.estimateAmberUsage(n, { networkKey: 'ausgrid', tariffCode: 'EA116', exportCode: 'EA029', clCode: 'EA030', roles, prices: dear });
const g = capped.days['2026-01-15'].find((i) => i.channelType === 'general');
assert(near(g.perKwh, 14.98 + (2.81 + 2.97) * 1.1, 1e-6) && capped.summary.quarters['2026-Q1'].capped && capped.summary.capCreditCents > 0, `price cap applied (${g.perKwh.toFixed(3)})`);

// Two-way import tariff with its own export part and daily free level (Jemena A10E: 1 kWh/day free, 3c charge 11am–4pm).
const jem = Amber.estimateAmberUsage(n, { networkKey: 'jemena', tariffCode: 'A10E', roles, prices });
const jemFi = jem.days['2026-01-15'].filter((i) => i.channelType === 'feedIn' && i.kwh > 0);
const lf = Amber.NETWORKS.jemena.lossFactor;
// NEM 10:00–10:30 is local 11:00–11:30: the first 1 kWh is free of the charge.
assert(near(jemFi[0].perKwh, -lf * 10), 'first kWh of the day is under the free export level');
assert(near(jemFi[1].perKwh, -lf * 10 + 3.00), 'then the export charge applies');

// ---- Site and Amber charges ----
const site = Amber.estimateSite(n, { networkKey: 'ausgrid', tariffCode: 'EA116', exportCode: 'EA029', clCode: 'EA030', roles });
assert(site.local && site.id === 'nem12-4102000001' && site.network === 'Ausgrid', 'local site');
assert(site.channels.find((c) => c.type === 'feedIn').tariff === 'EA029', 'feed-in channel carries EA029, so the bill settlement applies');
assert(near(site.amberRates.connectionCents, (67.01 + 42.95 + 4.04) * 1.1, 1e-3) && near(site.amberRates.demandCents, 39.49 * 1.1, 1e-3), 'Amber charges from the tariff');
const endeavour = Amber.estimatedAmberRates('endeavour', 'N72', 'N50', false);
assert(near(Amber.demandCentsFor(endeavour, '2026-01'), 18.18 * 1.1, 1e-3) && near(Amber.demandCentsFor(endeavour, '2026-06'), 9.27 * 1.1, 1e-3), 'seasonal demand rate by month');

// Every network's default tariff prices a day.
Object.keys(Amber.NETWORKS).forEach((key) => {
    const net = Amber.NETWORKS[key];
    const r = Amber.estimateAmberUsage(n, { networkKey: key, tariffCode: net.defaultTariff, exportCode: net.defaultExport || '', clCode: net.defaultControlled, roles, prices });
    const ok = Object.keys(r.days).length === 2 && r.days['2026-01-15'].every((i) => Number.isFinite(i.perKwh));
    assert(ok, `${net.name} ${net.defaultTariff} prices every interval`);
});

if (failed) {
    console.error(`${failed} estimate test(s) failed`);
    process.exit(1);
}
console.log('estimate tests passed');
