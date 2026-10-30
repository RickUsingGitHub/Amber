#!/usr/bin/env node
/*
 * Download AEMO's 5-minute regional wholesale prices (RRP, $/MWh) into data/prices/<REGION>/<YYYY-MM>.json,
 * for the Amber price estimate used with non-Amber meter data (NEM12 import).
 *
 * Source: AEMO aggregated price and demand data,
 *   https://www.aemo.com.au/aemo/data/nem/priceanddemand/PRICE_AND_DEMAND_<YYYYMM>_<REGION>.csv
 * (SETTLEMENTDATE is the interval end in NEM time, UTC+10.)
 *
 * Each month file: { region, month, interval: 5, rrp: [...] } where rrp[i] is the interval ending
 * <month>-01 00:00 + (i + 1) × 5 min (NEM time); null where AEMO has no price yet.
 *
 * Usage: node scripts/update-prices.js [--from 2024-10] [--to 2026-10] [--refresh N]
 * Months already saved complete are skipped, except the last N (default 2) which are re-fetched.
 * Runs daily from .github/workflows/update-prices.yml.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REGIONS = ['NSW1', 'QLD1', 'SA1', 'VIC1'];
const OUT = path.join(__dirname, '..', 'data', 'prices');

function arg(name, fallback) {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

function nemNow() {
    return new Date(Date.now() + 10 * 3600000).toISOString().substring(0, 7);
}

function monthsBetween(from, to) {
    const out = [];
    let [y, m] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    while (y < ty || (y === ty && m <= tm)) {
        out.push(`${y}-${String(m).padStart(2, '0')}`);
        m += 1;
        if (m > 12) { m = 1; y += 1; }
    }
    return out;
}

function download(region, month) {
    const url = `https://www.aemo.com.au/aemo/data/nem/priceanddemand/PRICE_AND_DEMAND_${month.replace('-', '')}_${region}.csv`;
    try {
        return execFileSync('curl', ['-sS', '-L', '--fail', '-m', '60', '-A', 'Mozilla/5.0 (amber-compare price update)', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch (err) {
        console.warn(`  ${region} ${month}: download failed (${String(err.message).split('\n')[0]})`);
        return null;
    }
}

function parse(csv, month) {
    const [y, m] = month.split('-').map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const start = Date.UTC(y, m - 1, 1);
    const rrp = new Array(days * 288).fill(null);
    let rows = 0;
    csv.split(/\r?\n/).forEach((line) => {
        const f = line.split(',');
        if (f.length < 4 || !/^\d{4}\/\d{2}\/\d{2}/.test(f[1])) return;
        const t = Date.parse(f[1].replace(/\//g, '-').replace(' ', 'T') + 'Z');
        const i = Math.round((t - start) / 300000) - 1;
        const v = parseFloat(f[3]);
        if (i >= 0 && i < rrp.length && Number.isFinite(v)) {
            rrp[i] = Math.round(v * 100) / 100;
            rows += 1;
        }
    });
    return { rrp, rows, complete: rows === rrp.length };
}

function main() {
    const to = arg('--to', nemNow());
    const from = arg('--from', '2024-10');
    const refresh = parseInt(arg('--refresh', '2'), 10);
    const months = monthsBetween(from, to);
    const recent = new Set(months.slice(-refresh));
    const indexPath = path.join(OUT, 'index.json');
    const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : { regions: {} };
    index.regions = index.regions || {};
    let changed = 0;
    REGIONS.forEach((region) => {
        const dir = path.join(OUT, region);
        fs.mkdirSync(dir, { recursive: true });
        const info = index.regions[region] || (index.regions[region] = { months: {} });
        months.forEach((month) => {
            const file = path.join(dir, `${month}.json`);
            const have = info.months[month];
            if (have && have.complete && fs.existsSync(file) && !recent.has(month)) return;
            const csv = download(region, month);
            if (!csv) return;
            const parsed = parse(csv, month);
            if (!parsed.rows) return;
            const body = JSON.stringify({ region, month, interval: 5, rrp: parsed.rrp });
            const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
            if (old !== body) {
                fs.writeFileSync(file, body);
                changed += 1;
            }
            info.months[month] = { intervals: parsed.rows, complete: parsed.complete };
            console.log(`  ${region} ${month}: ${parsed.rows} intervals${parsed.complete ? '' : ' (part month)'}`);
        });
        const all = Object.keys(info.months).sort();
        info.first = all[0] || null;
        info.last = all[all.length - 1] || null;
    });
    if (changed) {
        index.updated = new Date().toISOString();
        index.source = 'AEMO aggregated price and demand data (5-minute RRP, $/MWh, interval end in NEM time)';
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 1));
    }
    console.log(changed ? `${changed} month file(s) updated.` : 'No changes.');
}

main();
