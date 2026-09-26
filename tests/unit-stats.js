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
const SYD = { lat: -33.87, lon: 151.21, timeZone: TZ };

function clock(ms) {
    return Amber.localClock(ms, TZ);
}
function minutesOf(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}
function near(ms, hhmm, tolMin, label) {
    const diff = Math.abs(minutesOf(clock(ms)) - minutesOf(hhmm));
    assert(diff <= tolMin, `${label}: ${clock(ms)} ≈ ${hhmm}`);
}

// Sydney reference times (Geoscience Australia): winter solstice 07:00 / 16:54 AEST,
// summer solstice 05:41 / 20:05 AEDT.
const jun = Amber.sunTimes('2026-06-21', SYD.lat, SYD.lon);
near(jun.sunrise, '07:00', 3, 'Sydney sunrise 21 Jun');
near(jun.sunset, '16:54', 3, 'Sydney sunset 21 Jun');
const dec = Amber.sunTimes('2026-12-21', SYD.lat, SYD.lon);
near(dec.sunrise, '05:41', 3, 'Sydney sunrise 21 Dec (AEDT)');
near(dec.sunset, '20:05', 3, 'Sydney sunset 21 Dec (AEDT)');

const win = Amber.nightWindow('2026-06-21', Object.assign({ eveningMin: 30, morningMin: 60 }, SYD));
assert(win.hours > 15.4 && win.hours < 15.7, `winter night window ~15.6 h (got ${win.hours.toFixed(2)})`);
const ext = Amber.nightLengthExtremes('2026-01-01', Object.assign({ eveningMin: 30, morningMin: 60 }, SYD));
assert(ext.longest.date.substring(5, 7) === '06', `longest night in June (got ${ext.longest.date})`);
assert(ext.shortest.date.substring(5, 7) === '12', `shortest night in December (got ${ext.shortest.date})`);

// DST-aware wall clock conversion
const wall = Amber.zonedWallToMs(2026, 1, 15, 0, 0, 0, TZ); // AEDT +11
assert(new Date(wall).toISOString() === '2026-01-14T13:00:00.000Z', 'wall time in AEDT converts to UTC');
const wall2 = Amber.zonedWallToMs(2026, 7, 15, 0, 0, 0, TZ); // AEST +10
assert(new Date(wall2).toISOString() === '2026-07-14T14:00:00.000Z', 'wall time in AEST converts to UTC');

// Tesla CSV: two days of 5-minute data at a constant 0.5 kW, with a 3 kW spike 20:00–21:00.
function teslaDay(dateStr) {
    let csv = 'Date time,Home (kW),Solar (kW),Powerwall (kW),Grid (kW)\n';
    for (let i = 0; i < 288; i++) {
        const h = Math.floor(i / 12);
        const m = (i % 12) * 5;
        const kw = h === 20 ? 3 : 0.5;
        csv += `${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+10:00,${kw},0,${kw},0\n`;
    }
    return csv;
}
const a = Amber.parseTeslaCsv(teslaDay('2026-07-01'), TZ);
const b = Amber.parseTeslaCsv(teslaDay('2026-07-02'), TZ);
assert(!a.error && a.rows === 288 && a.unit === 'kW' && a.stepMin === 5, 'parses Tesla day export');
const merged = Amber.mergePoints(a.points, b.points);
assert(merged.length === 576, 'merges two days');
const dayKwh = a.points.reduce((s, p) => s + p.kwh, 0);
assert(Math.abs(dayKwh - (23 * 0.5 + 3)) < 1e-6, `kW integrates to kWh (got ${dayKwh})`);

const opts = Object.assign({ eveningMin: 30, morningMin: 60, capKw: 1.5 }, SYD);
const windows = Amber.windowsForPoints(merged, opts);
const res = Amber.nightlyEnergy(merged, windows, opts);
assert(res.nights.length === 1 && res.nights[0].date === '2026-07-01', 'one complete night found (1 Jul)');
const n = res.nights[0];
const expected = 0.5 * (n.hours - 1) + 1.5 * 1; // spike clipped to 1.5 kW
assert(Math.abs(n.kwh - expected) < 0.05, `clipped night kWh ${n.kwh.toFixed(2)} ≈ ${expected.toFixed(2)}`);
assert(Math.abs(n.rawKwh - (0.5 * (n.hours - 1) + 3)) < 0.05, 'raw kWh keeps the spike');
assert(Math.abs(n.baseKw - 0.5) < 1e-9, 'base load 0.5 kW');

const sum = Amber.summariseNights(res, { marginPct: 20, batteryKwh: 27 });
const r = sum.reserveFor(10);
assert(Math.abs(r.kwh - n.avgKw * 10 * 1.2) < 1e-9, 'reserve = p90 kW × hours × margin');
assert(Math.abs(r.pct - (r.kwh / 27) * 100) < 1e-9, 'reserve % of battery');

// Slashed AU dates with AM/PM
const t1 = Amber.parseLooseTimestamp('02/07/2026 1:05 PM', TZ, true);
assert(new Date(t1).toISOString() === '2026-07-02T03:05:00.000Z', 'parses D/M/Y h:mm PM');

const bad = Amber.parseTeslaCsv('Date time,Solar Energy (kWh)\n2026-07-01,5\n2026-07-02,6\n', TZ);
assert(!!bad.error, 'rejects file without a Home column');
const monthly = Amber.parseTeslaCsv('Date time,Home (kWh)\n2026-07-01T00:00:00+10:00,30\n2026-07-02T00:00:00+10:00,31\n2026-07-03T00:00:00+10:00,29\n', TZ);
assert(!!monthly.error && /Day view/.test(monthly.error), 'rejects monthly totals export');

// Amber points and more stats
const usage = [];
for (let i = 0; i < 48; i++) {
    const end = new Date(Date.parse('2026-07-01T00:30:00+10:00') + i * 1800000);
    const nem = new Date(end.getTime() + 10 * 3600000).toISOString().substring(0, 19) + '+10:00';
    usage.push({ nemTime: nem, kwh: 0.25, perKwh: i === 36 ? 120 : 20, duration: 30, channelIdentifier: 'E1' });
    usage.push({ nemTime: nem, kwh: i === 36 ? 2 : 0, perKwh: i === 36 ? -150 : -5, duration: 30, channelIdentifier: 'B1' });
}
const ct = { E1: Amber.emptyChannel({ identifier: 'E1', type: 'general' }), B1: Amber.emptyChannel({ identifier: 'B1', type: 'feedIn' }) };
Amber.processUsageData(usage, ct, true);
const pts = Amber.amberImportPoints(ct);
assert(pts.length === 48 && Math.abs(pts[0].dur - 0.5) < 1e-9, 'Amber import points built');
assert(new Date(pts[0].t).toISOString() === '2026-06-30T14:00:00.000Z', 'Amber interval start is end minus duration');
const ms = Amber.moreStats(ct, { timeZone: TZ, spikeCents: 50 });
assert(Math.abs(ms.importKwh - 12) < 1e-9, 'import kWh total');
assert(Math.abs(ms.spikeImportKwh - 0.25) < 1e-9, 'spike import kWh');
assert(Math.abs(ms.spikeExportEarn - 3) < 1e-9, 'spike export earnings $3');
assert(ms.dayCount === 1 && ms.gridFreeDays === 0, 'day counts');

if (failed) {
    console.error(`${failed} stats test(s) failed`);
    process.exit(1);
}
console.log('stats tests passed');
