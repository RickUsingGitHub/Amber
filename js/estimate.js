(function (root) {
    const Amber = root.Amber = root.Amber || {};

    /*
     * Compare a household that isn't on Amber: read its meter data (NEM12, the standard format
     * retailers and distributors give out) and rebuild what Amber would have charged for each
     * interval from AEMO's 5-minute wholesale prices (data/prices) and the network's tariff
     * (js/networks.js). The result is stored as API-shaped usage items for a local "site", so the
     * rest of the app (Compare, Monthly, Daily, free-window plans) works on it unchanged.
     */

    const UOM_SCALE = { KWH: 1, WH: 0.001, MWH: 1000 };

    function splitLine(line) {
        if (line.indexOf('"') === -1) return line.split(',');
        return line.split(',').map((f) => f.replace(/^"(.*)"$/, '$1'));
    }

    /**
     * Parse a NEM12 file. Returns { ok, error, nmis: { NMI: { nmi, channels: { suffix: { suffix,
     * uom, intervalLength, kind ('import' | 'export'), days: { 'YYYY-MM-DD': [kWh per interval] },
     * kwh } } } }, nmi (the NMI with most data), skipped }.
     * Interval dates and times are NEM time (AEST); a later 300 row for the same day replaces an earlier one.
     */
    Amber.parseNem12 = function (text) {
        const out = { ok: false, error: null, nmis: {}, nmi: null, skipped: 0 };
        const src = String(text || '').replace(/^﻿/, '');
        if (!/(^|\n)\s*"?100"?,\s*"?NEM12/i.test(src)) {
            out.error = 'This doesn\'t look like a NEM12 file (it should start with a 100,NEM12 row). Ask the retailer or network for your interval data in NEM12 format.';
            return out;
        }
        let channel = null;
        src.split(/\r?\n/).forEach((raw) => {
            const line = raw.trim();
            if (!line) return;
            const f = splitLine(line);
            const rec = f[0];
            if (rec === '200') {
                const nmi = (f[1] || '').trim().toUpperCase();
                const suffix = (f[4] || f[3] || '').trim().toUpperCase();
                const uom = (f[7] || '').trim().toUpperCase();
                const len = parseInt(f[8], 10);
                const kind = suffix[0] === 'E' ? 'import' : (suffix[0] === 'B' ? 'export' : null);
                if (!nmi || !kind || !UOM_SCALE[uom] || ![5, 15, 30].includes(len)) {
                    channel = null;
                    out.skipped += 1;
                    return;
                }
                const n = out.nmis[nmi] || (out.nmis[nmi] = { nmi, channels: {} });
                channel = n.channels[suffix] || (n.channels[suffix] = { suffix, uom, intervalLength: len, kind, days: {}, kwh: 0, scale: UOM_SCALE[uom] });
                return;
            }
            if (rec === '300' && channel) {
                const d = f[1] || '';
                if (!/^\d{8}$/.test(d)) { out.skipped += 1; return; }
                const date = `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`;
                const n = 1440 / channel.intervalLength;
                const values = [];
                for (let i = 0; i < n; i++) {
                    const v = parseFloat(f[2 + i]);
                    values.push(Number.isFinite(v) ? Math.max(0, v) * channel.scale : 0);
                }
                if (channel.days[date]) channel.kwh -= channel.days[date].reduce((s, v) => s + v, 0);
                channel.days[date] = values;
                channel.kwh += values.reduce((s, v) => s + v, 0);
            }
        });
        let best = null;
        Object.keys(out.nmis).forEach((nmi) => {
            const n = out.nmis[nmi];
            const days = new Set();
            Object.values(n.channels).forEach((c) => Object.keys(c.days).forEach((d) => days.add(d)));
            n.days = Array.from(days).sort();
            n.firstDay = n.days[0] || null;
            n.lastDay = n.days[n.days.length - 1] || null;
            if (!best || n.days.length > out.nmis[best].days.length) best = nmi;
        });
        if (!best || !out.nmis[best].days.length) {
            out.error = 'No interval data was found in that NEM12 file.';
            return out;
        }
        out.nmi = best;
        out.ok = true;
        return out;
    };

    /**
     * Guess each NEM12 channel's role: B* = feed-in; E* = general, except a second E channel used
     * mostly overnight (10pm–7am), which is taken as controlled load.
     */
    Amber.guessNem12Roles = function (nmiData) {
        const roles = {};
        const imports = [];
        Object.values(nmiData.channels).forEach((c) => {
            if (c.kind === 'export') { roles[c.suffix] = c.kwh > 0 ? 'feedIn' : 'ignore'; return; }
            let night = 0;
            Object.values(c.days).forEach((values) => {
                const per = values.length / 24;
                values.forEach((v, i) => {
                    const hour = Math.floor(i / per);
                    if (hour >= 22 || hour < 7) night += v;
                });
            });
            imports.push({ suffix: c.suffix, kwh: c.kwh, nightShare: c.kwh > 0 ? night / c.kwh : 0 });
        });
        imports.sort((a, b) => a.nightShare - b.nightShare);
        imports.forEach((c, i) => {
            if (c.kwh <= 0) roles[c.suffix] = 'ignore';
            else if (i === 0) roles[c.suffix] = 'general';
            else roles[c.suffix] = c.nightShare > 0.6 ? 'controlledLoad' : 'general';
        });
        return roles;
    };

    // ---------- Wholesale prices ----------

    const priceCache = Object.create(null);

    /** Month keys (YYYY-MM) whose price files are needed for NEM days [first, last]. */
    Amber.priceMonthsFor = function (firstDay, lastDay) {
        const months = [];
        let y = parseInt(firstDay.substring(0, 4), 10);
        let m = parseInt(firstDay.substring(5, 7), 10);
        const end = lastDay.substring(0, 7);
        for (;;) {
            const key = `${y}-${String(m).padStart(2, '0')}`;
            months.push(key);
            if (key >= end) break;
            m += 1;
            if (m > 12) { m = 1; y += 1; }
        }
        return months;
    };

    /** Load the 5-minute price files for a region (browser: data/prices/...). Missing months are left out. */
    Amber.loadRegionPrices = async function (region, months, fetcher) {
        const get = fetcher || (async (url) => {
            const res = await fetch(url, { cache: 'force-cache' });
            if (!res.ok) return null;
            return res.json();
        });
        const out = {};
        await Promise.all(months.map(async (month) => {
            const key = `${region}/${month}`;
            if (!priceCache[key]) {
                priceCache[key] = get(`data/prices/${region}/${month}.json`).catch(() => null);
            }
            const data = await priceCache[key];
            if (data && Array.isArray(data.rrp)) out[month] = data.rrp;
            else delete priceCache[key];
        }));
        return out;
    };

    const monthStartMs = Object.create(null);
    function monthStart(month) {
        if (monthStartMs[month] == null) monthStartMs[month] = Date.UTC(+month.substring(0, 4), +month.substring(5, 7) - 1, 1);
        return monthStartMs[month];
    }

    /** Wholesale price ($/MWh) of the 5-minute interval ending at NEM ms (UTC+10 wall clock as UTC ms). */
    function rrpEnding(prices, endMs) {
        const startIso = new Date(endMs - 300000).toISOString();
        const month = startIso.substring(0, 7);
        const arr = prices[month];
        if (!arr) return null;
        const i = Math.round((endMs - monthStart(month)) / 300000) - 1;
        const v = arr[i];
        return v == null ? null : v;
    }

    /** Average wholesale price over an interval of `minutes` ending at endMs, or null if any part is missing. */
    Amber.rrpForInterval = function (prices, endMs, minutes) {
        const n = Math.max(1, Math.round((minutes || 5) / 5));
        let sum = 0;
        for (let k = 0; k < n; k++) {
            const v = rrpEnding(prices, endMs - k * 300000);
            if (v == null) return null;
            sum += v;
        }
        return sum / n;
    };

    // ---------- Network tariff lookups ----------

    function bandRate(spec, parts) {
        if (!spec) return 0;
        const bands = spec.bands || [];
        for (let i = 0; i < bands.length; i++) {
            if ((bands[i].windows || []).some((win) => Amber.windowMatches(win, parts))) return bands[i].rate;
        }
        return spec.rate || 0;
    }

    /** The import tariff's export part (two-way tariffs), else the chosen export tariff, else null. */
    function exportSpec(net, tariff, exportCode) {
        if (tariff && tariff.export) return tariff.export;
        return exportCode && net.exportTariffs && net.exportTariffs[exportCode] ? net.exportTariffs[exportCode] : null;
    }

    function controlledSpec(net, tariff, clCode) {
        if (tariff && tariff.controlled) return tariff.controlled;
        return clCode && net.controlled && net.controlled[clCode] ? net.controlled[clCode] : null;
    }

    /** Amber's fixed charges (inc GST) for a network tariff, in the app's amberRates shape. */
    Amber.estimatedAmberRates = function (networkKey, tariffCode, clCode, hasControlled) {
        const net = Amber.NETWORKS[networkKey];
        const tariff = net && net.tariffs[tariffCode];
        if (!tariff) return null;
        const cl = hasControlled ? (net.controlled || {})[clCode] : null;
        const daily = (tariff.daily || 0) + (net.metering || 0) + ((cl && cl.daily) || 0);
        const rates = {
            connectionCents: Math.round(daily * 1.1 * 1000) / 1000,
            subscriptionCents: Amber.AMBER_SUBSCRIPTION_CENTS,
            demandCents: tariff.demand ? Math.round(tariff.demand.rate * 1.1 * 1000) / 1000 : 0
        };
        if (tariff.demand && tariff.demand.byMonth) {
            rates.demandByMonth = {};
            Object.keys(tariff.demand.byMonth).forEach((m) => { rates.demandByMonth[m] = Math.round(tariff.demand.byMonth[m] * 1.1 * 1000) / 1000; });
        }
        return rates;
    };

    /**
     * Build Amber-priced usage items from parsed NEM12 data.
     * opts: { networkKey, tariffCode, exportCode, clCode, roles: { suffix: role }, greenPower, prices, siteId }
     * Returns { days: { date: items }, missingPrice: [dates], summary }.
     */
    Amber.estimateAmberUsage = function (nmiData, opts) {
        const o = opts || {};
        const net = Amber.NETWORKS[o.networkKey];
        if (!net) throw new Error('Unknown network.');
        const tariff = net.tariffs[o.tariffCode];
        if (!tariff) throw new Error('Unknown network tariff.');
        const exp = exportSpec(net, tariff, o.exportCode);
        const cl = controlledSpec(net, tariff, o.clCode);
        const timeZone = Amber.STATE_TIMEZONES[net.state] || 'Australia/Sydney';
        const clockOpts = { clock: 'local', timeZone };
        const lf = o.lossFactor || net.lossFactor || 1.05;
        const c = net.charges;
        const adder = c.environmental + c.market + c.hedging + (o.greenPower ? c.greenPower : 0);
        const prices = o.prices || {};
        const roles = o.roles || Amber.guessNem12Roles(nmiData);
        const demandWindow = tariff.demand ? tariff.demand.window : null;
        const days = {};
        const missingPrice = new Set();
        const summary = { generalKwh: 0, controlledKwh: 0, exportKwh: 0, wholesaleCents: 0, capCreditCents: 0, quarters: {} };

        const channels = Object.values(nmiData.channels).filter((ch) => roles[ch.suffix] && roles[ch.suffix] !== 'ignore');
        const allDates = new Set();
        channels.forEach((ch) => Object.keys(ch.days).forEach((d) => allDates.add(d)));
        // Every channel must have the day for it to count as a whole day.
        const dates = Array.from(allDates).filter((d) => channels.every((ch) => ch.days[d])).sort();

        dates.forEach((date) => {
            const items = [];
            let ok = true;
            const dayBase = Date.parse(`${date}T00:00:00Z`);
            channels.forEach((ch) => {
                if (!ok) return;
                const role = roles[ch.suffix];
                const len = ch.intervalLength;
                let freeLeft = exp && exp.freeKwhPerDay ? exp.freeKwhPerDay : 0;
                ch.days[date].forEach((kwh, i) => {
                    if (!ok) return;
                    const endMs = dayBase + (i + 1) * len * 60000;
                    const rrp = Amber.rrpForInterval(prices, endMs, len);
                    if (rrp == null) { ok = false; return; }
                    const nemTime = new Date(endMs).toISOString().substring(0, 19) + '+10:00';
                    const item = { type: 'Usage', source: 'nem12', estimate: true, date, nemTime, duration: len, kwh, channelIdentifier: ch.suffix, channelType: role, quality: 'billable' };
                    const parts = Amber.itemClockParts(item, clockOpts);
                    const wholesale = lf * rrp / 10;
                    if (role === 'feedIn') {
                        let network = bandRate(exp, parts);
                        // Exports up to the daily free level carry no export charge.
                        if (network > 0 && freeLeft > 0 && kwh > 0) {
                            const free = Math.min(freeLeft, kwh);
                            freeLeft -= free;
                            network *= (kwh - free) / kwh;
                        }
                        item.perKwh = -wholesale + network;
                        summary.exportKwh += kwh;
                    } else {
                        const network = role === 'controlledLoad' ? bandRate(cl, parts) : bandRate(tariff, parts);
                        item.wholesale = wholesale * 1.1;
                        item.perKwh = (wholesale + network + adder) * 1.1;
                        if (role === 'general') summary.generalKwh += kwh; else summary.controlledKwh += kwh;
                        summary.wholesaleCents += item.wholesale * kwh;
                        if (role === 'general' && demandWindow && Amber.windowMatches(demandWindow, parts)) item.tariffInformation = { demandWindow: true };
                    }
                    item.cost = item.perKwh * kwh;
                    items.push(item);
                });
            });
            if (!ok) { missingPrice.add(date); return; }
            days[date] = items;
        });

        // Amber's quarterly wholesale price cap: credit the usage-weighted wholesale part down to it.
        if (net.priceCap) {
            const quarters = {};
            Object.keys(days).forEach((date) => {
                const q = `${date.substring(0, 4)}-Q${Math.floor((parseInt(date.substring(5, 7), 10) - 1) / 3) + 1}`;
                const bucket = quarters[q] || (quarters[q] = { kwh: 0, cents: 0, items: [] });
                days[date].forEach((item) => {
                    if (item.wholesale == null) return;
                    bucket.kwh += item.kwh;
                    bucket.cents += item.kwh * item.wholesale;
                    bucket.items.push(item);
                });
            });
            Object.keys(quarters).forEach((q) => {
                const b = quarters[q];
                const avg = b.kwh > 0 ? b.cents / b.kwh : 0;
                summary.quarters[q] = { averageWholesale: avg, capped: avg > net.priceCap };
                if (avg <= net.priceCap) return;
                const factor = net.priceCap / avg;
                b.items.forEach((item) => {
                    const cut = item.wholesale * (1 - factor);
                    item.perKwh -= cut;
                    item.cost = item.perKwh * item.kwh;
                    summary.capCreditCents += cut * item.kwh;
                });
            });
        }
        Object.values(days).forEach((items) => items.forEach((item) => { delete item._clockParts; }));
        return { days, missingPrice: Array.from(missingPrice).sort(), summary, lossFactor: lf, timeZone };
    };

    /** Local site record for an estimated (non-Amber) household. */
    Amber.estimateSite = function (nmiData, opts) {
        const net = Amber.NETWORKS[opts.networkKey];
        const roles = opts.roles || Amber.guessNem12Roles(nmiData);
        const channels = [];
        Object.keys(nmiData.channels).forEach((suffix) => {
            const role = roles[suffix];
            if (!role || role === 'ignore') return;
            const tariff = role === 'general' ? opts.tariffCode
                : (role === 'feedIn' ? (opts.exportCode || (net.tariffs[opts.tariffCode] && net.tariffs[opts.tariffCode].export ? opts.tariffCode : ''))
                    : opts.clCode);
            channels.push({ identifier: suffix, type: role, tariff: tariff || '' });
        });
        const hasControlled = channels.some((ch) => ch.type === 'controlledLoad');
        return {
            id: `nem12-${nmiData.nmi}`,
            nmi: nmiData.nmi,
            network: net.name,
            status: 'active',
            local: true,
            channels,
            amberRates: Amber.estimatedAmberRates(opts.networkKey, opts.tariffCode, opts.clCode, hasControlled),
            estimate: {
                networkKey: opts.networkKey, tariffCode: opts.tariffCode, exportCode: opts.exportCode || '', clCode: hasControlled ? opts.clCode : '',
                greenPower: !!opts.greenPower, state: net.state, region: net.region, builtAt: new Date().toISOString()
            }
        };
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
