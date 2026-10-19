'use strict';

require('../js/constants.js');
require('../js/time.js');
require('../js/costs.js');
require('../js/monthly.js');
require('../js/storage.js');
require('../js/import.js');
const Amber = global.Amber;

let failed = 0;
function assert(cond, message) {
    if (!cond) { failed += 1; console.error('FAIL:', message); } else { console.log('ok:', message); }
}
const near = (a, b) => Math.abs(a - b) < 1e-9;
const pad = (n) => String(n).padStart(2, '0');

// One NEM day of 5-minute rows for three channels, in Amber's export format.
// localOffsetHours: local time minus NEM time (1 in AEDT, 0 in AEST).
function exportDay(nemDay, localOffsetHours, opts) {
    const o = opts || {};
    const lines = [];
    const base = Date.parse(`${nemDay}T00:00:00Z`);
    const fmt = (ms) => new Date(ms).toISOString().substring(0, 19).replace('T', ' ');
    for (let i = 0; i < 288; i++) {
        const nemEnd = base + (i + 1) * 300000;
        const localStart = base + i * 300000 + localOffsetHours * 3600000 + 1000;
        const localEnd = nemEnd + localOffsetHours * 3600000;
        const cols = (type, id, price, usage) => [fmt(localStart), fmt(localEnd), fmt(nemEnd), nemDay, type, id, price, usage, (price * usage).toFixed(6)].join(',');
        lines.push(cols('general', 'E5', 20, o.general != null ? o.general : 0.1));
        lines.push(cols('controlled', 'E1', 15, 0));
        lines.push(cols('feedIn', 'B5', -8, 0.05));
    }
    return lines;
}
const HEADER = 'Start Time,End Time,NEM Time,NEM Day,Channel Type,Channel Identifier,Price,Usage,Cost';
const csv = [HEADER].concat(exportDay('2026-01-15', 1), exportDay('2026-01-16', 1), exportDay('2026-04-20', 0)).join('\r\n') + '\r\n';

const parsed = Amber.parseAmberUsageCsv('﻿' + csv);
assert(parsed.ok && parsed.rows === 3 * 288 * 3, `parsed all rows (${parsed.rows})`);
assert(parsed.intervalMinutes === 5, '5-minute intervals');
assert(parsed.days.join() === '2026-01-15,2026-01-16,2026-04-20', 'days by NEM day');
assert(parsed.channels.E1.type === 'controlledLoad' && parsed.channels.B5.type === 'feedIn' && parsed.channels.E5.type === 'general', 'channel types mapped');
const first = parsed.byDate['2026-01-15'][0];
assert(first.nemTime === '2026-01-15T00:05:00+10:00' && first.date === '2026-01-15', 'NEM time is the interval end, +10:00');
assert(first.localTime === 100 && first.localMonth === 1, 'local start time from Start Time (AEDT)');
const fi = parsed.byDate['2026-01-15'].find((r) => r.channelType === 'feedIn');
assert(fi.perKwh === -8 && near(fi.cost, -0.4), 'feed-in keeps Amber\'s sign (negative = earned), cost in cents');

assert(!Amber.parseAmberUsageCsv('a,b,c\n1,2,3').ok, 'rejects files without the export columns');
const quoted = Amber.parseAmberUsageCsv(HEADER + '\n"2026-01-15 00:00:01","2026-01-15 00:05:00","2026-01-14 23:05:00","2026-01-14","general","E5","20.5","0.1","2.05"\n');
assert(quoted.ok && quoted.rows === 1 && quoted.byDate['2026-01-14'][0].perKwh === 20.5, 'quoted fields');
const dup = Amber.parseAmberUsageCsv([HEADER].concat(exportDay('2026-01-15', 1).slice(0, 3), exportDay('2026-01-15', 1).slice(0, 3)).join('\n'));
assert(dup.rows === 3 && dup.duplicates === 3, 'duplicate intervals dropped');

// Channel mapping
const siteSame = { id: 's1', network: 'Ausgrid', channels: [
    { identifier: 'E1', type: 'controlledLoad', tariff: 'EA030' },
    { identifier: 'E5', type: 'general', tariff: 'EA116' },
    { identifier: 'B5', type: 'feedIn', tariff: 'EA029' }] };
