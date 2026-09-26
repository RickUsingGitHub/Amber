'use strict';

require('../js/constants.js');
require('../js/time.js');
require('../js/costs.js');
require('../js/stats.js');
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

const TZ = 'Australia/Sydney';

// More stats from Amber data
const usage = [];
for (let i = 0; i < 48; i++) {
    const end = new Date(Date.parse('2026-07-01T00:30:00+10:00') + i * 1800000);
    const nem = new Date(end.getTime() + 10 * 3600000).toISOString().substring(0, 19) + '+10:00';
    usage.push({ nemTime: nem, kwh: 0.25, perKwh: i === 36 ? 120 : 20, duration: 30, channelIdentifier: 'E1' });
    usage.push({ nemTime: nem, kwh: i === 36 ? 2 : 0, perKwh: i === 36 ? -150 : -5, duration: 30, channelIdentifier: 'B1' });
}
const ct = { E1: Amber.emptyChannel({ identifier: 'E1', type: 'general' }), B1: Amber.emptyChannel({ identifier: 'B1', type: 'feedIn' }) };
Amber.processUsageData(usage, ct, true);
const ms = Amber.moreStats(ct, { timeZone: TZ, spikeCents: 50 });
assert(Math.abs(ms.importKwh - 12) < 1e-9, 'import kWh total');
assert(Math.abs(ms.spikeImportKwh - 0.25) < 1e-9, 'spike import kWh');
assert(Math.abs(ms.spikeExportEarn - 3) < 1e-9, 'spike export earnings $3');
assert(ms.dayCount === 1 && ms.gridFreeDays === 0, 'day counts');
assert(Math.abs(ms.avgImportCents - (11.75 * 20 + 0.25 * 120) / 12) < 1e-9, 'average import c/kWh');
assert(Math.abs(ms.eveningImportKwh - 2.5) < 1e-9, 'evening 4-9 pm import (10 half-hours)');
// Old overnight/Tesla code is gone
assert(typeof Amber.parseTeslaCsv === 'undefined' && typeof Amber.sunTimes === 'undefined', 'overnight/Tesla code removed');

if (failed) {
    console.error(`${failed} stats test(s) failed`);
    process.exit(1);
}
console.log('stats tests passed');

// Cache-busting tags on index.html must match the app version.
const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const tags = html.match(/\?v=[0-9.]+"/g) || [];
if (!tags.length || tags.some((t) => t !== `?v=${Amber.APP_VERSION}"`)) {
    console.error(`FAIL: index.html ?v= tags must all be ?v=${Amber.APP_VERSION}`);
    process.exit(1);
}
console.log(`ok: ${tags.length} asset links tagged ?v=${Amber.APP_VERSION}`);
