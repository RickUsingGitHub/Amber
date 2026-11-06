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

    /**
     * A plan's cost ($, inc GST) for half-hourly import/export/controlled-load kWh. Matches
     * Amber.computePlanTotals on the same readings (one general and one feed-in channel).
     * Returns { total, usage, controlled, feedIn, daily, demand }.
     */
    Amber.planCardCost = function (year, card, imp, exp, cl) {
        const n = year.n;
        let usage = 0;
        if (!card.free) {
            for (let i = 0; i < n; i++) usage += imp[i] * card.imp[i];
        } else {
            let day = -1;
            let used = 0;
            for (let i = 0; i < n; i++) {
                if (!card.free[i]) { usage += imp[i] * card.imp[i]; continue; }
                if (card.day[i] !== day) { day = card.day[i]; used = 0; }
                const within = Math.max(0, Math.min(imp[i], card.freeCap - used));
                usage += within * card.imp[i] + (imp[i] - within) * card.alt[i];
                used += imp[i];
            }
        }
        let feedIn = 0;
        if (!card.expWin) {
            for (let i = 0; i < n; i++) feedIn += exp[i] * card.exp[i];
        } else {
            const used = Object.create(null);
            for (let i = 0; i < n; i++) {
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
        if (cl) for (let i = 0; i < n; i++) controlled += cl[i] * card.clRate;
        let demand = 0;
        if (card.demandSlot) {
            monthsOf(year).forEach((m) => {
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
        const daily = card.daily * year.days / 100;
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
    Amber.amberCardCost = function (year, model, imp, exp, cl) {
        const n = year.n;
        let usage = 0;
        let controlled = 0;
        let feedIn = 0;
        let midday = 0;
        for (let i = 0; i < n; i++) {
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
            const charged = Math.max(0, midday - (t.belKwhPerDay || 0) * year.days);
            feedIn -= midday * exRate / 100;
            exportCharge = charged * rate / 100;
        }
        let demand = 0;
        monthsOf(year).forEach((m) => {
            let peak = 0;
            const days = new Set();
            for (let i = m.startDay * SLOTS; i < (m.endDay + 1) * SLOTS; i++) {
                if (!year.demandFlag[i]) continue;
                days.add(Math.floor(i / SLOTS));
                if (imp[i] > peak) peak = imp[i];
            }
            if (peak > 0) {
                const rate = Amber.demandCentsFor(model.rates, m.key);
                const r = rate != null ? rate : Amber.DEFAULT_AMBER_DEMAND_CENTS;
                demand += peak * 2 * (r / 100) * days.size;
            }
        });
        const fixed = Amber.amberFixedForPeriod(model.rates, year.first, year.last);
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
        if (o.exportLimitKw != null && o.exportLimitKw >= 0) {
            expCap = new Float64Array(n);
            const limit = o.exportLimitKw * 0.5;
            for (let i = 0; i < n; i++) {
                expCap[i] = Math.max(limit, year.exp[i]);
                if (exp[i] > expCap[i]) { curtailed += exp[i] - expCap[i]; exp[i] = expCap[i]; }
            }
        }
        return { imp, exp, cl, expCap, solarKwh, solarSelf, curtailed };
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
        const out = { imp, exp, charged: 0, gridCharged: 0, discharged: 0, exported: 0, curtailed: 0, cycles: 0 };
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
                if (flows.exp[i] > 0) refill = Math.min(refill, sell[i] / eta);
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
                let ex = flows.exp[i];
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
                if (ex > 0 && !toGrid && s < theta * rte && power > 0) {
                    chg = Math.min(ex, power, (B - e) / eta);
                    ex -= chg;
                    power -= chg;
                    e += chg * eta;
                }
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
     * Try every combination of solar size, battery size and plan (each can be fixed) and price
     * next year for each.
     * ctx: { year, plans: [{ name, config } | { name: 'Amber', amber: true }], state, amberModel,
     *   solarPerKw (kWh per slot for 1 kW of panels, or null), solarSizes, batterySizes,
     *   battery: { kwPerKwh, rte, wear }, exportLimitKw, extra, clScale, keepPlans (how many plans
     *   get the full battery search, default 6), mustPlans (names always searched) }.
     * Returns { rows: [{ solarKw, batteryKwh, plan, bill, cost, flows stats, battery stats }], plans }.
     */
    Amber.plannerSearch = async function (ctx, onProgress) {
        const year = ctx.year;
        const plans = ctx.plans.map((p) => {
            const card = p.amber ? null : Amber.planRateCard(year, p.config, ctx.state);
            return Object.assign({}, p, { card, prices: null });
        });
        const costOf = (plan, imp, exp, cl) => (plan.amber
            ? Amber.amberCardCost(year, ctx.amberModel, imp, exp, cl)
            : Amber.planCardCost(year, plan.card, imp, exp, cl));
        const pricesOf = (plan) => plan.prices || (plan.prices = Amber.plannerBatteryPrices(year, plan, plan.card, ctx.amberModel));
        const solarSizes = ctx.solarPerKw ? ctx.solarSizes : [0];
        const flowsBy = solarSizes.map((kw) => {
            let solar = null;
            if (kw > 0) {
                solar = new Float64Array(year.n);
                for (let i = 0; i < year.n; i++) solar[i] = ctx.solarPerKw[i] * kw;
            }
            return Amber.plannerFlows(year, { solar, extra: ctx.extra, clScale: ctx.clScale, exportLimitKw: ctx.exportLimitKw });
        });
        const batteryOf = (kwh) => ({
            kwh, kw: Math.min(15, Math.max(2.5, kwh * ((ctx.battery && ctx.battery.kwPerKwh) || 0.4))),
            rte: (ctx.battery && ctx.battery.rte) || 0.9,
            wear: ctx.battery && ctx.battery.wear != null ? ctx.battery.wear : 2
        });
        const rows = [];
        const add = (si, plan, kwh, sim) => {
            const f = flowsBy[si];
            const imp = sim ? sim.imp : f.imp;
            const exp = sim ? sim.exp : f.exp;
            const cost = costOf(plan, imp, exp, f.cl);
            const row = {
                solarKw: solarSizes[si], batteryKwh: kwh, plan: plan.name, bill: cost.total, cost,
                importKwh: sum(imp), exportKwh: sum(exp), controlledKwh: sum(f.cl),
                solarKwh: f.solarKwh, solarSelf: f.solarSelf, curtailed: f.curtailed + (sim ? sim.curtailed : 0),
                battery: sim ? { charged: sim.charged, gridCharged: sim.gridCharged, discharged: sim.discharged, exported: sim.exported, cycles: sim.cycles } : null
            };
            rows.push(row);
            return row;
        };

        // No battery: every solar size on every plan (fast).
        flowsBy.forEach((f, si) => plans.forEach((plan) => add(si, plan, 0, null)));
        const batteries = (ctx.batterySizes || []).filter((b) => b > 0);
        if (!batteries.length) return { rows, plans };

        // Which plans get the full battery search: a probe battery on a middle solar size ranks them.
        let searched = plans;
        const keep = ctx.keepPlans || 6;
        if (plans.length > keep) {
            const si = Math.floor((solarSizes.length - 1) / 2);
            const probe = batteryOf(batteries[Math.floor((batteries.length - 1) / 2)]);
            const probed = [];
            for (let p = 0; p < plans.length; p++) {
                const sim = Amber.simulateBattery(year, flowsBy[si], pricesOf(plans[p]), probe);
                probed.push({ plan: plans[p], bill: costOf(plans[p], sim.imp, sim.exp, flowsBy[si].cl).total });
                if (onProgress) onProgress({ phase: 'probe', done: p + 1, total: plans.length });
                await pause();
            }
            probed.sort((a, b) => a.bill - b.bill);
            const names = new Set(probed.slice(0, keep).map((x) => x.plan.name));
            (ctx.mustPlans || []).forEach((name) => names.add(name));
            searched = plans.filter((p) => names.has(p.name));
        }
        const total = solarSizes.length * batteries.length * searched.length;
        let done = 0;
        let last = Date.now();
        for (let si = 0; si < solarSizes.length; si++) {
            for (let bi = 0; bi < batteries.length; bi++) {
                for (let p = 0; p < searched.length; p++) {
                    const sim = Amber.simulateBattery(year, flowsBy[si], pricesOf(searched[p]), batteryOf(batteries[bi]));
                    add(si, searched[p], batteries[bi], sim);
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
        return { rows, plans, searchedPlans: searched.map((p) => p.name), batteryOf };
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
     * Returns yearly flows, payback (years, fractional; null = never), npv, net totals and irr.
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
        let npv = -capex.total;
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
                spend += f.batteryPerKwh * opt.batteryKwh * Math.pow(1 - f.batteryCostDecline / 100, k - 1);
            }
            if ((opt.solarKw > 0 || opt.batteryKwh > 0) && k > 1 && (k - 1) % f.inverterLife === 0) spend += f.inverterCost;
            const net = saving - spend;
            const before = cum;
            cum += net;
            if (payback == null && cum >= 0 && net > 0) payback = k - 1 + (-before) / net;
            npv += net / Math.pow(1 + r, k);
            flows.push({ year: k, saving, spend, net, cumulative: cum, capacity, panels });
        }
        const irr = irrOf(-capex.total, flows.map((x) => x.net));
        const net10 = flows.slice(0, 10).reduce((s, x) => s + x.net, 0) - capex.total;
        return { capex, flows, payback, npv, irr, net10, netAll: cum, firstYearSaving: flows.length ? flows[0].saving : 0 };
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

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
