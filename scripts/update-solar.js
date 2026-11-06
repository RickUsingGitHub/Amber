#!/usr/bin/env node
/*
 * Download a typical year of hourly solar weather for each planner town into data/solar/<id>.json,
 * for the Solar & battery planner. Towns: Amber.SOLAR_LOCATIONS in js/solar.js.
 *
 * Source: the EU Joint Research Centre's PVGIS (free, no key),
 *   TMY:    https://re.jrc.ec.europa.eu/api/v5_3/tmy?lat=..&lon=..&outputformat=json
 *   PVcalc: https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=..&lon=..&peakpower=1&loss=14&angle=20&aspect=180&outputformat=json
 * The TMY ("typical meteorological year") stitches typical months from many years. Each file:
 *   { id, name, lat, lon, source, radiationDb, months, minuteOffset, ghi, dni, dhi, t, pvcalc }
 * ghi/dni/dhi in W/m², t in °C, 8760 hourly values starting 1 January 00:00 UTC. minuteOffset is
 * the minute past each value's timestamp that the sun's position is taken at (found from the data:
 * the offset whose sun path best matches the sunlight). pvcalc is PVGIS's own yield for 1 kW facing
 * north at 20° with 14 % losses, to check the app's model against.
 *
 * Usage: node scripts/update-solar.js [--only sydney,brisbane] [--force]
 * Towns already saved are skipped unless --force.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

require('../js/solar.js');
const Amber = globalThis.Amber;

const OUT = path.join(__dirname, '..', 'data', 'solar');
const API = 'https://re.jrc.ec.europa.eu/api/v5_3';

function arg(name) {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : null;
}

function getJson(url) {
    const text = execFileSync('curl', ['-sS', '-L', '--fail', '-m', '120', '-A', 'amber-compare solar data', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(text);
}

// The offset (minutes after each timestamp) whose sun heights best follow the hourly sunlight.
function bestOffset(weather) {
    let best = { offset: 30, score: -Infinity };
    [-30, 0, 30, 60].forEach((offset) => {
        let num = 0;
        let a2 = 0;
        let b2 = 0;
        for (let h = 0; h < weather.ghi.length; h++) {
            const sun = Amber.sunPosition(Date.UTC(2001, 0, 1) + h * 3600000 + offset * 60000, weather.lat, weather.lon);
            const c = Math.max(0, Math.cos(sun.zenith * Math.PI / 180));
            num += c * weather.ghi[h];
            a2 += c * c;
            b2 += weather.ghi[h] * weather.ghi[h];
        }
        const score = num / Math.sqrt(a2 * b2);
        if (score > best.score) best = { offset, score };
    });
    return best;
}

function fetchTown(town) {
    const q = `lat=${town.lat}&lon=${town.lon}&outputformat=json`;
    const tmy = getJson(`${API}/tmy?${q}`);
    const rows = tmy.outputs.tmy_hourly;
    if (!rows || rows.length < 8760) throw new Error(`expected 8760 hours, got ${rows ? rows.length : 0}`);
    const hours = rows.slice(0, 8760);
    const num = (r, k) => Math.round(Number(r[k]) || 0);
    const weather = {
        id: town.id, name: town.name, lat: town.lat, lon: town.lon,
        source: 'PVGIS 5.3 typical meteorological year (EU Joint Research Centre)',
        radiationDb: tmy.inputs && tmy.inputs.meteo_data ? tmy.inputs.meteo_data.radiation_db : null,
        months: (tmy.outputs.months_selected || []).map((m) => m.year),
        firstStamp: hours[0]['time(UTC)'],
        ghi: hours.map((r) => num(r, 'G(h)')),
        dni: hours.map((r) => num(r, 'Gb(n)')),
        dhi: hours.map((r) => num(r, 'Gd(h)')),
        t: hours.map((r) => num(r, 'T2m'))
    };
    const fit = bestOffset(weather);
    weather.minuteOffset = fit.offset;
    const pv = getJson(`${API}/PVcalc?${q}&peakpower=1&loss=14&angle=20&aspect=180`);
    weather.pvcalc = { angle: 20, facing: 'north', loss: 14, kwhPerYear: pv.outputs.totals.fixed.E_y };
    const ours = Amber.solarHourlyPerKw(weather, { tilt: 20, orientation: 'north', lossPct: 14 }).reduce((s, x) => s + x, 0);
    console.log(`  ${town.id}: offset ${fit.offset} min (fit ${fit.score.toFixed(4)}), PVGIS ${weather.pvcalc.kwhPerYear.toFixed(0)} kWh/kW, app ${ours.toFixed(0)} (${((ours / weather.pvcalc.kwhPerYear - 1) * 100).toFixed(1)} %)`);
    return weather;
}

function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const only = arg('--only') ? arg('--only').split(',') : null;
    const force = process.argv.includes('--force');
    let failed = 0;
    Amber.SOLAR_LOCATIONS.forEach((town) => {
        if (only && !only.includes(town.id)) return;
        const file = path.join(OUT, `${town.id}.json`);
        if (!force && fs.existsSync(file)) { console.log(`  ${town.id}: saved already`); return; }
        try {
            const weather = fetchTown(town);
            fs.writeFileSync(file, JSON.stringify(weather) + '\n');
        } catch (err) {
            failed += 1;
            console.warn(`  ${town.id}: failed (${String(err.message).split('\n')[0]})`);
        }
    });
    if (failed) process.exitCode = 1;
}

main();
