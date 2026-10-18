(function (root) {
    const Amber = root.Amber = root.Amber || {};

    /*
     * Battery re-scheduling estimate.
     *
     * The comparison tables price the meter data exactly as it happened on Amber. With a home
     * battery (and EVs) that is pessimistic for free-window plans: SmartShift charged and
     * exported around wholesale prices, not around the plan's free window or its evening
     * feed-in window. This re-times the real interval data day by day:
     *
     *   1. Shift out-of-window grid use into the free window (most expensive first), limited by
     *      a daily shift budget (battery capacity plus EV charging you can move), the window's
     *      daily cap and an import power limit. Shifted energy costs 1/round-trip in the window.
     *   2. Use battery exports (evening/overnight) to cover remaining grid use priced above the
     *      plan's best feed-in rate instead of exporting.
     *   3. Move the remaining battery exports into the plan's best feed-in window, up to its
     *      daily cap and an export power limit.
     *   4. Spend any budget and window room left on extra exports into that window, charged
     *      for free in the free window (only where that beats shifting more grid use).
     *
     * It needs no battery telemetry, so it is an estimate: midday solar exports stay put, and
     * a day's budget is assumed available whatever happened the day before.
     */
    Amber.REDISPATCH_DEFAULTS = {
        budgets: [10, 20, 30],
        rte: 90,
        windowKw: 13,
        exportKw: 5,
        batteryExportStart: '17:00',
        batteryExportEnd: '08:00'
    };

    function minutes(hhmm) {
        const s = String(hhmm || '00:00');
        return parseInt(s.substring(0, 2), 10) * 60 + parseInt(s.substring(3, 5), 10);
    }

    /** Hours of the given windows that apply on a weekday/month (overnight windows wrap). */
    Amber.windowHoursOn = function (windows, weekday, month) {
        return (windows || []).reduce((hours, w) => {
            const days = w.days || [];
            if (days.length && !days.includes(weekday)) return hours;
            const months = w.months || [];
            if (months.length && !months.includes(month)) return hours;
            const s = minutes(w.start);
            const f = minutes(w.end);
            if (s === f) return hours;
            return hours + (f > s ? f - s : 1440 - s + f) / 60;
        }, 0);
    };

    /** The plan's best time-varying feed-in window (rate above its default feed-in), or null. */
    Amber.premiumFeedInWindow = function (planConfig) {
        const base = parseFloat(planConfig && planConfig.feedIn) || 0;
        let best = null;
        ((planConfig && planConfig.feedInWindows) || []).forEach((w) => {
            const rate = parseFloat(w.rate) || 0;
            if (rate > base && (!best || rate > (parseFloat(best.rate) || 0))) best = w;
        });
        return best;
    };

    Amber.planHasFreeWindow = function (planConfig) {
        const free = planConfig && planConfig.rateType === 'tou' && planConfig.tou && planConfig.tou.free;
        return !!(free && (free.windows || []).length);
    };

    function cloneChannel(channel) {
        return Object.assign({}, channel, {
            usageData: (channel.usageData || []).map((item) => Object.assign({}, item, { kwh: Amber.absKwh(item.kwh) }))
        });
    }

    function scaleItems(items, factor) {
        if (factor >= 1) return;
        items.forEach((item) => { item.kwh *= Math.max(0, factor); });
    }

    function spread(items, kwh) {
        if (!items.length || kwh <= 0) return;
        const each = kwh / items.length;
        items.forEach((item) => { item.kwh += each; });
    }

    /**
     * Re-timed copy of channelTotals for a free-window plan, or null if the plan has no free
     * window. params: { budgetKwh, rte (%), windowKw, exportKw, batteryExportStart/End }.
     * The originals are not modified.
     */
    Amber.redispatchForPlan = function (channelTotals, planConfig, state, params) {
        if (!Amber.planHasFreeWindow(planConfig)) return null;
        const p = Object.assign({}, Amber.REDISPATCH_DEFAULTS, params || {});
        const rte = Math.min(1, Math.max(0.5, (parseFloat(p.rte) || 90) / 100));
        const budgetPerDay = Math.max(0, parseFloat(p.budgetKwh) || 0);
        const windowKw = Math.max(0, parseFloat(p.windowKw) || 0);
        const exportKw = Math.max(0, parseFloat(p.exportKw) || 0);
        const tou = planConfig.tou;
        const fallback = parseFloat(planConfig.flat) || 0;
        const freeCap = parseFloat(tou.free.capKwh) > 0 ? parseFloat(tou.free.capKwh) : Infinity;
        const premium = Amber.premiumFeedInWindow(planConfig);
        const premiumRate = premium ? parseFloat(premium.rate) || 0 : null;
        const premiumCap = premium && parseFloat(premium.capKwh) > 0 ? parseFloat(premium.capKwh) : Infinity;
        const defaultFit = parseFloat(planConfig.feedIn) || 0;
        const exportValue = premium ? premiumRate : defaultFit;

        const out = {};
        const days = Object.create(null);
        const day = (dateStr, parts) => days[dateStr] || (days[dateStr] = {
            parts, free: [], loads: Object.create(null), premium: [], battery: []
        });

        Object.keys(channelTotals || {}).forEach((id) => {
            const src = channelTotals[id];
            if (src.type !== 'general' && src.type !== 'feedIn') { out[id] = src; return; }
            const copy = out[id] = cloneChannel(src);
            copy.usageData.forEach((item) => {
                const parts = Amber.clockPartsForItem(item, planConfig, state);
                const d = day(parts.dateStr, parts);
                if (copy.type === 'general') {
                    const cls = Amber.getTouPeriod(parts, tou, fallback);
                    if (cls.period === 'free') { d.free.push(item); return; }
                    const key = String(cls.rate);
                    const bucket = d.loads[key] || (d.loads[key] = { rate: cls.rate, items: [], kwh: 0 });
                    bucket.items.push(item);
                    bucket.kwh += item.kwh;
                } else if (premium && Amber.windowMatches(premium, parts)) {
                    d.premium.push(item);
                } else if (Amber.timeInWindow(parts, p.batteryExportStart, p.batteryExportEnd)) {
                    d.battery.push(item);
                }
            });
        });

        const summary = { days: 0, shiftedKwh: 0, redirectedKwh: 0, retimedKwh: 0, extraExportKwh: 0, addedWindowImportKwh: 0 };
        const sum = (items) => items.reduce((s, item) => s + item.kwh, 0);

        Object.keys(days).forEach((dateStr) => {
            const d = days[dateStr];
            summary.days += 1;
            const freeHours = Amber.windowHoursOn(tou.free.windows, d.parts.weekday, d.parts.month);
            let room = d.free.length
                ? Math.max(0, Math.min(freeCap, windowKw * freeHours) - sum(d.free))
                : 0;
            let budget = budgetPerDay;
            let windowImport = 0;
            const loads = Object.keys(d.loads).map((k) => d.loads[k]).sort((a, b) => b.rate - a.rate);
            loads.forEach((b) => { b.left = b.kwh; });

            const shift = (bucket) => {
                const m = Math.min(bucket.left, budget, room * rte);
                if (m <= 0) return;
                bucket.left -= m;
                budget -= m;
                room -= m / rte;
                windowImport += m / rte;
                summary.shiftedKwh += m;
            };

            // 1. Shift grid use worth more than an export into the free window.
            loads.filter((b) => b.rate > 0 && (premiumRate == null || b.rate > premiumRate)).forEach(shift);

            // 2. Battery exports cover remaining grid use priced above the export value.
            const batteryKwh = sum(d.battery);
            const premiumKwh = sum(d.premium);
            let batteryLeft = batteryKwh;
            let premiumLeft = premiumKwh;
            loads.filter((b) => b.rate > exportValue).forEach((b) => {
                const fromBattery = Math.min(b.left, batteryLeft);
                b.left -= fromBattery;
                batteryLeft -= fromBattery;
                const fromPremium = Math.min(b.left, premiumLeft);
                b.left -= fromPremium;
                premiumLeft -= fromPremium;
                summary.redirectedKwh += fromBattery + fromPremium;
            });

            // 3. Move the remaining battery exports into the best feed-in window.
            let exportRoom = premium && d.premium.length
                ? Math.max(0, Math.min(premiumCap, exportKw * Amber.windowHoursOn([premium], d.parts.weekday, d.parts.month)) - premiumLeft)
                : 0;
            const retimed = Math.min(batteryLeft, exportRoom);
            batteryLeft -= retimed;
            exportRoom -= retimed;
            summary.retimedKwh += retimed;

            // 4. Spend what is left: extra exports where the window pays more than shifting saves.
            let extraExport = 0;
            if (premium && premiumRate > 0) {
                const x = Math.min(exportRoom, budget, room * rte);
                if (x > 0) {
                    extraExport = x;
                    exportRoom -= x;
                    budget -= x;
                    room -= x / rte;
                    windowImport += x / rte;
                    summary.extraExportKwh += x;
                }
            }
            loads.filter((b) => b.rate > 0 && b.left > 0).forEach(shift);

            // Write the day back onto the copied intervals.
            loads.forEach((b) => { if (b.kwh > 0) scaleItems(b.items, b.left / b.kwh); });
            spread(d.free, windowImport);
            summary.addedWindowImportKwh += windowImport;
            if (batteryKwh > 0) scaleItems(d.battery, batteryLeft / batteryKwh);
            if (premiumKwh > 0) scaleItems(d.premium, premiumLeft / premiumKwh);
            spread(d.premium, retimed + extraExport);
        });

        Object.keys(out).forEach((id) => {
            const c = out[id];
            if (c.type !== 'general' && c.type !== 'feedIn') return;
            c.totalKWh = c.usageData.reduce((s, item) => s + item.kwh, 0);
        });
        return { channels: out, summary };
    };

    /**
     * Plan totals over whole months: as metered and re-timed at each shift budget.
     * opts: { state, gstInclusive, amberRates, site, budgets, params }
     * Returns { months, amber: { total, demand, byMonth }, plans: [{ name, metered, shifted[], byMonth }] }.
     */
    Amber.batteryShiftTable = function (channelTotals, months, plans, opts) {
        const job = shiftJob(channelTotals, months, opts);
        return job.finish(plans.map(job.planRow));
    };

    /** Same as batteryShiftTable, yielding to the browser after each plan-month (a year of 5-minute data takes seconds). */
    Amber.batteryShiftTableAsync = async function (channelTotals, months, plans, opts, isCancelled) {
        const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
        const job = shiftJob(channelTotals, months, opts);
        const rows = [];
        for (let i = 0; i < plans.length; i++) {
            const row = job.newRow(plans[i]);
            for (let j = 0; j < job.months.length; j++) {
                await pause();
                if (isCancelled && isCancelled()) return null;
                job.addMonth(row, plans[i], job.months[j]);
            }
            rows.push(row);
        }
        return job.finish(rows);
    };

    function shiftJob(channelTotals, months, opts) {
        const o = opts || {};
        const budgets = o.budgets || Amber.REDISPATCH_DEFAULTS.budgets;
        const gst = o.gstInclusive !== false;
        const byMonth = {};
        months.forEach((m) => { byMonth[m] = {}; });
        Object.keys(channelTotals || {}).forEach((id) => {
            const src = channelTotals[id];
            months.forEach((m) => { byMonth[m][id] = Amber.emptyChannel(src); });
            (src.usageData || []).forEach((item) => {
                const bucket = byMonth[Amber.usageDateStr(item).substring(0, 7)];
                if (bucket) bucket[id].usageData.push(item);
            });
        });
        const monthEnd = (m) => {
            const last = new Date(parseInt(m.substring(0, 4), 10), parseInt(m.substring(5, 7), 10), 0).getDate();
            return `${m}-${String(last).padStart(2, '0')}`;
        };
        const adj = (v) => Amber.adjustForGst(v || 0, gst, false);

        const amber = { total: 0, demand: 0, byMonth: {} };
        months.forEach((m) => {
            const t = Amber.periodTotals(byMonth[m], `${m}-01`, monthEnd(m), {
                site: o.site, state: o.state, amberRates: o.amberRates
            });
            const total = adj(t.amberUsage) + (t.amberFeedIn || 0) + adj(t.amberDemand) + adj(t.amberConnection + t.amberSubscription);
            amber.byMonth[m] = { total, demand: adj(t.amberDemand) };
            amber.total += total;
            amber.demand += adj(t.amberDemand);
        });

        const newRow = (plan) => ({ name: plan.name, metered: 0, shifted: budgets.map(() => 0), byMonth: {} });
        const addMonth = (row, plan, m) => {
            const from = `${m}-01`;
            const to = monthEnd(m);
            const days = Amber.inclusiveDayCount(from, to);
            const options = { startDateStr: from, endDateStr: to, numDays: days, state: o.state, gstInclusive: gst, amberRates: o.amberRates };
            const metered = Amber.computePlanTotals(byMonth[m], plan.config, options).otherTotal;
            const shifted = budgets.map((b, i) => {
                const re = Amber.redispatchForPlan(byMonth[m], plan.config, o.state, Object.assign({}, o.params, { budgetKwh: b }));
                const v = re ? Amber.computePlanTotals(re.channels, plan.config, options).otherTotal : metered;
                row.shifted[i] += v;
                return v;
            });
            row.metered += metered;
            row.byMonth[m] = { metered, shifted };
        };
        const planRow = (plan) => {
            const row = newRow(plan);
            months.forEach((m) => addMonth(row, plan, m));
            return row;
        };
        return { months, newRow, addMonth, planRow, finish: (rows) => ({ months, budgets, amber, plans: rows }) };
    }

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
