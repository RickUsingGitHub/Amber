(function (root) {
    const Amber = root.Amber = root.Amber || {};

    /*
     * Import of Amber's usage export (CSV), so periods older than the API's ~3 months can be
     * compared. Columns (per Amber): Start Time and End Time are local time; NEM Time is the
     * interval end in NEM time (UTC+10, as the API's nemTime); NEM Day is the NEM date; Price is
     * c/kWh inc GST (feed-in multiplied by -1, the same sign as the API's perKwh); Usage is kWh;
     * Cost is ¢ inc GST.
     *
     * Rows become API-shaped usage items and are stored in the same per-day cache the API fills,
     * so every part of the app (Compare, Monthly, Bill Check, free-window plans) can use them.
     */

    const CHANNEL_TYPES = {
        general: 'general',
        controlled: 'controlledLoad',
        controlledload: 'controlledLoad',
        feedin: 'feedIn',
        'feed in': 'feedIn',
        export: 'feedIn'
    };

    /**
     * Network demand windows by tariff code, for flagging imported intervals the way the API's
     * tariffInformation.demandWindow does. Local (wall clock) start time and months.
     * Ausgrid residential demand: highest 30 min 3pm–9pm, Nov–Mar and Jun–Aug (from 1 July 2024).
     */
    Amber.DEMAND_WINDOWS = {
        EA111: { start: '15:00', end: '21:00', months: [11, 12, 1, 2, 3, 6, 7, 8] },
        EA116: { start: '15:00', end: '21:00', months: [11, 12, 1, 2, 3, 6, 7, 8] }
    };

    function splitCsvLine(line) {
        if (line.indexOf('"') === -1) return line.split(',');
        const out = [];
        let cur = '';
        let quoted = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (quoted) {
                if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c;
            } else if (c === '"') quoted = true;
            else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
        }
        out.push(cur);
        return out;
    }

    function wallMinutes(str) {
        // "YYYY-MM-DD HH:MM:SS" (or with T) -> minutes since epoch of that wall-clock time (as UTC).
        const t = Date.parse(String(str).replace(' ', 'T') + 'Z');
        return Number.isFinite(t) ? t / 60000 : NaN;
    }

    /**
     * Parse an Amber usage export. Returns { ok, error, rows, channels, byDate, days, firstDay,
     * lastDay, intervalMinutes }. byDate: NEM date -> rows [{ nemTime, date, duration, kwh,
     * perKwh, cost, channelIdentifier, channelType, localMonth, localTime }].
     */
    Amber.parseAmberUsageCsv = function (text) {
        const out = { ok: false, error: null, rows: 0, channels: {}, byDate: {}, days: [], firstDay: null, lastDay: null, intervalMinutes: null };
        const src = String(text || '').replace(/^﻿/, '');
        let pos = src.indexOf('\n');
        const headerLine = (pos === -1 ? src : src.substring(0, pos)).replace(/\r$/, '');
        const header = splitCsvLine(headerLine).map((h) => h.trim().toLowerCase());
        const col = (name) => header.indexOf(name);
        const iNem = col('nem time');
        const iDay = col('nem day');
        const iType = col('channel type');
        const iId = col('channel identifier');
        const iPrice = col('price');
        const iUsage = col('usage');
        const iCost = col('cost');
        const iStart = col('start time');
        const iEnd = col('end time');
        if ([iNem, iDay, iType, iId, iPrice, iUsage].some((i) => i < 0)) {
            out.error = 'This doesn\'t look like an Amber usage export. Expected columns: NEM Time, NEM Day, Channel Type, Channel Identifier, Price, Usage.';
            return out;
        }
        const durations = {};
        const seen = new Set();
        let skipped = 0;
        let duplicates = 0;
        let start = pos === -1 ? src.length : pos + 1;
        while (start < src.length) {
            let end = src.indexOf('\n', start);
            if (end === -1) end = src.length;
            let line = src.substring(start, end);
            start = end + 1;
            if (line.charCodeAt(line.length - 1) === 13) line = line.substring(0, line.length - 1);
            if (!line) continue;
            const f = splitCsvLine(line);
            const nem = f[iNem];
            const date = f[iDay];
            const id = f[iId];
            const type = CHANNEL_TYPES[String(f[iType] || '').trim().toLowerCase()];
            const kwh = parseFloat(f[iUsage]);
            const perKwh = parseFloat(f[iPrice]);
            if (!nem || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !id || !type || !Number.isFinite(kwh) || !Number.isFinite(perKwh)) {
                skipped += 1;
                continue;
            }
            const key = id + '|' + nem;
            if (seen.has(key)) { duplicates += 1; continue; }
            seen.add(key);
            let duration = null;
            let localMonth = null;
            let localTime = null;
            if (iStart >= 0 && f[iStart]) {
                const s = f[iStart];
                localMonth = parseInt(s.substring(5, 7), 10);
                localTime = parseInt(s.substring(11, 13), 10) * 100 + parseInt(s.substring(14, 16), 10);
                if (iEnd >= 0 && f[iEnd]) {
                    // Start is 1 s after the previous end; DST changes make some local spans odd.
                    const d = Math.round(wallMinutes(f[iEnd]) - wallMinutes(s) + 1 / 60);
                    if (d >= 1 && d <= 60) duration = d;
                }
            }
            if (duration) durations[duration] = (durations[duration] || 0) + 1;
            const channel = out.channels[id] || (out.channels[id] = { identifier: id, type, rows: 0, kwh: 0 });
            channel.rows += 1;
            channel.kwh += kwh;
            const row = {
                nemTime: nem.replace(' ', 'T').substring(0, 19) + '+10:00',
                date,
                duration,
                kwh,
                perKwh,
                cost: iCost >= 0 ? parseFloat(f[iCost]) : kwh * perKwh,
                channelIdentifier: id,
                channelType: type,
                localMonth,
                localTime
            };
            (out.byDate[date] || (out.byDate[date] = [])).push(row);
            out.rows += 1;
        }
        let mode = null;
        Object.keys(durations).forEach((d) => { if (mode == null || durations[d] > durations[mode]) mode = d; });
        out.intervalMinutes = mode != null ? parseInt(mode, 10) : 30;
        Object.keys(out.byDate).forEach((date) => {
            out.byDate[date].forEach((row) => { if (!row.duration) row.duration = out.intervalMinutes; });
        });
        out.days = Object.keys(out.byDate).sort();
        out.firstDay = out.days[0] || null;
        out.lastDay = out.days[out.days.length - 1] || null;
        out.skipped = skipped;
        out.duplicates = duplicates;
        if (!out.rows) {
            out.error = 'No usage rows were found in that file.';
            return out;
        }
        out.ok = true;
        return out;
    };

    /**
     * Map export channel identifiers onto the site's channels: same identifier and type first,
     * otherwise the site's only channel of that type. Returns { map: csvId -> siteId|null, notes }.
     */
    Amber.mapImportChannels = function (csvChannels, siteChannels) {
        const map = {};
        const notes = [];
        const site = siteChannels || [];
        Object.keys(csvChannels).forEach((id) => {
            const c = csvChannels[id];
            const exact = site.find((s) => s.identifier === id && s.type === c.type);
            if (exact) { map[id] = exact.identifier; return; }
            const sameType = site.filter((s) => s.type === c.type);
            if (sameType.length === 1) {
                map[id] = sameType[0].identifier;
                notes.push(`${id} (${c.type}) imported as ${sameType[0].identifier}.`);
                return;
            }
            map[id] = null;
            if (c.kwh > 0) notes.push(`${id} (${c.type}) has no matching channel on this site, so it was left out.`);
        });
        return { map, notes };
    };

    /** Demand-window rule for the site's general channel tariff, or null. */
    Amber.demandWindowForSite = function (site) {
        const channels = (site && site.channels) || [];
        const general = channels.find((c) => c.type === 'general' && Amber.DEMAND_WINDOWS[c.tariff]);
        return general ? Object.assign({ tariff: general.tariff }, Amber.DEMAND_WINDOWS[general.tariff]) : null;
    };

    const DEMAND_FLAG = Object.freeze({ demandWindow: true });

    function inDemandWindow(rule, row) {
        if (!rule || row.channelType !== 'general' || row.localTime == null) return false;
        if (rule.months && rule.months.indexOf(row.localMonth) === -1) return false;
        const s = parseInt(rule.start.replace(':', ''), 10);
        const e = parseInt(rule.end.replace(':', ''), 10);
        return row.localTime >= s && row.localTime < e;
    }

    /**
     * API-shaped items for one imported day, or null when the day isn't a whole day of data.
     * opts: { channelMap, demandRule }.
     */
    Amber.importDayItems = function (rows, opts) {
        const o = opts || {};
        const items = [];
        rows.forEach((row) => {
            const id = o.channelMap ? o.channelMap[row.channelIdentifier] : row.channelIdentifier;
            if (!id) return;
            const item = {
                type: 'Usage',
                source: 'csv',
                date: row.date,
                nemTime: row.nemTime,
                duration: row.duration,
                kwh: row.kwh,
                perKwh: row.perKwh,
                cost: row.cost,
                channelIdentifier: id,
                channelType: row.channelType,
                quality: 'billable'
            };
            if (inDemandWindow(o.demandRule, row)) item.tariffInformation = DEMAND_FLAG;
            items.push(item);
        });
        return Amber.isCompleteDay(items) ? items : null;
    };

    /**
     * Plan which days to write: whole days, older than recentDays (left for the API, which may
     * still revise them), and not already cached from the API unless replace is set.
     * cachedByDate: date -> cached items. Returns { write: [{ id, data }], kept, recent, partial, mapped }.
     */
    Amber.planUsageImport = function (parsed, site, cachedByDate, opts) {
        const o = opts || {};
        const recentCutoff = o.recentCutoff || null;
        const { map, notes } = Amber.mapImportChannels(parsed.channels, site.channels);
        // Leave out channels with no usage at all (e.g. an unused controlled load).
        Object.keys(parsed.channels).forEach((id) => { if (!(parsed.channels[id].kwh > 0)) map[id] = null; });
        const demandRule = Amber.demandWindowForSite(site);
        const result = { write: [], kept: 0, recent: 0, partial: 0, notes, demandRule, channelMap: map };
        parsed.days.forEach((date) => {
            if (recentCutoff && date >= recentCutoff) { result.recent += 1; return; }
            const cached = cachedByDate && cachedByDate[date];
            if (!o.replace && cached && cached.length && Amber.isCompleteDay(cached) && !cached.some((i) => i.source === 'csv')) {
                result.kept += 1;
                return;
            }
            const items = Amber.importDayItems(parsed.byDate[date], { channelMap: map, demandRule });
            if (!items) { result.partial += 1; return; }
            result.write.push({ id: `${site.id}_${date}`, data: items, date });
        });
        return result;
    };

    /** Write planned days in batches, reporting progress (0..1). */
    Amber.writeUsageImport = async function (db, entries, onProgress) {
        const BATCH = 31;
        for (let i = 0; i < entries.length; i += BATCH) {
            await Amber.setUsageDataMany(db, entries.slice(i, i + BATCH));
            if (onProgress) onProgress(Math.min(1, (i + BATCH) / entries.length));
        }
    };

    /** First and last day of the whole calendar months in a sorted list of dates. */
    Amber.wholeMonthSpan = function (dates) {
        const months = Amber.fullMonths(dates);
        if (!months.length) return null;
        const last = months[months.length - 1];
        const y = parseInt(last.substring(0, 4), 10);
        const m = parseInt(last.substring(5, 7), 10);
        return { start: `${months[0]}-01`, end: `${last}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`, months };
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
