(function (root) {
    const Amber = root.Amber = root.Amber || {};

    // Default locations (state capitals) for sunrise/sunset when the user hasn't set one.
    Amber.STATE_LAT_LON = {
        ACT: [-35.28, 149.13],
        NSW: [-33.87, 151.21],
        NT: [-12.46, 130.84],
        QLD: [-27.47, 153.03],
        SA: [-34.93, 138.60],
        TAS: [-42.88, 147.33],
        VIC: [-37.81, 144.96],
        WA: [-31.95, 115.86]
    };

    Amber.STATS_DEFAULTS = {
        batteryKwh: 13.5,
        eveningMin: 30,
        morningMin: 60,
        capKw: 1.5,
        marginPct: 20,
        spikeCents: 50
    };

    const DAY_MS = 86400000;
    const HOUR_MS = 3600000;
    const RAD = Math.PI / 180;

    /**
     * Sunrise and sunset (UTC ms) for a calendar date at a location.
     * Standard sunrise equation (NOAA-style, ~1 minute accuracy away from the poles).
     * dateStr is the LOCAL calendar date (YYYY-MM-DD). lon is east-positive.
     */
    Amber.sunTimes = function (dateStr, lat, lon) {
        const y = parseInt(dateStr.substring(0, 4), 10);
        const m = parseInt(dateStr.substring(5, 7), 10);
        const d = parseInt(dateStr.substring(8, 10), 10);
        const jd0 = Date.UTC(y, m - 1, d) / DAY_MS + 2440587.5;
        const n = Math.ceil(jd0 - 2451545.0 + 0.0008);
        const jStar = n - lon / 360;
        const M = ((357.5291 + 0.98560028 * jStar) % 360 + 360) % 360;
        const Mr = M * RAD;
        const C = 1.9148 * Math.sin(Mr) + 0.02 * Math.sin(2 * Mr) + 0.0003 * Math.sin(3 * Mr);
        const lambda = ((M + C + 180 + 102.9372) % 360) * RAD;
        const jTransit = 2451545.0 + jStar + 0.0053 * Math.sin(Mr) - 0.0069 * Math.sin(2 * lambda);
        const sinDec = Math.sin(lambda) * Math.sin(23.4397 * RAD);
        const cosDec = Math.cos(Math.asin(sinDec));
        const cosW = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDec) / (Math.cos(lat * RAD) * cosDec);
        if (cosW > 1 || cosW < -1) return null; // polar day/night
        const w = Math.acos(cosW) / RAD;
        const toMs = (j) => (j - 2440587.5) * DAY_MS;
        return { sunrise: toMs(jTransit - w / 360), sunset: toMs(jTransit + w / 360) };
    };

    const dateFormatters = Object.create(null);
    function localDateStr(ms, timeZone) {
        let f = dateFormatters[timeZone];
        if (!f) {
            f = dateFormatters[timeZone] = new Intl.DateTimeFormat('en-CA', {
                timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
            });
        }
        return f.format(new Date(ms));
    }
    Amber.localDateStr = localDateStr;

    const clockFormatters = Object.create(null);
    Amber.localClock = function (ms, timeZone) {
        let f = clockFormatters[timeZone];
        if (!f) {
            f = clockFormatters[timeZone] = new Intl.DateTimeFormat('en-AU', {
                timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
            });
        }
        return f.format(new Date(ms));
    };

    function tzOffsetMs(timeZone, ms) {
        const parts = {};
        new Intl.DateTimeFormat('en-US', {
            timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        }).formatToParts(new Date(ms)).forEach((p) => { parts[p.type] = p.value; });
        const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
        return asUtc - Math.floor(ms / 1000) * 1000;
    }

    /** Wall-clock time in a timezone -> UTC ms (handles DST). */
    Amber.zonedWallToMs = function (y, mo, d, h, mi, s, timeZone) {
        const guess = Date.UTC(y, mo - 1, d, h, mi, s || 0);
        let ms = guess - tzOffsetMs(timeZone, guess);
        const off2 = tzOffsetMs(timeZone, ms);
        if (guess - off2 !== ms) ms = guess - off2;
        return ms;
    };

    /**
     * Night windows. Night D runs from (sunset on D − eveningMin) to (sunrise on D+1 + morningMin):
     * roughly when solar stops covering the house until it takes over again.
     */
    Amber.nightWindow = function (dateStr, opts) {
        const today = Amber.sunTimes(dateStr, opts.lat, opts.lon);
        const tomorrow = Amber.sunTimes(Amber.addDaysUtc(dateStr, 1), opts.lat, opts.lon);
        if (!today || !tomorrow) return null;
        const start = today.sunset - (opts.eveningMin || 0) * 60000;
        const end = tomorrow.sunrise + (opts.morningMin || 0) * 60000;
        return { date: dateStr, start, end, hours: (end - start) / HOUR_MS, sunset: today.sunset, sunrise: tomorrow.sunrise };
    };

    Amber.addDaysUtc = function (dateStr, days) {
        const t = Date.UTC(+dateStr.substring(0, 4), +dateStr.substring(5, 7) - 1, +dateStr.substring(8, 10)) + days * DAY_MS;
        return new Date(t).toISOString().substring(0, 10);
    };

    /** Longest and shortest night windows over the 12 months starting at fromDate. */
    Amber.nightLengthExtremes = function (fromDate, opts) {
        let longest = null;
        let shortest = null;
        for (let i = 0; i < 366; i++) {
            const w = Amber.nightWindow(Amber.addDaysUtc(fromDate, i), opts);
            if (!w) continue;
            if (!longest || w.hours > longest.hours) longest = w;
            if (!shortest || w.hours < shortest.hours) shortest = w;
        }
        return { longest, shortest };
    };

    Amber.percentile = function (values, p) {
        const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
        if (!v.length) return null;
        if (v.length === 1) return v[0];
        const idx = (v.length - 1) * p;
        const lo = Math.floor(idx);
        const hi = Math.ceil(idx);
        return v[lo] + (v[hi] - v[lo]) * (idx - lo);
    };

    /**
     * Amber grid import as load points: { t (interval start ms), dur (h), kwh }.
     * General (E1) channel only — controlled load is usually a hot-water circuit.
     */
    Amber.amberImportPoints = function (channelTotals) {
        const points = [];
        Object.values(channelTotals || {}).forEach((c) => {
            if (c.type !== 'general') return;
            (c.usageData || []).forEach((item) => {
                const nem = item.processedTime ? item.nemTime : Amber.adjustNemTime(item.nemTime);
                const endMs = Date.parse(nem) + 1000;
                if (!Number.isFinite(endMs)) return;
                const durMin = parseFloat(item.duration) || 30;
                points.push({ t: endMs - durMin * 60000, dur: durMin / 60, kwh: Amber.absKwh(item.kwh) });
            });
        });
        points.sort((a, b) => a.t - b.t);
        return points;
    };

    function firstIndexAtOrAfter(points, t) {
        let lo = 0;
        let hi = points.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (points[mid].t + points[mid].dur * HOUR_MS <= t) lo = mid + 1; else hi = mid;
        }
        return lo;
    }

    /**
     * Energy per night window. Each interval's power is clipped at capKw
     * (loads above that — A/C, oven, EV — are assumed not to be backed up).
     * Nights with < minCoverage of the window covered by data are dropped.
     */
    Amber.nightlyEnergy = function (points, windows, opts) {
        const capKw = opts && opts.capKw > 0 ? opts.capKw : Infinity;
        const minCoverage = (opts && opts.minCoverage) || 0.9;
        const nights = [];
        const intervalKw = [];
        windows.forEach((w) => {
            if (!w) return;
            let kwh = 0;
            let rawKwh = 0;
            let covered = 0;
            let peakKw = 0;
            const kwList = [];
            for (let i = firstIndexAtOrAfter(points, w.start); i < points.length; i++) {
                const p = points[i];
                if (p.t >= w.end) break;
                const pEnd = p.t + p.dur * HOUR_MS;
                const overlap = Math.min(pEnd, w.end) - Math.max(p.t, w.start);
                if (overlap <= 0 || p.dur <= 0) continue;
                const frac = overlap / (p.dur * HOUR_MS);
                const kw = p.kwh / p.dur;
                const clippedKw = Math.min(kw, capKw);
                kwh += clippedKw * p.dur * frac;
                rawKwh += p.kwh * frac;
                covered += overlap / HOUR_MS;
                if (clippedKw > peakKw) peakKw = clippedKw;
                kwList.push(clippedKw);
            }
            if (covered < w.hours * minCoverage) return;
            // Scale up slightly for small gaps so partial nights compare fairly.
            const scale = w.hours / covered;
            const night = {
                date: w.date,
                hours: w.hours,
                start: w.start,
                end: w.end,
                kwh: kwh * scale,
                rawKwh: rawKwh * scale,
                avgKw: kwh / covered,
                peakKw,
                baseKw: Amber.percentile(kwList, 0.1)
            };
            nights.push(night);
            kwList.forEach((k) => intervalKw.push(k));
        });
        return { nights, intervalKw };
    };

    /** Summary + reserve recommendation from per-night results. */
    Amber.summariseNights = function (result, opts) {
        const nights = result.nights;
        if (!nights.length) return null;
        const kwhs = nights.map((n) => n.kwh);
        const avgKws = nights.map((n) => n.avgKw);
        const margin = 1 + (opts.marginPct || 0) / 100;
        const p90Kw = Amber.percentile(avgKws, 0.9);
        const worst = nights.reduce((a, b) => (b.kwh > a.kwh ? b : a));
        const lightest = nights.reduce((a, b) => (b.kwh < a.kwh ? b : a));
        const reserveFor = (hours) => {
            const kwh = p90Kw * hours * margin;
            const pct = opts.batteryKwh > 0 ? (kwh / opts.batteryKwh) * 100 : null;
            return { hours, kwh, pct };
        };
        return {
            count: nights.length,
            medianKwh: Amber.percentile(kwhs, 0.5),
            p90Kwh: Amber.percentile(kwhs, 0.9),
            meanKwh: kwhs.reduce((a, b) => a + b, 0) / kwhs.length,
            minKwh: lightest.kwh,
            minDate: lightest.date,
            maxKwh: worst.kwh,
            maxDate: worst.date,
            medianKw: Amber.percentile(avgKws, 0.5),
            p90Kw,
            baseKw: Amber.percentile(result.intervalKw, 0.1),
            medianHours: Amber.percentile(nights.map((n) => n.hours), 0.5),
            reserveFor
        };
    };

    // ---------- Tesla app "Download My Data" CSV ----------

    function splitCsvLine(line) {
        const out = [];
        let cur = '';
        let q = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
            } else if (ch === ',' && !q) {
                out.push(cur); cur = '';
            } else {
                cur += ch;
            }
        }
        out.push(cur);
        return out.map((s) => s.trim());
    }

    /**
     * Parse a timestamp from a Tesla export. Accepts ISO (with or without offset)
     * and D/M/Y or M/D/Y with optional AM/PM. `dmy` chooses day-first for slashed dates.
     */
    Amber.parseLooseTimestamp = function (raw, timeZone, dmy) {
        const s = String(raw || '').trim().replace(/^"|"$/g, '');
        let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
        if (m) {
            if (m[7]) {
                const off = m[7].toUpperCase() === 'Z' ? 'Z' : (m[7].includes(':') ? m[7] : `${m[7].slice(0, 3)}:${m[7].slice(3)}`);
                const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T${m[4].padStart(2, '0')}:${m[5]}:${m[6] || '00'}${off}`;
                const t = Date.parse(iso);
                return Number.isFinite(t) ? t : null;
            }
            return Amber.zonedWallToMs(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0), timeZone);
        }
        m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
        if (m) {
            let a = +m[1];
            let b = +m[2];
            let year = +m[3];
            if (year < 100) year += 2000;
            let h = +m[4];
            if (m[7]) {
                const pm = m[7].toUpperCase() === 'PM';
                if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12;
            }
            const day = dmy ? a : b;
            const month = dmy ? b : a;
            return Amber.zonedWallToMs(year, month, day, h, +m[5], +(m[6] || 0), timeZone);
        }
        const t = Date.parse(s);
        return Number.isFinite(t) ? t : null;
    };

    /**
     * Returns { points, rows, unit, column, first, last, stepMin, error }.
     * Points use the same shape as amberImportPoints.
     */
    Amber.parseTeslaCsv = function (text, timeZone) {
        const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 3) return { error: 'File has no data rows.' };
        const header = splitCsvLine(lines[0]);
        let timeIdx = header.findIndex((h) => /date|time/i.test(h));
        if (timeIdx < 0) timeIdx = 0;
        const homeIdx = header.findIndex((h) => /home|house|load|consumption/i.test(h));
        if (homeIdx < 0) {
            return { error: `No "Home" column found. Columns: ${header.join(', ')}` };
        }
        const unit = /kwh/i.test(header[homeIdx]) ? 'kWh' : 'kW';

        // Decide D/M vs M/D for slashed dates across the whole file.
        let dmy = true;
        for (let i = 1; i < lines.length; i++) {
            const cell = splitCsvLine(lines[i])[timeIdx] || '';
            const mm = cell.match(/^(\d{1,2})\/(\d{1,2})\//);
            if (!mm) break;
            if (+mm[2] > 12) { dmy = false; break; }
            if (+mm[1] > 12) { dmy = true; break; }
        }

        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const cells = splitCsvLine(lines[i]);
            const t = Amber.parseLooseTimestamp(cells[timeIdx], timeZone, dmy);
            const v = parseFloat(cells[homeIdx]);
            if (t == null || !Number.isFinite(v)) continue;
            rows.push({ t, v: Math.abs(v) });
        }
        if (rows.length < 2) return { error: 'Could not read timestamps and Home values.' };
        rows.sort((a, b) => a.t - b.t);
        const steps = [];
        for (let i = 1; i < rows.length; i++) {
            const dt = rows[i].t - rows[i - 1].t;
            if (dt > 0) steps.push(dt);
        }
        const stepMs = Amber.percentile(steps, 0.5) || 5 * 60000;
        if (stepMs > HOUR_MS) {
            return { error: 'This looks like a Week/Month/Year export (daily totals). Export the Day view instead — it has 5-minute data.' };
        }
        const points = rows.map((r, i) => {
            const next = rows[i + 1];
            let dt = next ? next.t - r.t : stepMs;
            if (dt <= 0 || dt > 2 * stepMs) dt = stepMs; // gaps don't stretch a sample
            const dur = dt / HOUR_MS;
            return { t: r.t, dur, kwh: unit === 'kWh' ? r.v : r.v * dur };
        });
        return {
            points,
            rows: rows.length,
            unit,
            column: header[homeIdx],
            first: rows[0].t,
            last: rows[rows.length - 1].t,
            stepMin: Math.round(stepMs / 60000)
        };
    };

    /** Merge point sets, later sets winning on identical start times. */
    Amber.mergePoints = function (existing, incoming) {
        const byT = new Map();
        (existing || []).forEach((p) => byT.set(p.t, p));
        (incoming || []).forEach((p) => byT.set(p.t, p));
        return Array.from(byT.values()).sort((a, b) => a.t - b.t);
    };

    /** Night windows covering every evening that has data in points. */
    Amber.windowsForPoints = function (points, opts) {
        if (!points.length) return [];
        const first = Amber.addDaysUtc(localDateStr(points[0].t, opts.timeZone), -1);
        const last = localDateStr(points[points.length - 1].t, opts.timeZone);
        const out = [];
        for (let d = first; d <= last; d = Amber.addDaysUtc(d, 1)) out.push(Amber.nightWindow(d, opts));
        return out.filter(Boolean);
    };

    // ---------- Other Amber stats ----------

    Amber.moreStats = function (channelTotals, opts) {
        const timeZone = opts.timeZone || 'Australia/Sydney';
        const spike = opts.spikeCents || Amber.STATS_DEFAULTS.spikeCents;
        const s = {
            importKwh: 0, importCost: 0,
            exportKwh: 0, exportEarn: 0,
            spikeImportKwh: 0, spikeImportCost: 0,
            spikeExportKwh: 0, spikeExportEarn: 0,
            negImportKwh: 0, negImportCredit: 0,
            negExportKwh: 0, negExportCost: 0,
            eveningImportKwh: 0,
            days: {}
        };
        Object.values(channelTotals || {}).forEach((c) => {
            if (c.type !== 'general' && c.type !== 'feedIn') return;
            (c.usageData || []).forEach((item) => {
                const kwh = Amber.absKwh(item.kwh);
                const perKwh = parseFloat(item.perKwh) || 0;
                const date = Amber.usageDateStr(item);
                const day = s.days[date] || (s.days[date] = { imp: 0, exp: 0 });
                if (c.type === 'general') {
                    s.importKwh += kwh;
                    s.importCost += perKwh * kwh / 100;
                    day.imp += kwh;
                    if (perKwh >= spike) { s.spikeImportKwh += kwh; s.spikeImportCost += perKwh * kwh / 100; }
                    if (perKwh < 0) { s.negImportKwh += kwh; s.negImportCredit += -perKwh * kwh / 100; }
                    const nem = item.processedTime ? item.nemTime : Amber.adjustNemTime(item.nemTime);
                    const parts = Amber.getClockParts(nem, { clock: 'local', timeZone });
                    if (parts.hours >= 16 && parts.hours < 21) s.eveningImportKwh += kwh;
                } else {
                    // Amber feed-in perKwh is negative when you are paid.
                    const earn = -perKwh;
                    s.exportKwh += kwh;
                    s.exportEarn += earn * kwh / 100;
                    day.exp += kwh;
                    if (earn >= spike) { s.spikeExportKwh += kwh; s.spikeExportEarn += earn * kwh / 100; }
                    if (earn < 0) { s.negExportKwh += kwh; s.negExportCost += -earn * kwh / 100; }
                }
            });
        });
        const dayList = Object.values(s.days);
        s.dayCount = dayList.length;
        s.gridFreeDays = dayList.filter((d) => d.imp < 0.5).length;
        s.netExportDays = dayList.filter((d) => d.exp > d.imp).length;
        s.avgImportCents = s.importKwh > 0 ? (s.importCost / s.importKwh) * 100 : null;
        s.avgExportCents = s.exportKwh > 0 ? (s.exportEarn / s.exportKwh) * 100 : null;
        return s;
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
