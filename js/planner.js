(function (root) {
    const Amber = root.Amber = root.Amber || {};

    /*
     * Solar & battery planner.
     *
     * "Next year" is the household's last 12 months of meter data (Amber's API or an imported
     * NEM12 file), with any new solar, battery and future loads (EV, heat pump...) layered on,
     * priced at today's plan rates (Amber: the last 12 months of its own prices).
     *
     * Everything runs on half-hour slots: 365 days × 48. Every plan's rate windows start and end
     * on the hour or half hour, so half-hourly pricing equals pricing the 5-minute readings; the
     * planner's cost of the unchanged year matches the Compare tab exactly (see unit-planner.js).
     */

    const SLOTS = 48;
    const DAYS = 365;
    Amber.PLANNER_DAYS = DAYS;

    // ---------- The year of meter data ----------

    function slotOf(item) {
        const nem = item.processedTime ? item.nemTime : Amber.adjustNemTime(item.nemTime);
        if (!nem || nem.length < 16) return -1;
        const h = parseInt(nem.substring(11, 13), 10);
        const m = parseInt(nem.substring(14, 16), 10);
        return h * 2 + (m >= 30 ? 1 : 0);
    }

    /** NEM time (+10:00) string of a slot's last second, the same instant an interval ending then is priced at. */
    function slotNemString(dateStr, slot) {
        const minute = slot * 30 + 29;
        return `${dateStr}T${Amber.pad(Math.floor(minute / 60))}:${Amber.pad(minute % 60)}:59+10:00`;
    }
    Amber.plannerSlotNem = slotNemString;

    function weekdayOf(dateStr) {
        return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
    }

    /**
     * Half-hourly arrays for the 365 days ending opts.lastDay (default: the latest whole day),
     * from cached usage items by NEM date. Days missing in that window (at most opts.maxFill,
     * default 31) are filled from the nearest whole day on the same weekday.
     * Returns { ok, reason, ... } with:
     *   dates[365], imp/exp/cl (kWh per slot), amberImp/amberCl/amberExp (c/kWh; amberExp is
     *   NaN where the data has no feed-in reading, negative = credit), demandFlag (Amber network
     *   demand window), filled (dates that were filled), first, last.
     */
    Amber.planYear = function (byDate, opts) {
        const o = opts || {};
        const types = o.channelTypes || {};
        const whole = (d) => byDate[d] && byDate[d].length && Amber.coversWholeDay(byDate[d]);
        const days = Object.keys(byDate || {}).filter(whole).sort();
        if (!days.length) return { ok: false, reason: 'none', have: 0, need: DAYS };
        const last = o.lastDay || days[days.length - 1];
        const first = Amber.addDays(last, -(DAYS - 1));
        const have = new Set(days);
        const dates = [];
        for (let d = first; dates.length < DAYS; d = Amber.addDays(d, 1)) dates.push(d);
        const inWindow = dates.filter((d) => have.has(d)).length;
        const maxFill = o.maxFill != null ? o.maxFill : 31;
        if (DAYS - inWindow > maxFill) return { ok: false, reason: 'short', have: inWindow, need: DAYS, first, last };

        const n = DAYS * SLOTS;
        const y = {
            ok: true, first, last, dates, days: DAYS, n, filled: [],
            imp: new Float64Array(n), exp: new Float64Array(n), cl: new Float64Array(n),
            amberImp: new Float64Array(n), amberCl: new Float64Array(n), amberExp: new Float64Array(n).fill(NaN),
            demandFlag: new Uint8Array(n), hasFeedIn: false, hasCl: false, parts: Object.create(null)
        };
        const sum = { imp: new Float64Array(n), cl: new Float64Array(n), exp: new Float64Array(n) };
        const plain = { imp: new Float64Array(n), cl: new Float64Array(n), exp: new Float64Array(n) };
        const count = { imp: new Uint16Array(n), cl: new Uint16Array(n), exp: new Uint16Array(n) };
        const key = { general: 'imp', controlledLoad: 'cl', feedIn: 'exp' };

        dates.forEach((date, d) => {
            let src = date;
            if (!have.has(date)) {
                src = null;
                for (let k = 1; k <= 8 && !src; k++) {
                    if (have.has(Amber.addDays(date, -7 * k))) src = Amber.addDays(date, -7 * k);
                    else if (have.has(Amber.addDays(date, 7 * k))) src = Amber.addDays(date, 7 * k);
                }
                if (!src) return;
                y.filled.push(date);
            }
            byDate[src].forEach((item) => {
                const type = types[item.channelIdentifier] || item.channelType;
                const k = key[type];
                const s = slotOf(item);
                if (!k || s < 0) return;
                const i = d * SLOTS + s;
                const kwh = Amber.absKwh(item.kwh);
                const price = parseFloat(item.perKwh);
                y[k][i] += kwh;
                if (Number.isFinite(price)) {
                    sum[k][i] += price * kwh;
                    plain[k][i] += price;
                    count[k][i] += 1;
                }
                if (k === 'exp') y.hasFeedIn = true;
                if (k === 'cl') y.hasCl = true;
                if (k === 'imp' && item.tariffInformation && item.tariffInformation.demandWindow === true) y.demandFlag[i] = 1;
            });
        });
        const price = (k, i) => {
            if (!count[k][i]) return NaN;
            return y[k][i] > 0 ? sum[k][i] / y[k][i] : plain[k][i] / count[k][i];
        };
        for (let i = 0; i < n; i++) {
            y.amberImp[i] = price('imp', i);
            y.amberCl[i] = price('cl', i);
            y.amberExp[i] = price('exp', i);
        }
        // A slot with no general reading at all (rare): carry the previous slot's import price.
        for (let i = 0; i < n; i++) {
            if (!Number.isFinite(y.amberImp[i])) y.amberImp[i] = i > 0 ? y.amberImp[i - 1] : 0;
            if (!Number.isFinite(y.amberCl[i])) y.amberCl[i] = i > 0 && Number.isFinite(y.amberCl[i - 1]) ? y.amberCl[i - 1] : y.amberImp[i];
        }
        return y;
    };

    /** Clock parts of every slot for a clock ({ clock, timeZone }), cached on the year. */
    function slotParts(year, clockOpts) {
        const k = `${clockOpts.clock || 'local'}|${clockOpts.timeZone || ''}`;
        if (year.parts[k]) return year.parts[k];
        const out = new Array(year.n);
        for (let d = 0; d < year.days; d++) {
            for (let s = 0; s < SLOTS; s++) {
                out[d * SLOTS + s] = Amber.getClockParts(slotNemString(year.dates[d], s), clockOpts);
            }
        }
        year.parts[k] = out;
        return out;
    }
    Amber.plannerSlotParts = slotParts;

    /**
     * Fill Amber feed-in prices for slots the data has none for (no solar today): −(loss factor ×
     * wholesale) + the network's export band, as Amber prices a NEM12 household (estimate.js).
     * prices: { 'YYYY-MM': [5-min RRP $/MWh] } for the region. Returns how many slots stayed unpriced
     * (left at 0 c/kWh).
     */
    Amber.fillPlannerExportPrices = function (year, opts) {
        const o = opts || {};
        const net = o.net || null;
        const spec = net && o.exportCode && net.exportTariffs ? net.exportTariffs[o.exportCode] : (o.exportSpec || null);
        const lf = o.lossFactor || (net && net.lossFactor) || 1.05;
        const tz = (net && Amber.STATE_TIMEZONES[net.state]) || o.timeZone || 'Australia/Sydney';
        const parts = slotParts(year, { clock: 'local', timeZone: tz });
        let unpriced = 0;
        for (let i = 0; i < year.n; i++) {
            if (Number.isFinite(year.amberExp[i])) continue;
            const d = Math.floor(i / SLOTS);
            const s = i % SLOTS;
            const endMs = Date.parse(`${year.dates[d]}T00:00:00Z`) + (s + 1) * 1800000;
            const rrp = o.prices ? Amber.rrpForInterval(o.prices, endMs, 30) : null;
            if (rrp == null) { year.amberExp[i] = 0; unpriced += 1; continue; }
            let band = 0;
            if (spec) {
                const bands = spec.bands || [];
                band = spec.rate || 0;
                for (let b = 0; b < bands.length; b++) {
                    if ((bands[b].windows || []).some((w) => Amber.windowMatches(w, parts[i]))) { band = bands[b].rate; break; }
                }
            }
            year.amberExp[i] = -lf * rrp / 10 + band;
        }
        year.exportUnpriced = unpriced;
        return unpriced;
    };

    // ---------- A plan's half-hourly rates ----------

    function weekdaysInRange(from, to, weekdays) {
        let count = 0;
        for (let d = from; d <= to; d = Amber.addDays(d, 1)) if (weekdays.includes(weekdayOf(d))) count += 1;
        return count;
    }

    /**
     * Half-hourly rates of a retail plan (c/kWh, inc GST) for a year, in the plan's own clock.
     * Free windows with a daily cap carry the rate that applies over the cap (alt); capped
     * feed-in windows carry their window index, cap and over-cap rate.
     */
    Amber.planRateCard = function (year, planConfig, state) {
        const plan = planConfig || {};
        const parts = slotParts(year, Amber.clockOptionsForState(state, plan));
        const n = year.n;
        const card = { plan, imp: new Float64Array(n), exp: new Float64Array(n), daily: parseFloat(plan.daily) || 0 };
        const flat = parseFloat(plan.flat) || 0;
        if (plan.rateType === 'flat') {
            card.imp.fill(flat);
            const cl = parseFloat(plan.cl);
            card.clRate = Number.isFinite(cl) && cl > 0 ? cl : flat;
        } else {
            card.clRate = parseFloat(plan.cl) || 0;
            const free = plan.tou && plan.tou.free;
            const cap = free && (free.windows || []).length ? parseFloat(free.capKwh) : NaN;
            const capped = Number.isFinite(cap) && cap > 0;
            if (capped) {
                card.freeCap = cap;
                card.free = new Uint8Array(n);
                card.alt = new Float64Array(n);
            }
            for (let i = 0; i < n; i++) {
                const p = Amber.getTouPeriod(parts[i], plan.tou, flat);
                card.imp[i] = p.rate;
                if (capped && p.period === 'free') {
                    card.free[i] = 1;
                    card.alt[i] = Amber.getTouPeriod(parts[i], plan.tou, flat, true).rate;
                }
            }
        }
        const windows = plan.feedInWindows || [];
        const defaultFeedIn = parseFloat(plan.feedIn) || 0;
        if (!windows.length) {
            card.exp.fill(defaultFeedIn);
        } else {
            const cappedWin = windows.some((w) => parseFloat(w.capKwh) > 0);
            if (cappedWin) card.expWin = new Int8Array(n).fill(-1);
            card.expWindows = windows.map((w) => ({
                rate: parseFloat(w.rate) || 0,
                cap: parseFloat(w.capKwh) > 0 ? parseFloat(w.capKwh) : 0,
                over: Number.isFinite(parseFloat(w.overRate)) ? parseFloat(w.overRate) : defaultFeedIn
            }));
            for (let i = 0; i < n; i++) {
                let idx = -1;
                for (let w = 0; w < windows.length; w++) if (Amber.windowMatches(windows[w], parts[i])) { idx = w; break; }
                card.exp[i] = idx >= 0 ? card.expWindows[idx].rate : defaultFeedIn;
                if (card.expWin && idx >= 0 && card.expWindows[idx].cap > 0) card.expWin[i] = idx;
            }
        }
        // Days in the plan's clock (daily caps reset at its midnight).
        if (card.free || card.expWin) {
            card.day = new Int32Array(n);
            const index = Object.create(null);
            let next = 0;
            for (let i = 0; i < n; i++) {
                const k = parts[i].dateStr;
                if (index[k] == null) index[k] = next++;
                card.day[i] = index[k];
            }
        }
        const demand = plan.demand;
        if (demand && demand.e && (demand.days || []).length) {
            card.demandRate = parseFloat(demand.r) || 0;
            card.demandSlot = new Uint8Array(n);
            card.demandBlock = new Array(n);
            for (let i = 0; i < n; i++) {
                if (demand.days.includes(parts[i].weekday) && Amber.timeInWindow(parts[i], demand.s, demand.f)) {
                    card.demandSlot[i] = 1;
                    card.demandBlock[i] = Amber.thirtyMinBlockKey(parts[i]);
                }
            }
            // Applicable days per NEM month, clipped to the year.
            card.demandDays = Object.create(null);
            monthsOf(year).forEach((m) => {
                card.demandDays[m.key] = weekdaysInRange(m.from, m.to, demand.days);
            });
        }
        return card;
    };

    function monthsOf(year) {
        if (year.months) return year.months;
        const out = [];
        year.dates.forEach((date, d) => {
            const key = date.substring(0, 7);
            const last = out[out.length - 1];
            if (last && last.key === key) { last.to = date; last.endDay = d; } else out.push({ key, from: date, to: date, startDay: d, endDay: d });
        });
        year.months = out;
        return out;
    }
    Amber.plannerMonths = monthsOf;

    // Whole days [from, to] of the year (default: all of it).
    function rangeOf(year, range) {
        return range ? { from: Math.max(0, range.from), to: Math.min(year.days - 1, range.to) } : { from: 0, to: year.days - 1 };
    }

    /**
     * A plan's cost ($, inc GST) for half-hourly import/export/controlled-load kWh, for the year or
     * whole days range { from, to } (day indexes; demand counts whole months it touches). Matches
     * Amber.computePlanTotals on the same readings (one general and one feed-in channel).
     * Returns { total, usage, controlled, feedIn, daily, demand }.
     */
    Amber.planCardCost = function (year, card, imp, exp, cl, range) {
        const r = rangeOf(year, range);
        const lo = r.from * SLOTS;
        const hi = (r.to + 1) * SLOTS;
        let usage = 0;
        if (!card.free) {
            for (let i = lo; i < hi; i++) usage += imp[i] * card.imp[i];
        } else {
            let day = -1;
            let used = 0;
            for (let i = lo; i < hi; i++) {
                if (!card.free[i]) { usage += imp[i] * card.imp[i]; continue; }
                if (card.day[i] !== day) { day = card.day[i]; used = 0; }
                const within = Math.max(0, Math.min(imp[i], card.freeCap - used));
                usage += within * card.imp[i] + (imp[i] - within) * card.alt[i];
                used += imp[i];
            }
        }
        let feedIn = 0;
        if (!card.expWin) {
            for (let i = lo; i < hi; i++) feedIn += exp[i] * card.exp[i];
        } else {
            const used = Object.create(null);
            for (let i = lo; i < hi; i++) {
                const w = card.expWin[i];
                if (w < 0) { feedIn += exp[i] * card.exp[i]; continue; }
                const win = card.expWindows[w];
                const k = card.day[i] * 8 + w;
                const sofar = used[k] || 0;
                const within = Math.max(0, Math.min(exp[i], win.cap - sofar));
                feedIn += within * win.rate + (exp[i] - within) * win.over;
                used[k] = sofar + exp[i];
            }
        }
        let controlled = 0;
        if (cl) for (let i = lo; i < hi; i++) controlled += cl[i] * card.clRate;
        let demand = 0;
        if (card.demandSlot) {
            monthsOf(year).filter((m) => m.endDay >= r.from && m.startDay <= r.to).forEach((m) => {
                const blocks = Object.create(null);
                let any = false;
                for (let i = m.startDay * SLOTS; i < (m.endDay + 1) * SLOTS; i++) {
                    if (!card.demandSlot[i]) continue;
                    any = true;
                    const b = card.demandBlock[i];
                    blocks[b] = (blocks[b] || 0) + imp[i];
                }
                if (!any) return;
                let peak = 0;
                Object.keys(blocks).forEach((b) => { if (blocks[b] > peak) peak = blocks[b]; });
                if (peak > 0) demand += peak * 2 * (card.demandRate / 100) * (card.demandDays[m.key] || 0);
            });
        }
        const daily = card.daily * (r.to - r.from + 1) / 100;
        const out = { usage: usage / 100, controlled: controlled / 100, feedIn: -feedIn / 100, daily, demand };
        out.total = out.usage + out.controlled + out.feedIn + out.daily + out.demand;
        return out;
    };

    // ---------- Amber ----------

    /**
     * Amber's setup for a year: rates ({ connectionCents, subscriptionCents, demandCents,
     * demandByMonth, earlier }) and the export tariff settled on the bill (Ausgrid EA029), as
     * Amber.resolveExportTariff finds it for the site's feed-in channel.
     */
    Amber.amberPlannerModel = function (year, site, rates) {
        const feedIn = ((site && site.channels) || []).find((c) => c.type === 'feedIn') || { type: 'feedIn', tariff: '' };
        const tariff = Amber.resolveExportTariff(site, feedIn);
        const model = { rates: rates || {}, tariff };
        if (tariff) {
            const parts = slotParts(year, { clock: tariff.clock || 'local', timeZone: tariff.timeZone || 'Australia/Sydney' });
            model.midday = new Uint8Array(year.n);
            for (let i = 0; i < year.n; i++) if (Amber.intervalEndInWindow(parts[i], tariff.middayStart, tariff.middayEnd)) model.midday[i] = 1;
        }
        return model;
    };

    /**
     * Amber's cost ($, inc GST) for half-hourly kWh: interval prices, the export settlement,
     * monthly network demand and the daily charges. Matches Amber.periodTotals on the same readings.
     * Returns { total, usage, controlled, feedIn, exportCharge, demand, connection, subscription }.
     */
    Amber.amberCardCost = function (year, model, imp, exp, cl, range) {
        const r = rangeOf(year, range);
        const days = r.to - r.from + 1;
        let usage = 0;
        let controlled = 0;
        let feedIn = 0;
        let midday = 0;
        for (let i = r.from * SLOTS; i < (r.to + 1) * SLOTS; i++) {
            usage += imp[i] * year.amberImp[i];
            if (cl) controlled += cl[i] * year.amberCl[i];
            feedIn += exp[i] * year.amberExp[i];
            if (model.midday && model.midday[i]) midday += exp[i];
        }
        usage /= 100;
        controlled /= 100;
        feedIn /= 100;
        let exportCharge = 0;
        if (model.tariff) {
            const t = model.tariff;
            const exRate = t.chargeExGst != null ? t.chargeExGst : (t.chargeIncGst || 0) / 1.1;
            const rate = t.chargeIncGst != null ? t.chargeIncGst : exRate * 1.1;
            const charged = Math.max(0, midday - (t.belKwhPerDay || 0) * days);
            feedIn -= midday * exRate / 100;
            exportCharge = charged * rate / 100;
        }
        let demand = 0;
        monthsOf(year).filter((m) => m.endDay >= r.from && m.startDay <= r.to).forEach((m) => {
            let peak = 0;
            const demandDays = new Set();
            for (let i = m.startDay * SLOTS; i < (m.endDay + 1) * SLOTS; i++) {
                if (!year.demandFlag[i]) continue;
                demandDays.add(Math.floor(i / SLOTS));
                if (imp[i] > peak) peak = imp[i];
            }
            if (peak > 0) {
                const rate = Amber.demandCentsFor(model.rates, m.key);
                const c = rate != null ? rate : Amber.DEFAULT_AMBER_DEMAND_CENTS;
                demand += peak * 2 * (c / 100) * demandDays.size;
            }
        });
        const fixed = Amber.amberFixedForPeriod(model.rates, year.dates[r.from], year.dates[r.to]);
        const out = { usage: usage + exportCharge, controlled, feedIn, exportCharge, demand, connection: fixed.connection, subscription: fixed.subscription };
        out.total = out.usage + out.controlled + out.feedIn + out.demand + out.connection + out.subscription;
        return out;
    };

    // ---------- A scenario's meter flows ----------

    /**
     * The year's import/export/controlled-load after new solar and extra loads, before any battery.
     * opts: { solar: kWh per slot (AC), extra: kWh per slot added to general use (EV, heat pump...),
     * clScale: multiplier on controlled load (0 = hot water moved off it), exportLimitKw }.
     * Solar first covers the slot's own use; the rest is exported, up to the export limit (exports
     * the data already has above the limit are kept: that's the existing system).
     */
    Amber.plannerFlows = function (year, opts) {
        const o = opts || {};
        const n = year.n;
        const imp = Float64Array.from(year.imp);
        const exp = Float64Array.from(year.exp);
        const cl = Float64Array.from(year.cl);
        if (o.clScale != null && o.clScale !== 1) for (let i = 0; i < n; i++) cl[i] *= o.clScale;
        if (o.extra) for (let i = 0; i < n; i++) imp[i] += o.extra[i];
        let solarKwh = 0;
        let solarSelf = 0;
        if (o.solar) {
            for (let i = 0; i < n; i++) {
                const g = o.solar[i];
                if (!(g > 0)) continue;
                const self = Math.min(imp[i], g);
                imp[i] -= self;
                exp[i] += g - self;
                solarKwh += g;
                solarSelf += self;
            }
        }
        let expCap = null;
        let curtailed = 0;
        let expRaw = exp;
        if (o.exportLimitKw != null && o.exportLimitKw >= 0) {
            expCap = new Float64Array(n);
            const limit = o.exportLimitKw * 0.5;
            const meter = year.meterExp || year.exp;
            expRaw = Float64Array.from(exp);
            for (let i = 0; i < n; i++) {
                // What the meter already sent out keeps its room (the existing system did it within its
                // own limit); anything new only uses what's left under the limit. With a battery taken
                // out of the readings, year.exp also holds the solar that battery soaked up, which never
                // reached the meter: the limit is measured against the meter (meterExp), not that.
                expCap[i] = Math.max(limit, meter[i]);
                if (exp[i] > expCap[i]) { curtailed += exp[i] - expCap[i]; exp[i] = expCap[i]; }
            }
        }
        // exp: what reaches the grid with no battery (capped); expRaw: the spare power before the
        // cap, which a battery can soak up before the limit throws the rest away.
        return { imp, exp, expRaw, cl, expCap, solarKwh, solarSelf, curtailed };
    };

    // ---------- What the household already has: solar and a battery ----------

    // kWh in a half hour that counts as "next to nothing bought" (a battery holding the home near 0).
    const COVERED = 0.05;

    /**
     * Signs of existing panels and a battery in the readings. cosZ: the sun's cos(zenith) for each
     * slot (Amber.solarCosZenithSlots). A battery shows as power sent out after dark, or as hours
     * of the night with next to nothing bought (a home on its own uses more than that).
     * Returns { exportDays, darkDays, quietNights, battery, reason ('dark' | 'quiet' | ''), solarKw }.
     */
    Amber.plannerDetectExisting = function (year, cosZ) {
        let exportDays = 0;
        let darkDays = 0;
        let quietNights = 0;
        const peaks = [];
        for (let d = 0; d < year.days; d++) {
            let dayExp = 0;
            let darkExp = 0;
            let run = 0;
            let longest = 0;
            for (let s = 0; s < SLOTS; s++) {
                const i = d * SLOTS + s;
                if (cosZ[i] < -0.05) {
                    darkExp += year.exp[i];
                    run = year.imp[i] < 0.03 ? run + 1 : 0;
                    longest = Math.max(longest, run);
                } else {
                    run = 0;
                    if (cosZ[i] > 0.05) {
                        dayExp += year.exp[i];
                        if (year.exp[i] > COVERED) peaks.push(year.exp[i]);
                    }
                }
            }
            if (dayExp > 0.5) exportDays += 1;
            if (darkExp > 0.1) darkDays += 1;
            if (longest >= 6) quietNights += 1;
        }
        const dark = darkDays >= 3 && darkDays >= year.days * 0.02;
        const quiet = quietNights >= year.days * 0.15;
        let solarKw = 0;
        if (exportDays >= year.days * 0.1 && peaks.length) {
            // The busiest half hours of sending out, plus what the home was using then: a rough size.
            peaks.sort((a, b) => a - b);
            const p98 = peaks[Math.min(peaks.length - 1, Math.floor(peaks.length * 0.98))];
            solarKw = Math.max(1.5, Math.round((p98 * 2 / 0.8) * 2) / 2);
        }
        return { exportDays, darkDays, quietNights, battery: dark || quiet, reason: dark ? 'dark' : quiet ? 'quiet' : '', solarKw };
    };

    // Spread `need` over the slots in idx in proportion to weight, none above its room; returns what's left.
    function spread(need, idx, weight, room, out) {
        let active = idx.filter((i) => room[i] - out[i] > 1e-12 && weight[i] > 0);
        for (let pass = 0; pass < 30 && need > 1e-9 && active.length; pass++) {
            let total = 0;
            active.forEach((i) => { total += weight[i]; });
            let used = 0;
            const next = [];
            active.forEach((i) => {
                const take = Math.min(need * weight[i] / total, room[i] - out[i]);
                out[i] += take;
                used += take;
                if (room[i] - out[i] > 1e-12) next.push(i);
            });
            need -= used;
            active = next;
        }
        return Math.max(0, need);
    }

    /**
     * The readings as they'd have been without the household's existing battery, so the planner
     * can run that battery (and any new one) afresh on every plan. The meter only shows what the
     * battery left over, so this is an estimate, worked out a day at a time (09:00 to 09:00 NEM,
     * so an evening and the night after it go with the day's charging):
     *  - power sent out after dark, or more than the panels could make, was the battery selling;
     *  - half hours with next to nothing bought, when the panels couldn't have covered the home,
     *    were the battery covering the home's usual use then (learned from the half hours that
     *    did buy power, the same month and time of day);
     *  - what it gave out it first took in (÷ round trip): from solar that would otherwise have
     *    been sent out, in daylight half hours that bought nothing, then from the grid in half
     *    hours that bought more than usual, cheapest first; what neither could supply wasn't
     *    given out either, so the estimate of what it covered is scaled back to match.
     * o: { kwh, kw, rte, solarKw (existing panels), pv (their kWh per slot in a typical year, may
     *      be null), cosZ (the sun's cos(zenith) per slot) }.
     * Returns { year (a copy with imp/exp rebuilt), stats: { toHome, toGrid, fromSolar, fromGrid, scaledDays, cycles } }.
     */
    Amber.plannerUnwindBattery = function (year, o) {
        const n = year.n;
        const B = o.kwh;
        const P = Math.max(0.1, o.kw || B * 0.4) * 0.5;
        const rte = o.rte || 0.9;
        const eta = Math.sqrt(rte);
        const kw = o.solarKw > 0 && o.pv ? o.solarKw : 0;
        const imp = year.imp;
        const exp = year.exp;
        const cosZ = o.cosZ;
        const pv = new Float64Array(n);
        const pvMax = new Float64Array(n);
        if (kw > 0) {
            for (let i = 0; i < n; i++) {
                pv[i] = o.pv[i];
                // A bright day's output (a typical day × 1.6), never more than the panels' size.
                pvMax[i] = cosZ[i] > 0 ? Math.min(kw * 0.5, 1.6 * pv[i] + 0.05) : 0;
            }
        }
        // Panels making under a tenth of their size can't cover the home: the battery may be.
        const dimLevel = Math.max(0.05, kw * 0.05);
        const dim = (i) => pv[i] < dimLevel;

        // The home's usual use for each month and half hour, from the half hours that bought power.
        const monthOf = new Uint8Array(year.days);
        for (let d = 0; d < year.days; d++) monthOf[d] = parseInt(year.dates[d].substring(5, 7), 10) - 1;
        const samples = Array.from({ length: 12 * SLOTS }, () => []);
        const all = [];
        for (let i = 0; i < n; i++) {
            if (imp[i] >= COVERED && exp[i] < COVERED) {
                samples[monthOf[Math.floor(i / SLOTS)] * SLOTS + (i % SLOTS)].push(imp[i]);
                all.push(imp[i]);
            }
        }
        const median = (arr) => {
            if (!arr.length) return NaN;
            const s = arr.slice().sort((a, b) => a - b);
            return s[Math.floor(s.length / 2)];
        };
        const fallback = Number.isFinite(median(all)) ? median(all) : 0.3;
        const bySlot = Array.from({ length: SLOTS }, (_, s) => median([].concat(...Array.from({ length: 12 }, (__, m) => samples[m * SLOTS + s]))));
        const usualTable = new Float64Array(12 * SLOTS);
        for (let m = 0; m < 12; m++) {
            for (let s = 0; s < SLOTS; s++) {
                let v = median(samples[m * SLOTS + s]);
                for (let k = 1; k <= 6 && !Number.isFinite(v); k++) {
                    const a = median(samples[m * SLOTS + ((s + k) % SLOTS)]);
                    const b = median(samples[m * SLOTS + ((s - k + SLOTS) % SLOTS)]);
                    v = Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : Number.isFinite(a) ? a : b;
                }
                if (!Number.isFinite(v)) v = Number.isFinite(bySlot[s]) ? bySlot[s] : fallback;
                usualTable[m * SLOTS + s] = v;
            }
        }
        const usual = (i) => usualTable[monthOf[Math.floor(i / SLOTS)] * SLOTS + (i % SLOTS)];

        // What it gave out: sold to the grid (certain), and covered at home (hidden: the meter shows
        // next to nothing while it does).
        const toGrid = new Float64Array(n);
        const covered = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            toGrid[i] = Math.min(P, Math.max(0, exp[i] - pvMax[i]));
            if (dim(i) && imp[i] < COVERED && toGrid[i] < P) covered[i] = 1;
        }
        // A day at a time, 09:00 to 09:00 NEM: an evening and the night after go with the day's charging.
        const starts = [0];
        for (let d = 0; d < year.days; d++) if (d * SLOTS + 18 > 0 && d * SLOTS + 18 < n) starts.push(d * SLOTS + 18);
        starts.push(n);
        const days = [];
        for (let k = 0; k + 1 < starts.length; k++) {
            const a = starts[k];
            const b = starts[k + 1];
            let grid = 0;
            let usualSum = 0;
            let spilled = false;
            let firstCovered = -1;
            let ranOut = false;
            for (let i = a; i < b; i++) {
                grid += toGrid[i];
                if (covered[i]) {
                    usualSum += Math.min(P - toGrid[i], usual(i));
                    if (firstCovered < 0) firstCovered = i;
                } else if (firstCovered >= 0 && dim(i) && imp[i] >= COVERED && cosZ[i] < 0) {
                    ranOut = true;
                }
                if (kw > 0 && cosZ[i] > 0.05 && exp[i] - toGrid[i] > COVERED) spilled = true;
            }
            days.push({ a, b, grid, usualSum, full: kw > 0 ? spilled : true, ranOut, month: monthOf[Math.min(year.days - 1, Math.floor(a / SLOTS))] });
        }
        // On days it filled up (solar spilling to the grid) and then ran flat (buying again at night),
        // it gave out a whole battery: those days say how far the usual use understates the evenings
        // it covers, month by month.
        const ratios = Array.from({ length: 12 }, () => []);
        const allRatios = [];
        days.forEach((day) => {
            if (day.full && day.ranOut && day.usualSum > 0.5) {
                const r = Math.max(0, B * eta - day.grid) / day.usualSum;
                ratios[day.month].push(r);
                allRatios.push(r);
            }
        });
        const yearRatio = Number.isFinite(median(allRatios)) ? median(allRatios) : 1;
        const clampRatio = (r) => Math.min(4, Math.max(0.5, r));
        const toHome = new Float64Array(n);
        const homeRoom = new Float64Array(n);
        const homeWeight = new Float64Array(n);
        days.forEach((day) => {
            const room = Math.max(0, B * eta - day.grid);
            const ratio = clampRatio(Number.isFinite(median(ratios[day.month])) ? median(ratios[day.month]) : yearRatio);
            day.home = day.full && day.ranOut ? room : Math.min(room, ratio * day.usualSum);
            const idx = [];
            for (let i = day.a; i < day.b; i++) {
                if (covered[i]) {
                    homeRoom[i] = P - toGrid[i];
                    homeWeight[i] = Math.max(0.01, usual(i));
                    idx.push(i);
                }
            }
            spread(day.home, idx, homeWeight, homeRoom, toHome);
        });

        const fromSolar = new Float64Array(n);
        const fromGrid = new Float64Array(n);
        const solarRoom = new Float64Array(n);
        const gridRoom = new Float64Array(n);
        const stats = { toHome: 0, toGrid: 0, fromSolar: 0, fromGrid: 0, scaledDays: 0, cycles: 0 };
        for (let k = 0; k < days.length; k++) {
            const a = days[k].a;
            const b = days[k].b;
            let home = 0;
            let grid = 0;
            for (let i = a; i < b; i++) { home += toHome[i]; grid += toGrid[i]; }
            // Never more than about one and a half fills in a day.
            const most = 1.5 * B * eta;
            if (home + grid > most) {
                const keepGrid = Math.min(grid, most);
                const kHome = home > 0 ? Math.max(0, most - keepGrid) / home : 0;
                const kGrid = grid > 0 ? keepGrid / grid : 0;
                for (let i = a; i < b; i++) { toHome[i] *= kHome; toGrid[i] *= kGrid; }
                home *= kHome;
                grid *= kGrid;
            }
            let need = (home + grid) / rte;
            if (need <= 1e-9) continue;
            // Solar that would otherwise have gone to the grid: daylight, nothing bought, not selling.
            const sunny = [];
            for (let i = a; i < b; i++) {
                if (kw > 0 && pv[i] > 0 && imp[i] < COVERED && !toGrid[i] && !toHome[i]) {
                    solarRoom[i] = Math.min(P, Math.max(0, pvMax[i] - exp[i]));
                    sunny.push(i);
                }
            }
            need = spread(need, sunny, pv, solarRoom, fromSolar);
            // Then the grid: half hours that bought more than usual, cheapest first.
            if (need > 1e-9) {
                const extra = [];
                for (let i = a; i < b; i++) {
                    if (!toGrid[i] && !toHome[i] && imp[i] > usual(i) + COVERED) {
                        gridRoom[i] = Math.min(P - fromSolar[i], imp[i] - usual(i));
                        if (gridRoom[i] > 0) extra.push(i);
                    }
                }
                extra.sort((x, y) => (year.amberImp[x] - year.amberImp[y]) || (x - y));
                for (let j = 0; j < extra.length && need > 1e-9; j++) {
                    const take = Math.min(need, gridRoom[extra[j]]);
                    fromGrid[extra[j]] += take;
                    need -= take;
                }
            }
            // What couldn't have been charged wasn't given out: scale back, home first.
            if (need > 1e-9) {
                stats.scaledDays += 1;
                let cut = need * rte;
                const cutHome = Math.min(cut, home);
                if (home > 0) for (let i = a; i < b; i++) toHome[i] *= (home - cutHome) / home;
                cut -= cutHome;
                if (cut > 1e-9 && grid > 0) for (let i = a; i < b; i++) toGrid[i] *= Math.max(0, grid - cut) / grid;
            }
        }

        const imp0 = new Float64Array(n);
        const exp0 = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            imp0[i] = imp[i] + toHome[i] - fromGrid[i];
            exp0[i] = exp[i] - toGrid[i] + fromSolar[i];
            stats.toHome += toHome[i];
            stats.toGrid += toGrid[i];
            stats.fromSolar += fromSolar[i];
            stats.fromGrid += fromGrid[i];
        }
        stats.cycles = B > 0 ? (stats.toHome + stats.toGrid) / (B * eta) : 0;
        return { year: Object.assign({}, year, { imp: imp0, exp: exp0, meterExp: year.meterExp || exp, unwound: true }), stats };
    };

    /**
     * The planner's version of the existing battery against the real readings, on one plan, for
     * the year as recorded (no new panels, no planned changes). prep is built on the unwound year
     * with ctx.existing; original is the year as read.
     * Returns { readings, modelled, without }, each { bill, importKwh, exportKwh }, and the run.
     */
    Amber.plannerExistingCheck = function (prep, planName, original) {
        const plan = prep.byName[planName];
        if (!plan) return null;
        const flows = Amber.plannerFlows(prep.year, { exportLimitKw: prep.ctx.exportLimitKw });
        const sim = Amber.simulateBattery(prep.year, flows, prep.pricesOf(plan), prep.batteryOf(0));
        const pack = (imp, exp, cl) => ({ bill: prep.costOf(plan, imp, exp, cl).total, importKwh: sum(imp) + sum(cl), exportKwh: sum(exp) });
        return { readings: pack(original.imp, original.exp, original.cl), modelled: pack(sim.imp, sim.exp, flows.cl), without: pack(flows.imp, prep.exportsFor(plan, flows.exp).exp, flows.cl), sim };
    };

    // ---------- Future changes: EV, heat-pump hot water, gas to electric ----------

    // Local-time windows the new loads run in: [startHour, endHour) (end may pass midnight).
    const LOAD_WINDOWS = {
        overnight: [0, 6],
        solar: [10, 15],
        evening: [18, 22]
    };

    // Share of a year's gas heating in each month (southern winter).
    const HEATING_MONTHS = { 1: 0, 2: 0, 3: 0, 4: 0.3, 5: 0.7, 6: 1, 7: 1, 8: 1, 9: 0.7, 10: 0.3, 11: 0, 12: 0 };

    /**
     * Extra half-hourly use from changes you're planning (applied to every option, including doing
     * nothing, so they change which setup is best rather than counting as savings).
     * opts: {
     *   ev: { kmPerYear, kwhPer100km = 17, chargeAt: 'overnight' | 'solar' | 'evening', chargerKw = 7 },
     *   hotWater: { from: 'controlled' | 'gas', people = 3, cop = 3.5, runAt: 'solar' | 'overnight' },
     *   gas: { heatingMJ (per year), cooking (bool), cookingMJ = 1500, centsPerMJ = 4.5, supplyCentsPerDay = 80,
     *          allGone (bool: no gas left, so the supply charge goes too), hotWaterMJ (if from gas) }
     * }
     * Returns { extra, clScale, kwh: { ev, hotWater, heating, cooking }, gasSaving ($/yr) }.
     */
    Amber.plannerExtraLoads = function (year, opts, timeZone) {
        const o = opts || {};
        const n = year.n;
        const extra = new Float64Array(n);
        const parts = slotParts(year, { clock: 'local', timeZone: timeZone || 'Australia/Sydney' });
        const kwh = { ev: 0, hotWater: 0, heating: 0, cooking: 0 };
        let clScale = 1;
        let gasSaving = 0;

        // Slots of day d whose local hour is in [from, to).
        const daySlots = (d, from, to) => {
            const out = [];
            for (let i = d * SLOTS; i < (d + 1) * SLOTS; i++) {
                const h = parts[i].hours + parts[i].minutes / 60;
                if (from < to ? h >= from && h < to : h >= from || h < to) out.push(i);
            }
            return out;
        };
        // Spread energy over slots evenly, or at full power from the window's start.
        const place = (slots, energy, maxPerSlot) => {
            if (!slots.length || !(energy > 0)) return 0;
            if (!maxPerSlot) {
                slots.forEach((i) => { extra[i] += energy / slots.length; });
                return energy;
            }
            let left = energy;
            for (let k = 0; k < slots.length && left > 1e-9; k++) {
                const e = Math.min(left, maxPerSlot);
                extra[slots[k]] += e;
                left -= e;
            }
            return energy - left;
        };

        const ev = o.ev;
        if (ev && ev.kmPerYear > 0) {
            const daily = (ev.kmPerYear / 365) * ((ev.kwhPer100km || 17) / 100) * 1.1; // + charging losses
            const win = LOAD_WINDOWS[ev.chargeAt] || LOAD_WINDOWS.overnight;
            const fast = ev.chargeAt === 'solar' ? 0 : (ev.chargerKw || 7) * 0.5;
            for (let d = 0; d < year.days; d++) kwh.ev += place(daySlots(d, win[0], win[1]), daily, fast);
        }

        const hw = o.hotWater;
        if (hw && hw.from) {
            const cop = hw.cop || 3.5;
            const win = LOAD_WINDOWS[hw.runAt] || LOAD_WINDOWS.solar;
            if (hw.from === 'controlled' && year.hasCl) {
                // The old resistive heater's own use, day by day, now made by a heat pump.
                clScale = 0;
                for (let d = 0; d < year.days; d++) {
                    let old = 0;
                    for (let i = d * SLOTS; i < (d + 1) * SLOTS; i++) old += year.cl[i];
                    kwh.hotWater += place(daySlots(d, win[0], win[1]), old / cop, 0);
                }
            } else if (hw.from === 'gas') {
                // About 3.5 kWh of hot water heat per person a day, more in winter.
                const people = hw.people || 3;
                for (let d = 0; d < year.days; d++) {
                    const month = parseInt(year.dates[d].substring(5, 7), 10);
                    const season = 1 + 0.25 * Math.cos((month - 7) * Math.PI / 6);
                    kwh.hotWater += place(daySlots(d, win[0], win[1]), (people * 3.5 * season) / cop, 0);
                }
                const gas = o.gas || {};
                const mj = gas.hotWaterMJ != null ? gas.hotWaterMJ : people * 3.5 * 365 * 3.6 / 0.75;
                gasSaving += mj * (gas.centsPerMJ || 4.5) / 100;
            }
        }

        const gas = o.gas || {};
        if (gas.heatingMJ > 0) {
            // Gas heater ~75 % efficient; reverse-cycle air conditioning COP ~4. Mornings and evenings.
            const total = gas.heatingMJ * 0.75 / 3.6 / 4;
            const weights = year.dates.map((date) => HEATING_MONTHS[parseInt(date.substring(5, 7), 10)]);
            const sumW = weights.reduce((s, x) => s + x, 0) || 1;
            for (let d = 0; d < year.days; d++) {
                const day = total * weights[d] / sumW;
                if (!(day > 0)) continue;
                kwh.heating += place(daySlots(d, 6, 9), day * 0.4, 0) + place(daySlots(d, 17, 23), day * 0.6, 0);
            }
            gasSaving += gas.heatingMJ * (gas.centsPerMJ || 4.5) / 100;
        }
        if (gas.cooking) {
            const mj = gas.cookingMJ || 1500;
            const daily = mj * 0.4 / 3.6 / 0.85 / 365; // gas hob ~40 %, induction ~85 %
            for (let d = 0; d < year.days; d++) kwh.cooking += place(daySlots(d, 17, 19), daily, 0);
            gasSaving += mj * (gas.centsPerMJ || 4.5) / 100;
        }
        if (gas.allGone) gasSaving += (gas.supplyCentsPerDay != null ? gas.supplyCentsPerDay : 80) * 365 / 100;
        return { extra, clScale, kwh, gasSaving };
    };

    // ---------- Battery ----------

    /**
     * Prices a battery sees under a plan: buy and sell (c/kWh, sell = what an export earns), the
     * daily caps of free and feed-in windows, and the demand window. Demand charges are spread over
     * the window's slots as an extra price per kWh (shadow), so the battery favours covering them,
     * and the battery never charges from the grid inside the window.
     */
    Amber.plannerBatteryPrices = function (year, plan, card, model) {
        const n = year.n;
        const p = { buy: new Float64Array(n), sell: new Float64Array(n), shadow: new Float64Array(n), noGrid: new Uint8Array(n) };
        if (plan.amber) {
            for (let i = 0; i < n; i++) { p.buy[i] = year.amberImp[i]; p.sell[i] = -year.amberExp[i]; }
            p.curtailNegative = true;
            monthsOf(year).forEach((m) => {
                let slots = 0;
                const days = new Set();
                for (let i = m.startDay * SLOTS; i < (m.endDay + 1) * SLOTS; i++) if (year.demandFlag[i]) { slots += 1; days.add(Math.floor(i / SLOTS)); }
                if (!slots) return;
                const rate = Amber.demandCentsFor(model.rates, m.key) || 0;
                const shadow = rate * 2 * days.size / slots;
                for (let i = m.startDay * SLOTS; i < (m.endDay + 1) * SLOTS; i++) if (year.demandFlag[i]) { p.shadow[i] = shadow; p.noGrid[i] = 1; }
            });
            return p;
        }
        p.buy.set(card.imp);
        p.sell.set(card.exp);
        if (card.free) { p.free = card.free; p.alt = card.alt; p.freeCap = card.freeCap; }
        if (card.expWin) { p.expWin = card.expWin; p.expWindows = card.expWindows; }
        if (card.demandSlot) {
            monthsOf(year).forEach((m) => {
                let slots = 0;
                for (let i = m.startDay * SLOTS; i < (m.endDay + 1) * SLOTS; i++) if (card.demandSlot[i]) slots += 1;
                if (!slots) return;
                const shadow = card.demandRate * 2 * (card.demandDays[m.key] || 0) / slots;
                for (let i = m.startDay * SLOTS; i < (m.endDay + 1) * SLOTS; i++) if (card.demandSlot[i]) { p.shadow[i] = shadow; p.noGrid[i] = 1; }
            });
        }
        return p;
    };

    function pickValues(values, max) {
        const sorted = Array.from(new Set(values.filter((v) => Number.isFinite(v)))).sort((a, b) => a - b);
        if (sorted.length <= max) return sorted;
        const out = [];
        for (let q = 0; q < max; q++) out.push(sorted[Math.round((q * (sorted.length - 1)) / (max - 1))]);
        return Array.from(new Set(out));
    }

    /**
     * Run a battery through the year under one plan's prices, half hour by half hour.
     * battery: { kwh (usable), kw (charge/discharge power), rte (round trip, 0–1), wear (c/kWh discharged) }.
     *
     * Each day it tries a few strategies and keeps the cheapest: cover the home whenever the import
     * price is at least θ and sell to the grid whenever an export earns at least θ; soak up solar that
     * would export for less than it's worth stored; and, in a half hour it isn't discharging, charge
     * from the grid when the price is at most φ (free windows, super off-peak, cheap Amber prices).
     * It starts the year empty. The day's prices are taken as known
     * in the morning (fixed plans; Amber's forecasts). Energy left at midnight is valued at the
     * cheapest way to refill it the next day. On Amber, solar is switched off when exports would
     * cost money and the battery is full (SmartShift does this).
     * Returns new import/export arrays and the battery's year: charged, discharged, cycles.
     */
    Amber.simulateBattery = function (year, flows, prices, battery) {
        const B = battery && battery.kwh > 0 ? battery.kwh : 0;
        const n = year.n;
        const imp = Float64Array.from(flows.imp);
        const exp = Float64Array.from(flows.exp);
        const out = { imp, exp, charged: 0, gridCharged: 0, discharged: 0, exported: 0, curtailed: 0, limited: 0, cycles: 0 };
        const spare = flows.expRaw || flows.exp;
        if (!B) return out;
        const rte = battery.rte || 0.9;
        const eta = Math.sqrt(rte);
        const P = Math.max(0.1, battery.kw || B * 0.4) * 0.5;
        const wear = battery.wear != null ? battery.wear : 2;
        const cap = flows.expCap;
        const buy = prices.buy;
        const sell = prices.sell;
        const shadow = prices.shadow;
        let E = 0;

        function staticBuy(i) { return buy[i] + shadow[i]; }

        function terminalValue(d) {
            const day = d + 1 < year.days ? d + 1 : d;
            let refill = Infinity;
            let best = -Infinity;
            for (let i = day * SLOTS; i < (day + 1) * SLOTS; i++) {
                const b = staticBuy(i);
                if (!prices.noGrid[i]) refill = Math.min(refill, buy[i] / eta);
                if (spare[i] > 0) refill = Math.min(refill, sell[i] / eta);
                best = Math.max(best, b * eta);
            }
            if (!Number.isFinite(refill)) refill = best;
            return Math.min(refill, best);
        }

        // One day under thresholds (θ, φ). commit = write the flows; returns the objective or end energy.
        function runDay(d, E0, theta, phi, vEnd, commit) {
            let e = E0;
            let cost = 0;
            let freeUsed = 0;
            const winUsed = [0, 0, 0, 0, 0, 0, 0, 0];
            for (let i = d * SLOTS; i < (d + 1) * SLOTS; i++) {
                let im = flows.imp[i];
                let ex = spare[i];
                let b = buy[i];
                if (prices.free && prices.free[i] && freeUsed >= prices.freeCap) b = prices.alt[i];
                b += shadow[i];
                let s = sell[i];
                let w = -1;
                if (prices.expWin && prices.expWin[i] >= 0) {
                    w = prices.expWin[i];
                    const win = prices.expWindows[w];
                    s = winUsed[w] < win.cap ? win.rate : win.over;
                }
                // Charging and discharging share the power limit (a half hour can hold both).
                let power = P;
                let toLoad = 0;
                let toGrid = 0;
                let chg = 0;
                let grid = 0;
                if (im > 0 && b >= theta) {
                    toLoad = Math.min(im, e * eta, power);
                    im -= toLoad;
                    power -= toLoad;
                    e -= toLoad / eta;
                }
                if (s >= theta && power > 0 && e > 0) {
                    toGrid = Math.min(e * eta, power, cap ? Math.max(0, cap[i] - ex) : power);
                    ex += toGrid;
                    power -= toGrid;
                    e -= toGrid / eta;
                }
                // Power over the export limit would be thrown away: store it whatever the price.
                if (cap && ex > cap[i] && !toLoad && !toGrid && power > 0) {
                    const free = Math.min(ex - cap[i], power, (B - e) / eta);
                    chg += free;
                    ex -= free;
                    power -= free;
                    e += free * eta;
                }
                if (ex > 0 && !toGrid && s < theta * rte && power > 0) {
                    const more = Math.min(ex, power, (B - e) / eta);
                    chg += more;
                    ex -= more;
                    power -= more;
                    e += more * eta;
                }
                let limited = 0;
                if (cap && ex > cap[i]) { limited = ex - cap[i]; ex = cap[i]; }
                if (b <= phi && !toLoad && !toGrid && !prices.noGrid[i] && power > 0) {
                    grid = Math.min(power, (B - e) / eta);
                    im += grid;
                    e += grid * eta;
                }
                const dis = toLoad + toGrid;
                let curtail = 0;
                if (prices.curtailNegative && s < 0 && ex > 0) { curtail = ex; ex = 0; }
                if (prices.free && prices.free[i]) freeUsed += im;
                if (w >= 0) winUsed[w] += ex;
                cost += b * im - s * ex + wear * dis;
                if (commit) {
                    imp[i] = im;
                    exp[i] = ex;
                    out.charged += chg + grid;
                    out.gridCharged += grid;
                    out.discharged += dis;
                    out.exported += toGrid;
                    out.curtailed += curtail;
                    out.limited += limited;
                }
            }
            return commit ? e : cost - vEnd * e;
        }

        for (let d = 0; d < year.days; d++) {
            const values = [];
            const buys = [];
            for (let i = d * SLOTS; i < (d + 1) * SLOTS; i++) {
                values.push(staticBuy(i), sell[i]);
                if (prices.free && prices.free[i]) values.push(prices.alt[i] + shadow[i]);
                if (!prices.noGrid[i]) buys.push(buy[i]);
            }
            const thetas = pickValues(values, 10).concat([Infinity]);
            const phis = [-Infinity].concat(pickValues(buys, 5));
            const vEnd = terminalValue(d);
            let best = null;
            for (let a = 0; a < thetas.length; a++) {
                for (let c = 0; c < phis.length; c++) {
                    if (phis[c] > -Infinity && !(phis[c] < thetas[a] * rte - wear)) continue;
                    const obj = runDay(d, E, thetas[a], phis[c], vEnd, false);
                    if (!best || obj < best.obj - 1e-9) best = { obj, theta: thetas[a], phi: phis[c] };
                }
            }
            E = runDay(d, E, best.theta, best.phi, vEnd, true);
        }
        out.cycles = out.discharged / eta / B;
        return out;
    };

    // ---------- Search ----------

    const pause = () => new Promise((resolve) => setTimeout(resolve, 0));

    /**
     * Everything a search and a single option share: each plan's rates and battery prices, the
     * flows for each solar size (cached) and the battery for each size.
     * ctx: { year, plans: [{ name, config } | { name: 'Amber', amber: true }], state, amberModel,
     *   solarPerKw (kWh per slot for 1 kW of panels, or null), battery: { kwPerKwh, rte, wear },
     *   exportLimitKw, extra, clScale }.
     */
    // Middle of the day for the feed-in check: 10am to 3pm NEM time (slots 20 to 29).
    const DAY_FROM = 20;
    const DAY_TO = 30;

    // The year with Amber's feed-in credits from 10am to 3pm scaled by k (negative prices, which
    // cost to export, stay as they are).
    function scaleDayFeedIn(year, k) {
        const amberExp = Float64Array.from(year.amberExp);
        for (let i = 0; i < year.n; i++) {
            const s = i % SLOTS;
            if (s >= DAY_FROM && s < DAY_TO && amberExp[i] < 0) amberExp[i] *= k;
        }
        return Object.assign({}, year, { amberExp });
    }

    /**
     * Everything the search needs about one household, once. ctx options besides the year and plans:
     * switchOffNegative (default true): the panels stop sending power out whenever the feed-in price
     * is negative (Amber can switch off inverters it controls), so nothing is paid to export;
     * dayFeedInScale: a what-if where feed-in credits from 10am to 3pm are multiplied by it.
     */
    Amber.plannerPrepare = function (ctx) {
        const scaleDay = ctx.dayFeedInScale != null && ctx.dayFeedInScale !== 1 ? ctx.dayFeedInScale : null;
        const year = scaleDay != null ? scaleDayFeedIn(ctx.year, scaleDay) : ctx.year;
        const switchOff = ctx.switchOffNegative !== false;
        const plans = ctx.plans.map((p) => {
            const card = p.amber ? null : Amber.planRateCard(year, p.config, ctx.state);
            if (card && scaleDay != null) {
                card.exp = Float64Array.from(card.exp);
                for (let i = 0; i < year.n; i++) {
                    const s = i % SLOTS;
                    if (s >= DAY_FROM && s < DAY_TO && card.exp[i] > 0) card.exp[i] *= scaleDay;
                }
            }
            return Object.assign({}, p, { card, prices: null });
        });
        const byName = Object.create(null);
        plans.forEach((p) => { byName[p.name] = p; });
        const flowsCache = new Map();
        const existing = !!(ctx.existing && ctx.existing.kwh > 0);
        const prep = {
            ctx, year, plans, byName,
            costOf(plan, imp, exp, cl, range) {
                return plan.amber ? Amber.amberCardCost(year, ctx.amberModel, imp, exp, cl, range) : Amber.planCardCost(year, plan.card, imp, exp, cl, range);
            },
            switchOff,
            pricesOf(plan) {
                if (!plan.prices) {
                    plan.prices = Amber.plannerBatteryPrices(year, plan, plan.card, ctx.amberModel);
                    plan.prices.curtailNegative = switchOff;
                }
                return plan.prices;
            },
            // Power sent out with no battery to soak it up: if the panels can switch off, none goes
            // out while the feed-in price is negative. Returns { exp, off (kWh not sent) }.
            exportsFor(plan, exp) {
                if (!switchOff) return { exp, off: 0 };
                const sell = this.pricesOf(plan).sell;
                let out = null;
                let off = 0;
                for (let i = 0; i < exp.length; i++) {
                    if (exp[i] > 0 && sell[i] < 0) {
                        if (!out) out = Float64Array.from(exp);
                        off += exp[i];
                        out[i] = 0;
                    }
                }
                return { exp: out || exp, off };
            },
            flowsFor(kw) {
                const key = ctx.solarPerKw ? kw : 0;
                if (!flowsCache.has(key)) {
                    let solar = null;
                    if (key > 0) {
                        solar = new Float64Array(year.n);
                        for (let i = 0; i < year.n; i++) solar[i] = ctx.solarPerKw[i] * key;
                    }
                    flowsCache.set(key, Amber.plannerFlows(year, { solar, extra: ctx.extra, clScale: ctx.clScale, exportLimitKw: ctx.exportLimitKw }));
                }
                return flowsCache.get(key);
            },
            // A new battery of kwh, plus the one the home already has (ctx.existing: { kwh, kw }).
            batteryOf(kwh) {
                const b = ctx.battery || {};
                const ex = existing ? ctx.existing : { kwh: 0, kw: 0 };
                const kw = kwh > 0 ? Math.min(15, Math.max(2.5, kwh * (b.kwPerKwh || 0.4))) : 0;
                return { kwh: kwh + ex.kwh, kw: kw + ex.kw, rte: b.rte || 0.9, wear: b.wear != null ? b.wear : 2 };
            },
            hasBattery(kwh) {
                return kwh > 0 || existing;
            }
        };
        return prep;
    };

    /**
     * One option in full: its flows, battery run, half-hourly import/export, the year's cost and
     * each month's. Returns null for an unknown plan.
     */
    Amber.plannerEvaluate = function (prep, planName, solarKw, batteryKwh) {
        const plan = prep.byName[planName];
        if (!plan) return null;
        const flows = prep.flowsFor(solarKw);
        const sim = prep.hasBattery(batteryKwh) ? Amber.simulateBattery(prep.year, flows, prep.pricesOf(plan), prep.batteryOf(batteryKwh)) : null;
        const sent = sim ? null : prep.exportsFor(plan, flows.exp);
        const imp = sim ? sim.imp : flows.imp;
        const exp = sim ? sim.exp : sent.exp;
        const months = monthsOf(prep.year).map((m) => {
            const cost = prep.costOf(plan, imp, exp, flows.cl, { from: m.startDay, to: m.endDay });
            let importKwh = 0;
            let exportKwh = 0;
            let solarKwh = 0;
            for (let i = m.startDay * SLOTS; i < (m.endDay + 1) * SLOTS; i++) {
                importKwh += imp[i] + flows.cl[i];
                exportKwh += exp[i];
                if (prep.ctx.solarPerKw && solarKw > 0) solarKwh += prep.ctx.solarPerKw[i] * solarKw;
            }
            return { key: m.key, days: m.endDay - m.startDay + 1, bill: cost.total, cost, importKwh, exportKwh, solarKwh };
        });
        return { plan, flows, sim, imp, exp, cl: flows.cl, cost: prep.costOf(plan, imp, exp, flows.cl), months, switchedOff: sim ? sim.curtailed : sent.off };
    };

    /** Just the year's bill for one option (as plannerEvaluate, without the months). */
    Amber.plannerBill = function (prep, planName, solarKw, batteryKwh) {
        const plan = prep.byName[planName];
        if (!plan) return NaN;
        const flows = prep.flowsFor(solarKw);
        if (prep.hasBattery(batteryKwh)) {
            const sim = Amber.simulateBattery(prep.year, flows, prep.pricesOf(plan), prep.batteryOf(batteryKwh));
            return prep.costOf(plan, sim.imp, sim.exp, flows.cl).total;
        }
        return prep.costOf(plan, flows.imp, prep.exportsFor(plan, flows.exp).exp, flows.cl).total;
    };

    /**
     * Try every combination of solar size, battery size and plan and price next year for each.
     * ctx (as plannerPrepare) plus: solarSizes, batterySizes, keepPlans (how many plans get the full
     * battery search, default 6: a probe battery ranks them), mustPlans (names always searched),
     * batteryPlans (names: search only these with a battery, no probe), allowPlans (names of the
     * plans the household would use: only these get batteries; null = all), alsoPlans (names that
     * need their nothing-new row even when not allowed, such as the plan to compare against).
     * Returns { rows: [{ solarKw, batteryKwh, plan, bill, cost, flow and battery stats }], prep, searchedPlans }.
     */
    Amber.plannerSearch = async function (ctx, onProgress) {
        const prep = Amber.plannerPrepare(ctx);
        const year = prep.year;
        const plans = prep.plans;
        const solarSizes = ctx.solarPerKw ? ctx.solarSizes : [0];
        const rows = [];
        const add = (kw, plan, kwh, sim) => {
            const f = prep.flowsFor(kw);
            const sent = sim ? null : prep.exportsFor(plan, f.exp);
            const imp = sim ? sim.imp : f.imp;
            const exp = sim ? sim.exp : sent.exp;
            const cost = prep.costOf(plan, imp, exp, f.cl);
            rows.push({
                solarKw: kw, batteryKwh: kwh, plan: plan.name, bill: cost.total, cost,
                importKwh: sum(imp), exportKwh: sum(exp), controlledKwh: sum(f.cl),
                solarKwh: f.solarKwh, solarSelf: f.solarSelf, curtailed: sim ? sim.curtailed + sim.limited : f.curtailed + sent.off,
                battery: sim ? { charged: sim.charged, gridCharged: sim.gridCharged, discharged: sim.discharged, exported: sim.exported, cycles: sim.cycles } : null
            });
        };

        const pool = ctx.allowPlans ? plans.filter((p) => ctx.allowPlans.includes(p.name)) : plans;
        // No new battery: every solar size on every plan (fast unless the home already has one,
        // which then runs afresh on each plan the household would use, and the one to compare against).
        if (prep.hasBattery(0)) {
            const base = plans.filter((p) => pool.includes(p) || (ctx.alsoPlans || []).includes(p.name));
            const total = solarSizes.length * base.length;
            let done = 0;
            let last = Date.now();
            for (let si = 0; si < solarSizes.length; si++) {
                for (let p = 0; p < base.length; p++) {
                    add(solarSizes[si], base[p], 0, Amber.simulateBattery(year, prep.flowsFor(solarSizes[si]), prep.pricesOf(base[p]), prep.batteryOf(0)));
                    done += 1;
                    if (Date.now() - last > 40) {
                        if (onProgress) onProgress({ phase: 'existing', done, total });
                        await pause();
                        last = Date.now();
                    }
                }
            }
        } else {
            solarSizes.forEach((kw) => plans.forEach((plan) => add(kw, plan, 0, null)));
        }
        const batteries = (ctx.batterySizes || []).filter((b) => b > 0);
        if (!batteries.length) return { rows, prep, searchedPlans: [] };

        let searched = pool;
        const keep = ctx.keepPlans || 6;
        if (ctx.batteryPlans) {
            searched = plans.filter((p) => ctx.batteryPlans.includes(p.name));
        } else if (pool.length > keep) {
            // A probe battery on a middle solar size ranks the plans for the full battery search.
            const kw = solarSizes[Math.floor((solarSizes.length - 1) / 2)];
            const probe = prep.batteryOf(batteries[Math.floor((batteries.length - 1) / 2)]);
            const probed = [];
            for (let p = 0; p < pool.length; p++) {
                const sim = Amber.simulateBattery(year, prep.flowsFor(kw), prep.pricesOf(pool[p]), probe);
                probed.push({ plan: pool[p], bill: prep.costOf(pool[p], sim.imp, sim.exp, prep.flowsFor(kw).cl).total });
                if (onProgress) onProgress({ phase: 'probe', done: p + 1, total: pool.length });
                await pause();
            }
            probed.sort((a, b) => a.bill - b.bill);
            const names = new Set(probed.slice(0, keep).map((x) => x.plan.name));
            (ctx.mustPlans || []).forEach((name) => { if (pool.some((p) => p.name === name)) names.add(name); });
            searched = pool.filter((p) => names.has(p.name));
        }
        const total = solarSizes.length * batteries.length * searched.length;
        let done = 0;
        let last = Date.now();
        for (let si = 0; si < solarSizes.length; si++) {
            for (let bi = 0; bi < batteries.length; bi++) {
                for (let p = 0; p < searched.length; p++) {
                    const sim = Amber.simulateBattery(year, prep.flowsFor(solarSizes[si]), prep.pricesOf(searched[p]), prep.batteryOf(batteries[bi]));
                    add(solarSizes[si], searched[p], batteries[bi], sim);
                    done += 1;
                    if (Date.now() - last > 40) {
                        if (onProgress) onProgress({ phase: 'search', done, total });
                        await pause();
                        last = Date.now();
                    }
                }
            }
        }
        if (onProgress) onProgress({ phase: 'search', done: total, total });
        return { rows, prep, searchedPlans: searched.map((p) => p.name) };
    };

    function sum(arr) {
        let s = 0;
        for (let i = 0; i < arr.length; i++) s += arr[i];
        return s;
    }

    // ---------- Money over the years ----------

    Amber.PLANNER_FINANCE_DEFAULTS = {
        solarPerKw: 1150, solarFixed: 1500, stcPerKw: 280,
        batteryPerKwh: 900, batteryFixed: 1500, batteryRebatePerKwh: 330,
        rebateStepDown: 10, hardwareDecline: 4,
        escalation: 3, discount: 5, years: 20,
        solarDegradation: 0.5, batteryFade: 2, batteryLife: 12, batteryCostDecline: 4,
        inverterLife: 12, inverterCost: 2000
    };

    /** Up-front cost of a system after rebates: { solar, battery, total, rebates, gross }. */
    Amber.plannerCapex = function (solarKw, batteryKwh, f) {
        const solarGross = solarKw > 0 ? f.solarFixed + f.solarPerKw * solarKw : 0;
        const solarRebate = solarKw > 0 ? f.stcPerKw * solarKw : 0;
        const batteryGross = batteryKwh > 0 ? f.batteryFixed + f.batteryPerKwh * batteryKwh : 0;
        const batteryRebate = batteryKwh > 0 ? f.batteryRebatePerKwh * batteryKwh : 0;
        return {
            solar: solarGross - solarRebate, battery: batteryGross - batteryRebate,
            gross: solarGross + batteryGross, rebates: solarRebate + batteryRebate,
            total: solarGross + batteryGross - solarRebate - batteryRebate
        };
    };

    /**
     * Cash flows of one option over f.years. Year-1 bills come from the search:
     *   today: current plan, nothing new; free: cheapest plan with nothing new (switching is free);
     *   planOnly: this option's plan with nothing new; solarOnly: + its solar, no battery;
     *   batteryBills: [{ kwh, bill }] for its solar and plan (battery 0 included), so a worn
     *   battery's savings are read off smaller sizes.
     * Hardware savings (vs the free switch) fade with panel degradation and battery capacity; the
     * battery is replaced at the end of its life and the inverter at its. Prices rise f.escalation.
     * A replacement still part-way through its life when the years run out is credited with what's
     * left of it (straight line), in the npv and irr; the cash flows and payback leave it out.
     * Returns yearly flows, payback (years, fractional, to being ahead for good; null = not within
     * f.years), firstPayback (first time back to $0, which a replacement can undo), npv, irr,
     * residual { battery, inverter, total } (in the last year's dollars) and net totals.
     */
    Amber.plannerFinance = function (opt, f) {
        const capex = Amber.plannerCapex(opt.solarKw, opt.batteryKwh, f);
        const bb = (opt.batteryBills || []).slice().sort((a, b) => a.kwh - b.kwh);
        const billAt = (kwh) => {
            if (!bb.length) return opt.solarOnly;
            if (kwh <= bb[0].kwh) return bb[0].bill;
            for (let i = 1; i < bb.length; i++) {
                if (kwh <= bb[i].kwh) {
                    const t = (kwh - bb[i - 1].kwh) / (bb[i].kwh - bb[i - 1].kwh);
                    return bb[i - 1].bill + t * (bb[i].bill - bb[i - 1].bill);
                }
            }
            return bb[bb.length - 1].bill;
        };
        const flows = [];
        let cum = -capex.total;
        let payback = capex.total <= 0 ? 0 : null;
        let firstPayback = payback;
        let npv = -capex.total;
        let batteryBought = null;
        let inverterBought = null;
        const r = f.discount / 100;
        const switchSaving = opt.free - opt.planOnly;
        for (let k = 1; k <= f.years; k++) {
            const esc = Math.pow(1 + f.escalation / 100, k - 1);
            const panels = Math.pow(1 - f.solarDegradation / 100, k - 1);
            const age = opt.batteryKwh > 0 ? (k - 1) % f.batteryLife : 0;
            const capacity = Math.max(0, 1 - (f.batteryFade / 100) * age);
            const solarSaving = (opt.planOnly - opt.solarOnly) * panels;
            const batterySaving = opt.batteryKwh > 0 ? opt.solarOnly - billAt(opt.batteryKwh * capacity) : 0;
            const saving = (switchSaving + solarSaving + batterySaving) * esc;
            let spend = 0;
            if (opt.batteryKwh > 0 && k > 1 && (k - 1) % f.batteryLife === 0) {
                const cost = f.batteryPerKwh * opt.batteryKwh * Math.pow(1 - f.batteryCostDecline / 100, k - 1);
                spend += cost;
                batteryBought = { year: k, cost };
            }
            if ((opt.solarKw > 0 || opt.batteryKwh > 0) && k > 1 && (k - 1) % f.inverterLife === 0) {
                spend += f.inverterCost;
                inverterBought = { year: k, cost: f.inverterCost };
            }
            const net = saving - spend;
            const before = cum;
            cum += net;
            if (before < 0 && cum >= 0 && net > 0) {
                const at = k - 1 + (-before) / net;
                if (firstPayback == null) firstPayback = at;
                payback = at;
            } else if (cum < 0) {
                payback = null;
            }
            npv += net / Math.pow(1 + r, k);
            flows.push({ year: k, saving, spend, net, cumulative: cum, capacity, panels });
        }
        // What's left of a replacement when the years run out.
        const left = (bought, life) => (bought ? bought.cost * Math.max(0, life - (f.years - bought.year + 1)) / life : 0);
        const residual = { battery: left(batteryBought, f.batteryLife), inverter: left(inverterBought, f.inverterLife) };
        residual.total = residual.battery + residual.inverter;
        if (residual.total > 0) npv += residual.total / Math.pow(1 + r, f.years);
        const nets = flows.map((x) => x.net);
        if (nets.length) nets[nets.length - 1] += residual.total;
        const irr = irrOf(-capex.total, nets);
        const net10 = flows.slice(0, 10).reduce((s, x) => s + x.net, 0) - capex.total;
        return { capex, flows, payback, firstPayback, npv, irr, residual, batteryBought, net10, netAll: cum, firstYearSaving: flows.length ? flows[0].saving : 0 };
    };

    /**
     * How keen to be on an option, 0–4 (Not worth it, Marginal, Modest, Good, Strong), from its
     * value in today's money per $1 up front, whether it still pays with power prices 20 % lower
     * (lowNpv) and if feed-in from 10am to 3pm halves (dayNpv, when there are panels to check), and
     * how soon it pays back for good. o: { npv, capex, payback, lowNpv, dayNpv }.
     */
    Amber.plannerKeenLevel = function (o) {
        if (!(o.capex > 0)) return null;
        const back = 1 + o.npv / o.capex;
        if (o.npv <= 0) return 0;
        if (back < 1.15) return 1;
        if (back < 1.4 || !(o.lowNpv > 0) || (o.dayNpv != null && !(o.dayNpv > 0))) return 2;
        if (back >= 1.75 && o.payback != null && o.payback <= 8) return 4;
        return 3;
    };

    function irrOf(c0, nets) {
        const npvAt = (rate) => nets.reduce((s, x, i) => s + x / Math.pow(1 + rate, i + 1), c0);
        if (c0 >= 0 || npvAt(-0.99) < 0) return null;
        let lo = -0.99;
        let hi = 1;
        if (npvAt(hi) > 0) return null;
        for (let i = 0; i < 80; i++) {
            const mid = (lo + hi) / 2;
            if (npvAt(mid) > 0) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
    }

    /**
     * Install now, or wait a year? Next year the hardware is f.hardwareDecline % cheaper but the
     * rebates are f.rebateStepDown % smaller, and a year of savings is lost. Returns the change in
     * NPV from waiting (positive = waiting is better) and next year's up-front cost.
     */
    Amber.plannerWaitAYear = function (opt, f) {
        const now = Amber.plannerFinance(opt, f);
        const later = Object.assign({}, f, {
            solarPerKw: f.solarPerKw * (1 - f.hardwareDecline / 100),
            batteryPerKwh: f.batteryPerKwh * (1 - f.hardwareDecline / 100),
            stcPerKw: f.stcPerKw * (1 - f.rebateStepDown / 100),
            batteryRebatePerKwh: f.batteryRebatePerKwh * (1 - f.rebateStepDown / 100)
        });
        const waited = Amber.plannerFinance(opt, later);
        return { change: waited.npv / (1 + f.discount / 100) - now.npv, capexNow: now.capex.total, capexLater: waited.capex.total };
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
