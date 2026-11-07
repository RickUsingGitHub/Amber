'use strict';
const assert = require('node:assert/strict');
for (const name of ['constants', 'time', 'templates', 'costs', 'storage', 'monthly', 'csv', 'import']) require('../js/' + name + '.js');
const A = global.Amber;
const item = (id, date, kwh, price = 0) => ({ channelIdentifier: id, date, nemTime: date + 'T12:30:00+10:00', duration: 30, kwh, perKwh: price });
const channel = (id, type, items) => ({ identifier: id, type, usageData: items, totalAmberCost: items.reduce((s, i) => s + i.kwh * i.perKwh / 100, 0) });
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const rates = { connectionCents: 0, subscriptionCents: 0, demandCents: 0 };
const plan = { rateType: 'tou', clock: 'nem', flat: 30, daily: 0, feedIn: 2, tou: { free: { rate: 0, capKwh: 24, windows: [{ start: '11:00', end: '14:00' }] }, offpeak: { rate: 30 } }, feedInWindows: [{ start: '11:00', end: '14:00', rate: 10, capKwh: 24, overRate: 2 }] };
for (const type of ['general', 'feedIn']) {
    const ct = { A: channel('A', type, [item('A', '2026-06-01', 20)]), B: channel('B', type, [item('B', '2026-06-01', 20)]) };
    const expected = type === 'general' ? 4.8 : -2.72;
    A.calculateOtherSupplierCosts(ct, plan, 'NSW');
    near(Object.values(ct).reduce((s, c) => s + c.totalOtherCost, 0), expected);
    near(Object.values(ct).flatMap((c) => A.channelPeriodBreakdown(c, plan, 'NSW', ct)).reduce((s, r) => s + r.otherCost, 0), expected);
    near(A.precalculateDailySummaries(ct, plan, rates, 'NSW').summaries['2026-06-01'].otherCost, expected);
    // A new date has its own allowance; changing plans must not reuse old splits.
    ct.A.usageData.push(item('A', '2026-06-02', 20));
    A.calculateOtherSupplierCosts(ct, { ...plan, feedInWindows: [], tou: { ...plan.tou, free: { ...plan.tou.free, capKwh: 10 } } }, 'NSW');
    near(Object.values(ct).reduce((s, c) => s + c.totalOtherCost, 0), type === 'general' ? 12 : -1.2);
}
console.log('ok: household caps reconcile across channels, breakdowns and daily summaries');

const ct = { E1: channel('E1', 'general', [item('E1', '2026-06-01', 0), item('E1', '2026-06-02', 0)]), B1: channel('B1', 'feedIn', [item('B1', '2026-06-01', 10, 1.232), item('B1', '2026-06-02', 20, 1.232)]) };
ct.B1.tariff = 'EA029';
for (let repeat = 0; repeat < 2; repeat++) {
    A.applyAmberFeedInSettlement(ct, { network: 'Ausgrid' }, 2);
    const totals = Object.values(ct).reduce((s, c) => s + c.totalAmberCost, 0);
    near(totals, (30 - 2 * 6.83) * 1.3552 / 100);
    const daily = A.precalculateDailySummaries(ct, plan, rates, 'NSW').summaries;
    near(Object.values(daily).reduce((s, d) => s + d.amberCost, 0), totals);
    near(daily['2026-06-02'].amberCost, daily['2026-06-01'].amberCost * 2);
    near(A.channelPeriodBreakdown(ct.B1, plan, 'NSW', ct).reduce((s, r) => s + r.amberCost, 0), ct.B1.totalAmberCost);
    let csv;
    A.downloadCSV = (value) => { csv = value; };
    A.generateDailySummariesCsv(daily, { amberRates: rates, otherDailyCents: 0 });
    const exportedTotal = csv.trim().split('\n').slice(1).reduce((s, line) => s + Number(line.split(',')[6]), 0);
    assert(Math.abs(exportedTotal - totals) < 0.00011);
}
console.log('ok: export settlement reconciles with daily CSV and capped feed-in rows, including recalculation');

const gap = { E1: channel('E1', 'general', [item('E1', '2026-06-01', 1, 30), item('E1', '2026-06-03', 0, 30)]) };
const days = A.precalculateDailySummaries(gap, plan, rates, 'NSW').summaries;
assert.equal(days['2026-06-02'], undefined);
assert.equal(days['2026-06-03'].totalInKwh, 0);
console.log('ok: missing dates are distinct from genuine zero-usage dates');

for (const minutes of [5, 30]) {
    const date = '2026-10-04'; // DST transition; timestamps remain NEM time.
    const raw = [];
    for (const [id, type] of [['E1', 'general'], ['B1', 'feedIn'], ['CL1', 'controlledLoad']]) {
        for (let i = 1; i <= 1440 / minutes; i++) {
            raw.push({ type: 'Usage', date, channelIdentifier: id, channelType: type,
                nemTime: new Date(Date.parse(date + 'T00:00:00Z') + i * minutes * 60000).toISOString().substring(0, 19) + '+10:00',
                duration: minutes, kwh: id === 'CL1' ? 0 : 0.2, perKwh: id === 'B1' ? -5 : 30, quality: i === 1 ? 'estimated' : 'billable',
                renewables: i % 100, tariffInformation: { demandWindow: i % 2 === 0 } });
        }
    }
    const channels = Object.fromEntries(['E1', 'B1', 'CL1'].map((id, i) => [id, A.emptyChannel({ identifier: id, type: ['general', 'feedIn', 'controlledLoad'][i] })]));
    A.processUsageData(structuredClone(raw), channels, true);
    const parsed = A.parseAmberUsageCsv(A.fullIntervalCsv(channels));
    assert(parsed.ok && parsed.backup);
    const site = { id: 'site1', channels: Object.values(channels) };
    const restore = A.planUsageImport(parsed, site, {}, { recentCutoff: '2026-01-01' });
    assert.equal(restore.write.length, 1);
    const restored = restore.write[0].data;
    assert.equal(restored.length, raw.length);
    restored.forEach((r, i) => {
        for (const k of ['nemTime', 'date', 'duration', 'kwh', 'perKwh', 'quality', 'renewables', 'channelIdentifier', 'channelType']) assert.equal(r[k], raw[i][k], k);
        assert.equal(!!(r.tariffInformation && r.tariffInformation.demandWindow), raw[i].tariffInformation.demandWindow);
    });
    const second = Object.fromEntries(site.channels.map((c) => [c.identifier, A.emptyChannel(c)]));
    A.processUsageData(restored, second, true);
    assert.equal(A.fullIntervalCsv(second), A.fullIntervalCsv(channels));
}
console.log('ok: CSV restores 5/30-minute timestamps, midnight, DST, quality, renewables, demand and zero channels without drift');