const siteOther = { id: 's2', network: 'Ausgrid', channels: [
    { identifier: 'E1', type: 'general', tariff: 'EA116' },
    { identifier: 'B1', type: 'feedIn', tariff: 'EA029' }] };
const mapped = Amber.mapImportChannels(parsed.channels, siteOther.channels);
assert(mapped.map.E5 === 'E1' && mapped.map.B5 === 'B1' && mapped.map.E1 === null, 'maps by type when identifiers differ');
assert(mapped.notes.some((n) => /E5 \(general\) imported as E1/.test(n)), 'mapping is explained');

// Plan: zero channel left out, demand window flagged in local time, recent days left for the API.
const plan = Amber.planUsageImport(parsed, siteSame, {}, { recentCutoff: '2026-04-20' });
assert(plan.write.length === 2 && plan.recent === 1, 'recent days are not imported');
assert(plan.channelMap.E1 === null, 'all-zero controlled load left out');
const day = plan.write[0].data;
assert(day.every((i) => i.channelIdentifier !== 'E1') && day.length === 288 * 2, 'two channels written');
assert(plan.write[0].id === 's1_2026-01-15' && day.every((i) => i.quality === 'billable' && i.source === 'csv'), 'cache ids and quality');
const flagged = day.filter((i) => i.tariffInformation && i.tariffInformation.demandWindow);
assert(flagged.length === 72 && flagged.every((i) => i.channelType === 'general'), 'six hours of general intervals in the demand window');
// January is AEDT: 3 pm local is 2 pm NEM, so the first flagged interval ends 14:05 NEM.
assert(flagged[0].nemTime === '2026-01-15T14:05:00+10:00' && flagged[71].nemTime === '2026-01-15T20:00:00+10:00', 'window follows local time in daylight saving');
assert(plan.demandRule && plan.demandRule.tariff === 'EA116', 'demand rule from the site tariff');

const april = Amber.planUsageImport(parsed, siteSame, {}, {}).write.find((e) => e.date === '2026-04-20').data;
assert(!april.some((i) => i.tariffInformation), 'no demand window in April');

const apiDay = [{ channelIdentifier: 'E5', duration: 1440, quality: 'billable', kwh: 1 }];
const kept = Amber.planUsageImport(parsed, siteSame, { '2026-01-16': apiDay }, {});
assert(kept.kept === 1 && kept.write.length === 2 && !kept.write.some((e) => e.date === '2026-01-16'), 'days already cached from the API are kept');
const replaced = Amber.planUsageImport(parsed, siteSame, { '2026-01-16': apiDay }, { replace: true });
assert(replaced.write.length === 3, 'replace overwrites cached days');
const reimport = Amber.planUsageImport(parsed, siteSame, { '2026-01-16': plan.write[1].data }, {});
assert(reimport.write.length === 3, 're-importing replaces earlier imports');

const partial = Amber.parseAmberUsageCsv([HEADER].concat(exportDay('2026-01-15', 1).slice(0, 300)).join('\n'));
const partialPlan = Amber.planUsageImport(partial, siteSame, {}, {});
assert(partialPlan.partial === 1 && partialPlan.write.length === 0, 'part days are skipped');

// Imported items price the same as the export's cost.
const ct = {};
siteSame.channels.forEach((c) => { ct[c.identifier] = Amber.emptyChannel(c); });
Amber.processUsageData(plan.write[0].data, ct, true);
assert(near(ct.E5.totalAmberCost, 288 * 0.1 * 20 / 100) && near(ct.B5.totalAmberCost, -288 * 0.05 * 8 / 100), 'Amber costs match the export');
const demand = Amber.calculateDemandTariff(ct, 40);
assert(near(demand.maxDemandKwh * 2, 0.1 * 6 * 2) && demand.demandDays === 1, 'demand from flagged intervals (30-min blocks)');

// Whole months
const span = Amber.wholeMonthSpan(Array.from({ length: 31 }, (_, i) => `2025-10-${pad(i + 1)}`).concat(['2025-11-01']));
assert(span && span.start === '2025-10-01' && span.end === '2025-10-31', 'whole month span');
assert(Amber.wholeMonthSpan(['2025-10-02']) === null, 'no whole months');

if (failed) {
    console.error(`${failed} import test(s) failed`);
    process.exit(1);
}
console.log('import tests passed');
