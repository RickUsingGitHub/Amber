(function (root) {
    const Amber = root.Amber = root.Amber || {};

    Amber.absKwh = function (value) {
        const n = parseFloat(value);
        if (!Number.isFinite(n)) return 0;
        return Math.abs(n);
    };

    Amber.isEstimatedQuality = function (quality) {
        if (!quality) return false;
        const q = String(quality).toLowerCase();
        return q === 'estimated' || q === 'estimate';
    };

    /**
     * TOU period for a clock time. A free window (tou.free) wins over everything, then
     * super off-peak (e.g. an EV overnight rate), then peak, shoulder and off-peak.
     * skipFree prices a free-window interval at the rate that would otherwise apply
     * (used for usage over the free window's daily cap).
     */
    Amber.getTouPeriod = function (parts, touConfig, fallbackRate, skipFree) {
        const fallback = parseFloat(fallbackRate) || 0;
        if (!touConfig) return { period: 'anytime', rate: fallback };
        const checkPeriod = (period) => {
            if (!period) return false;
            if (period.windows && period.windows.length > 0) {
                return period.windows.some((window) => Amber.windowMatches(window, parts));
            }
            return Amber.windowMatches(period, parts);
        };
        if (!skipFree && checkPeriod(touConfig.free)) {
            return { period: 'free', rate: parseFloat(touConfig.free.rate) || 0 };
        }
        if (checkPeriod(touConfig.superOffpeak)) {
            return { period: 'superOffpeak', rate: parseFloat(touConfig.superOffpeak.rate) || 0 };
        }
        if (checkPeriod(touConfig.peak)) {
            return { period: 'peak', rate: parseFloat(touConfig.peak.rate) || 0 };
        }
        if (checkPeriod(touConfig.shoulder)) {
            return { period: 'shoulder', rate: parseFloat(touConfig.shoulder.rate) || 0 };
        }
        if (touConfig.offpeak && touConfig.offpeak.rate != null && touConfig.offpeak.rate !== '') {
            return { period: 'offpeak', rate: parseFloat(touConfig.offpeak.rate) || 0 };
        }
        return { period: 'offpeak', rate: fallback };
    };

    Amber.getTouRate = function (parts, touConfig, fallbackRate) {
        return Amber.getTouPeriod(parts, touConfig, fallbackRate).rate;
    };

    Amber.PERIOD_LABELS = {
        free: 'Free window',
        freeOverCap: 'Free window (over daily cap)',
        superOffpeak: 'Super off-peak',
        peak: 'Peak',
        shoulder: 'Shoulder',
        offpeak: 'Off-peak',
        anytime: 'Anytime',
        controlledLoad: 'Controlled load',
        feedIn: 'Feed-in',
        feedInOverCap: 'Feed-in (over daily cap)'
    };

    Amber.classifyUsagePeriod = function (item, channelType, planConfig, state) {
        if (channelType === 'feedIn') {
            return {
                period: 'feedIn',
                label: Amber.PERIOD_LABELS.feedIn,
                rate: Amber.otherRateForItem(item, 'feedIn', planConfig, state)
            };
        }
        if (channelType === 'controlledLoad') {
            return {
                period: 'controlledLoad',
                label: Amber.PERIOD_LABELS.controlledLoad,
                rate: Amber.otherRateForItem(item, 'controlledLoad', planConfig, state)
            };
        }
        if (!planConfig || planConfig.rateType === 'flat') {
            return {
                period: 'anytime',
                label: Amber.PERIOD_LABELS.anytime,
                rate: parseFloat(planConfig && planConfig.flat) || 0
            };
        }
        const parts = Amber.clockPartsForItem(item, planConfig, state);
        const found = Amber.getTouPeriod(parts, planConfig.tou, parseFloat(planConfig.flat) || 0);
        return {
            period: found.period,
            label: Amber.PERIOD_LABELS[found.period] || found.period,
            rate: found.rate
        };
    };

    Amber.channelPeriodBreakdown = function (channel, planConfig, state) {
        const buckets = Object.create(null);
        const order = ['free', 'freeOverCap', 'superOffpeak', 'peak', 'shoulder', 'offpeak', 'anytime', 'controlledLoad', 'feedIn', 'feedInOverCap'];
        const capped = Amber.cappedSplits(channel, planConfig, state);
        const add = (period, label, kwh, rate, amberCost) => {
            if (!buckets[period]) {
                buckets[period] = { period, label, kwh: 0, amberCost: 0, otherCost: 0, rate };
            } else if (buckets[period].rate !== rate) {
                buckets[period].rate = null;
            }
            buckets[period].kwh += kwh;
            buckets[period].amberCost += amberCost;
            const other = (kwh * rate) / 100;
            buckets[period].otherCost += channel.type === 'feedIn' ? -other : other;
        };
        (channel.usageData || []).forEach((item) => {
            const kwh = Amber.absKwh(item.kwh);
            const perKwh = parseFloat(item.perKwh) || 0;
            const splits = capped && capped.get(item);
            if (splits) {
                splits.forEach((s) => {
                    const share = kwh > 0 ? s.kwh / kwh : 0;
                    add(s.period, s.label, s.kwh, s.rate, (perKwh / 100) * kwh * share);
                });
                return;
            }
            const cls = Amber.classifyUsagePeriod(item, channel.type, planConfig, state);
            add(cls.period, cls.label, kwh, cls.rate, (perKwh / 100) * kwh);
        });
        const rows = order.filter((key) => buckets[key] && buckets[key].kwh > 0).map((key) => buckets[key]);
        if (channel.type === 'feedIn' && rows.length === 1 && Number.isFinite(channel.totalAmberCost)) {
            rows[0].amberCost = channel.totalAmberCost;
        }
        return rows;
    };

    Amber.formatCentsPerKwh = function (rate) {
        const n = parseFloat(rate);
        if (!Number.isFinite(n)) return '';
        const text = String(Number(n.toFixed(4)));
        return `(${text}c/kWh) `;
    };

    Amber.getFeedInRate = function (parts, planConfig) {
        const defaultRate = parseFloat(planConfig && planConfig.feedIn) || 0;
        const windows = planConfig && planConfig.feedInWindows;
        if (!windows || !windows.length) return defaultRate;
        for (let i = 0; i < windows.length; i++) {
            const window = windows[i];
            if (Amber.windowMatches(window, parts)) return parseFloat(window.rate) || 0;
        }
        return defaultRate;
    };

    function freeCapKwh(planConfig) {
        const free = planConfig && planConfig.rateType === 'tou' && planConfig.tou && planConfig.tou.free;
        if (!free || !(free.windows || []).length) return 0;
        const cap = parseFloat(free.capKwh);
        return Number.isFinite(cap) && cap > 0 ? cap : 0;
    }

    function feedInHasCaps(planConfig) {
        return ((planConfig && planConfig.feedInWindows) || []).some((w) => parseFloat(w.capKwh) > 0);
    }

    /** True when some rate depends on how much was already used that day (daily kWh caps). */
    Amber.planHasCaps = function (planConfig) {
        return freeCapKwh(planConfig) > 0 || feedInHasCaps(planConfig);
    };

    function sortedByTime(data) {
        const key = (item) => (item.processedTime ? item.nemTime : Amber.adjustNemTime(item.nemTime)) || '';
        return data.slice().sort((a, b) => {
            const ka = key(a);
            const kb = key(b);
            return ka < kb ? -1 : (ka > kb ? 1 : 0);
        });
    }

    const capCache = typeof WeakMap === 'function' ? new WeakMap() : null;

    /**
     * Per-interval pricing splits for plans with daily kWh caps, as a Map item -> [{ period,
     * label, kwh, rate }]. Usage in a capped free window is free until the day's cap is used,
     * then priced at the rate that would otherwise apply; a capped feed-in window pays its rate
     * until the cap, then overRate (or the plan's default feed-in). Days follow the plan's clock.
     * Returns null when the channel's pricing has no caps.
     */
    Amber.cappedSplits = function (channel, planConfig, state) {
        if (!channel || !planConfig) return null;
        const type = channel.type;
        const general = type === 'general' && freeCapKwh(planConfig) > 0;
        const feedIn = type === 'feedIn' && feedInHasCaps(planConfig);
        if (!general && !feedIn) return null;
        const data = channel.usageData || [];
        const sig = JSON.stringify([state, planConfig.clock || '', planConfig.timeZone || '', type,
            general ? [planConfig.tou, planConfig.flat] : [planConfig.feedIn, planConfig.feedInWindows]]);
        const hit = capCache && capCache.get(data);
        if (hit && hit.sig === sig && hit.len === data.length) return hit.map;

        const map = new Map();
        const used = Object.create(null);
        if (general) {
            const cap = freeCapKwh(planConfig);
            const fallback = parseFloat(planConfig.flat) || 0;
            sortedByTime(data).forEach((item) => {
                const kwh = Amber.absKwh(item.kwh);
                const parts = Amber.clockPartsForItem(item, planConfig, state);
                const cls = Amber.getTouPeriod(parts, planConfig.tou, fallback);
                if (cls.period !== 'free') {
                    map.set(item, [{ period: cls.period, label: Amber.PERIOD_LABELS[cls.period] || cls.period, kwh, rate: cls.rate }]);
                    return;
                }
                const sofar = used[parts.dateStr] || 0;
                const within = Math.max(0, Math.min(kwh, cap - sofar));
                const over = kwh - within;
                used[parts.dateStr] = sofar + kwh;
                const splits = [{ period: 'free', label: Amber.PERIOD_LABELS.free, kwh: within, rate: cls.rate }];
                if (over > 0) {
                    const alt = Amber.getTouPeriod(parts, planConfig.tou, fallback, true);
                    splits.push({ period: 'freeOverCap', label: Amber.PERIOD_LABELS.freeOverCap, kwh: over, rate: alt.rate });
                }
                map.set(item, splits);
            });
        } else {
            const windows = planConfig.feedInWindows || [];
            const defaultRate = parseFloat(planConfig.feedIn) || 0;
            sortedByTime(data).forEach((item) => {
                const kwh = Amber.absKwh(item.kwh);
                const parts = Amber.clockPartsForItem(item, planConfig, state);
                let index = -1;
                for (let i = 0; i < windows.length; i++) {
                    if (Amber.windowMatches(windows[i], parts)) { index = i; break; }
                }
                if (index < 0) {
                    map.set(item, [{ period: 'feedIn', label: Amber.PERIOD_LABELS.feedIn, kwh, rate: defaultRate }]);
                    return;
                }
                const win = windows[index];
                const rate = parseFloat(win.rate) || 0;
                const cap = parseFloat(win.capKwh);
                if (!(cap > 0)) {
                    map.set(item, [{ period: 'feedIn', label: Amber.PERIOD_LABELS.feedIn, kwh, rate }]);
                    return;
                }
                const key = parts.dateStr + '#' + index;
                const sofar = used[key] || 0;
                const within = Math.max(0, Math.min(kwh, cap - sofar));
                const over = kwh - within;
                used[key] = sofar + kwh;
                const overRate = Number.isFinite(parseFloat(win.overRate)) ? parseFloat(win.overRate) : defaultRate;
                const splits = [{ period: 'feedIn', label: Amber.PERIOD_LABELS.feedIn, kwh: within, rate }];
                if (over > 0) splits.push({ period: 'feedInOverCap', label: Amber.PERIOD_LABELS.feedInOverCap, kwh: over, rate: overRate });
                map.set(item, splits);
            });
        }
        if (capCache) capCache.set(data, { sig, len: data.length, map });
        return map;
    };

    /** Competitor cost of one interval in cents (unsigned), honouring daily caps when given splits. */
    Amber.otherItemCostCents = function (item, channelType, planConfig, state, capped) {
        const splits = capped && capped.get(item);
        if (splits) return splits.reduce((sum, s) => sum + s.kwh * s.rate, 0);
        return Amber.absKwh(item.kwh) * Amber.otherRateForItem(item, channelType, planConfig, state);
    };

    /** Clock parts for an interval, cached on the item per clock and timezone. */
    Amber.itemClockParts = function (item, opts) {
        const key = (opts.clock || 'local') + '|' + (opts.timeZone || '');
        if (!item._clockParts) item._clockParts = Object.create(null);
        if (item._clockParts[key]) return item._clockParts[key];
        const nem = item.processedTime ? item.nemTime : Amber.adjustNemTime(item.nemTime);
        const parts = Amber.getClockParts(nem, opts);
        item._clockParts[key] = parts;
        return parts;
    };

    Amber.clockPartsForItem = function (item, planConfig, state) {
        return Amber.itemClockParts(item, Amber.clockOptionsForState(state, planConfig));
    };

    Amber.otherRateForItem = function (item, channelType, planConfig, state) {
        if (channelType === 'feedIn') {
            const windows = planConfig && planConfig.feedInWindows;
            if (!windows || !windows.length) return parseFloat(planConfig && planConfig.feedIn) || 0;
            return Amber.getFeedInRate(Amber.clockPartsForItem(item, planConfig, state), planConfig);
        }
        if (planConfig.rateType === 'flat') {
            if (channelType === 'controlledLoad') {
                const cl = parseFloat(planConfig.cl);
                if (Number.isFinite(cl) && cl > 0) return cl;
            }
            return parseFloat(planConfig.flat) || 0;
        }
        if (channelType === 'controlledLoad') return parseFloat(planConfig.cl) || 0;
        const fallback = parseFloat(planConfig.flat) || 0;
        return Amber.getTouRate(Amber.clockPartsForItem(item, planConfig, state), planConfig.tou, fallback);
    };

    Amber.calculateOtherSupplierCosts = function (channelTotals, planConfig, state) {
        Object.values(channelTotals).forEach((channel) => {
            const sign = channel.type === 'feedIn' ? -1 : 1;
            const capped = Amber.cappedSplits(channel, planConfig, state);
            channel.totalOtherCost = (channel.usageData || []).reduce((total, item) =>
                total + sign * Amber.otherItemCostCents(item, channel.type, planConfig, state, capped) / 100, 0);
        });
    };

    /** Split channel data into calendar months (by usage date). */
    Amber.splitChannelsByMonth = function (channelTotals) {
        const months = {};
        Object.keys(channelTotals || {}).forEach((id) => {
            const c = channelTotals[id];
            (c.usageData || []).forEach((item) => {
                const key = Amber.usageDateStr(item).substring(0, 7);
                if (!key) return;
                const month = months[key] || (months[key] = {});
                if (!month[id]) month[id] = { identifier: c.identifier, type: c.type, usageData: [] };
                month[id].usageData.push(item);
            });
        });
        return months;
    };

    function combineMonthly(results, daysKey) {
        const used = results.filter((r) => r.info && r.info.cost > 0);
        if (!used.length) return null;
        const peak = used.reduce((a, b) => (b.info.maxDemandKwh > a.info.maxDemandKwh ? b : a));
        const combined = Object.assign({}, peak.info, {
            cost: used.reduce((s, r) => s + r.info.cost, 0),
            months: used.map((r) => ({ month: r.month, cost: r.info.cost, maxDemandKwh: r.info.maxDemandKwh, maxDemandTime: r.info.maxDemandTime, days: r.info[daysKey] }))
        });
        combined[daysKey] = used.reduce((s, r) => s + (r.info[daysKey] || 0), 0);
        return combined;
    }

    /**
     * Amber (network) demand charge. Demand is billed per calendar month: each month's
     * own peak × that month's demand days, summed across the range.
     */
    Amber.calculateDemandTariff = function (channelTotals, amberDemandCents) {
        // amberDemandCents: c/kW/day, or the amberRates object (each month at its own rate).
        const months = Amber.splitChannelsByMonth(channelTotals);
        const keys = Object.keys(months).sort();
        if (keys.length > 1) {
            const combined = combineMonthly(keys.map((k) => ({
                month: k, info: Amber.calculateMonthDemandTariff(months[k], demandCentsFor(amberDemandCents, k))
            })), 'demandDays');
            return combined || { cost: 0, maxDemandKwh: 0, demandDays: 0, maxDemandTime: null };
        }
        return Amber.calculateMonthDemandTariff(channelTotals, demandCentsFor(amberDemandCents, keys[0]));
    };

    /**
     * All channels of one type as one channel (sites can have several general meters, e.g. E1
     * and E2). Returns the channel itself when there is only one, or null when there are none.
     */
    Amber.mergedChannelOfType = function (channelTotals, type) {
        const list = Object.values(channelTotals || {}).filter((c) => c && c.type === type);
        if (list.length <= 1) return list[0] || null;
        return {
            identifier: list.map((c) => c.identifier).join('+'),
            type,
            merged: true,
            usageData: [].concat(...list.map((c) => c.usageData || [])),
            totalKWh: list.reduce((s, c) => s + (c.totalKWh || 0), 0),
            totalAmberCost: list.reduce((s, c) => s + (c.totalAmberCost || 0), 0)
        };
    };

    Amber.calculateMonthDemandTariff = function (channelTotals, amberDemandCents) {
        const generalChannel = Amber.mergedChannelOfType(channelTotals, 'general');
        const empty = { cost: 0, maxDemandKwh: 0, demandDays: 0, maxDemandTime: null };
        if (!generalChannel || !generalChannel.usageData || generalChannel.usageData.length === 0) {
            return empty;
        }

        const demandWindowUsage = generalChannel.usageData.filter((item) =>
            item.tariffInformation && item.tariffInformation.demandWindow === true
        );
        if (demandWindowUsage.length === 0) return empty;

        const thirtyMinChunks = {};
        demandWindowUsage.forEach((item) => {
            const nem = item.processedTime ? item.nemTime : Amber.adjustNemTime(item.nemTime);
            const parts = Amber.parseNemParts(nem);
            const key = Amber.thirtyMinBlockKey(parts);
            thirtyMinChunks[key] = (thirtyMinChunks[key] || 0) + Amber.absKwh(item.kwh);
        });

        let maxDemandKwh = 0;
        let maxDemandTime = null;
        Object.keys(thirtyMinChunks).forEach((startTime) => {
            if (thirtyMinChunks[startTime] > maxDemandKwh) {
                maxDemandKwh = thirtyMinChunks[startTime];
                maxDemandTime = startTime;
            }
        });
        if (maxDemandKwh === 0) return empty;

        const demandDaysSet = new Set(demandWindowUsage.map((item) => Amber.usageDateStr(item)));
        const numberOfDemandDays = demandDaysSet.size;
        const rate = amberDemandCents != null ? amberDemandCents : Amber.DEFAULT_AMBER_DEMAND_CENTS;
        const demandTariffCost = maxDemandKwh * 2 * (rate / 100) * numberOfDemandDays;

        return {
            cost: demandTariffCost,
            maxDemandKwh,
            demandDays: numberOfDemandDays,
            maxDemandTime
        };
    };

    /** Competitor demand charge, also per calendar month (clipped to the selected range). */
    Amber.calculateOtherDemandTariff = function (channelTotals, startDateStr, endDateStr, planConfig, state) {
        const months = Amber.splitChannelsByMonth(channelTotals);
        const keys = Object.keys(months).sort();
        if (keys.length > 1) {
            const combined = combineMonthly(keys.map((k) => {
                const y = parseInt(k.substring(0, 4), 10);
                const m = parseInt(k.substring(5, 7), 10);
                const monthStart = `${k}-01`;
                const monthEnd = `${k}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
                const from = startDateStr && startDateStr > monthStart ? startDateStr : monthStart;
                const to = endDateStr && endDateStr < monthEnd ? endDateStr : monthEnd;
                return { month: k, info: Amber.calculateMonthOtherDemandTariff(months[k], from, to, planConfig, state) };
            }), 'applicableDaysCount');
            return combined || { cost: 0, maxDemandKwh: 0, maxDemandTime: null, dailyCharge: 0, applicableDaysCount: 0 };
        }
        return Amber.calculateMonthOtherDemandTariff(channelTotals, startDateStr, endDateStr, planConfig, state);
    };

    Amber.calculateMonthOtherDemandTariff = function (channelTotals, startDateStr, endDateStr, planConfig, state) {
        const empty = { cost: 0, maxDemandKwh: 0, maxDemandTime: null, dailyCharge: 0, applicableDaysCount: 0 };
        const demand = planConfig && planConfig.demand;
        if (!demand || !demand.e) return empty;
        const demandDays = demand.days || [];
        if (!demandDays.length) return empty;

        const generalChannel = Amber.mergedChannelOfType(channelTotals, 'general');
        if (!generalChannel || !generalChannel.usageData || generalChannel.usageData.length === 0) {
            return empty;
        }

        const demandRate = parseFloat(demand.r) || 0;
        const demandWindowUsage = generalChannel.usageData.filter((item) => {
            const parts = Amber.clockPartsForItem(item, planConfig, state);
            if (!demandDays.includes(parts.weekday)) return false;
            return Amber.timeInWindow(parts, demand.s, demand.f);
        });
        if (demandWindowUsage.length === 0) return empty;

        const thirtyMinChunks = {};
        demandWindowUsage.forEach((item) => {
            const parts = Amber.clockPartsForItem(item, planConfig, state);
            const key = Amber.thirtyMinBlockKey(parts);
            thirtyMinChunks[key] = (thirtyMinChunks[key] || 0) + Amber.absKwh(item.kwh);
        });

        let maxDemandKwh = 0;
        let maxDemandTime = null;
        Object.keys(thirtyMinChunks).forEach((startTime) => {
            if (thirtyMinChunks[startTime] > maxDemandKwh) {
                maxDemandKwh = thirtyMinChunks[startTime];
                maxDemandTime = startTime;
            }
        });
        if (maxDemandKwh === 0) return empty;

        let applicableDaysCount = 0;
        let currentDate = new Date(startDateStr + 'T00:00:00');
        const endDate = new Date(endDateStr + 'T00:00:00');
        while (currentDate <= endDate) {
            if (demandDays.includes(currentDate.getDay())) applicableDaysCount++;
            currentDate.setDate(currentDate.getDate() + 1);
        }

        const dailyCharge = (maxDemandKwh * 2) * (demandRate / 100);
        return {
            cost: dailyCharge * applicableDaysCount,
            maxDemandKwh,
            maxDemandTime,
            dailyCharge,
            applicableDaysCount
        };
    };

    Amber.adjustForGst = function (cost, gstInclusive, isFeedIn) {
        if (!gstInclusive && !isFeedIn) return cost / 1.1;
        return cost;
    };

    Amber.shallowChannelCopy = function (channelTotals) {
        const copy = {};
        Object.keys(channelTotals).forEach((id) => {
            copy[id] = Object.assign({}, channelTotals[id]);
        });
        return copy;
    };

    /**
     * Amber's fixed rates on a date. Network charges change each 1 July, so rates.earlier
     * ({ until, connectionCents, subscriptionCents, demandCents }) applies to dates before
     * rates.earlier.until; any of its rates left blank fall back to the current ones.
     */
    Amber.amberRatesOn = function (rates, dateStr) {
        const r = rates || {};
        const e = r.earlier;
        if (!e || !e.until || !dateStr || dateStr >= e.until) return r;
        const pick = (k) => (e[k] != null && Number.isFinite(e[k]) ? e[k] : r[k]);
        return { connectionCents: pick('connectionCents'), subscriptionCents: pick('subscriptionCents'), demandCents: pick('demandCents') };
    };

    Amber.amberFixedDaily = function (amberRates, dateStr) {
        const r = Amber.amberRatesOn(amberRates, dateStr);
        return ((r.connectionCents || 0) + (r.subscriptionCents || 0)) / 100;
    };

    /** Connection and subscription ($) for every day from..to (inclusive), each day at its own rates. */
    Amber.amberFixedForPeriod = function (amberRates, from, to) {
        const r = amberRates || {};
        const days = Amber.inclusiveDayCount(from, to);
        const e = r.earlier;
        let before = 0;
        if (e && e.until && from && from < e.until) {
            before = to < e.until ? days : Amber.inclusiveDayCount(from, Amber.addDays(e.until, -1));
        }
        const old = Amber.amberRatesOn(r, from);
        const after = days - before;
        return {
            days,
            connection: ((old.connectionCents || 0) * before + (r.connectionCents || 0) * after) / 100,
            subscription: ((old.subscriptionCents || 0) * before + (r.subscriptionCents || 0) * after) / 100
        };
    };

    // Demand rate (c/kW/day) for a month: a number, or an amberRates object (dated rates).
    function demandCentsFor(ratesOrCents, monthKey) {
        if (ratesOrCents && typeof ratesOrCents === 'object') {
            const r = Amber.amberRatesOn(ratesOrCents, monthKey ? `${monthKey}-01` : null);
            return r.demandCents;
        }
        return ratesOrCents;
    }
    Amber.demandCentsFor = demandCentsFor;

    Amber.computePlanTotals = function (channelTotals, planConfig, options) {
        const opts = options || {};
        const startDateStr = opts.startDateStr;
        const endDateStr = opts.endDateStr;
        const numDays = opts.numDays;
        const state = opts.state;
        const gstInclusive = opts.gstInclusive !== false;
        const amberRates = opts.amberRates || {
            connectionCents: Amber.DEFAULT_AMBER_CONNECTION_CENTS,
            subscriptionCents: Amber.DEFAULT_AMBER_SUBSCRIPTION_CENTS,
            demandCents: Amber.DEFAULT_AMBER_DEMAND_CENTS
        };

        const temp = Amber.shallowChannelCopy(channelTotals);
        Amber.calculateOtherSupplierCosts(temp, planConfig, state);
        const otherDemand = Amber.calculateOtherDemandTariff(temp, startDateStr, endDateStr, planConfig, state);

        let otherEnergy = 0;
        Object.values(temp).forEach((c) => {
            otherEnergy += Amber.adjustForGst(c.totalOtherCost || 0, gstInclusive, c.type === 'feedIn');
        });
        const otherConnection = Amber.adjustForGst(((parseFloat(planConfig.daily) || 0) * numDays) / 100, gstInclusive, false);
        const otherDemandCost = Amber.adjustForGst(otherDemand.cost || 0, gstInclusive, false);
        const otherTotal = otherEnergy + otherConnection + otherDemandCost;

        return {
            otherTotal,
            otherEnergy,
            otherConnection,
            otherDemand,
            channels: temp
        };
    };

    Amber.precalculateDailySummaries = function (channelData, planConfig, amberRates, state) {
        const summaries = {};
        const monthlyDemandInfo = {};
        const allDatesWithData = new Set();

        Object.values(channelData).forEach((channel) => {
            channel.usageData.forEach((item) => {
                allDatesWithData.add(Amber.usageDateStr(item));
            });
        });

        const sortedDates = [...allDatesWithData].sort();
        if (sortedDates.length > 0) {
            const start = new Date(sortedDates[0] + 'T00:00:00');
            const end = new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00');
            let loopDate = new Date(start);
            while (loopDate <= end) {
                const dateStr = Amber.formatForInput(loopDate);
                summaries[dateStr] = {
                    totalInKwh: 0, totalOutKwh: 0,
                    amberCost: 0, otherCost: 0,
                    amberDemandCost: 0, otherDemandCost: 0,
                    estimatedCount: 0, billableCount: 0,
                    renewableWeighted: 0, renewableKwh: 0,
                    channels: {}
                };
                loopDate.setDate(loopDate.getDate() + 1);
            }
        }

        Object.values(channelData).forEach((channel) => {
            const capped = Amber.cappedSplits(channel, planConfig, state);
            channel.usageData.forEach((item) => {
                const dateStr = Amber.usageDateStr(item);
                if (!summaries[dateStr]) return;

                const kwh = Amber.absKwh(item.kwh);
                const perKwh = parseFloat(item.perKwh) || 0;
                const amberItemCost = (kwh * perKwh) / 100;
                const otherItemCost = Amber.otherItemCostCents(item, channel.type, planConfig, state, capped) / 100;

                if (!summaries[dateStr].channels[channel.identifier]) {
                    summaries[dateStr].channels[channel.identifier] = {
                        type: channel.type, kwh: 0, amberCost: 0, otherCost: 0
                    };
                }

                summaries[dateStr].channels[channel.identifier].kwh += kwh;
                summaries[dateStr].channels[channel.identifier].amberCost += amberItemCost;
                summaries[dateStr].amberCost += amberItemCost;

                if (Amber.isEstimatedQuality(item.quality)) summaries[dateStr].estimatedCount += 1;
                else summaries[dateStr].billableCount += 1;

                if (item.renewables != null && kwh) {
                    summaries[dateStr].renewableWeighted += (parseFloat(item.renewables) || 0) * kwh;
                    summaries[dateStr].renewableKwh += kwh;
                }

                if (channel.type === 'feedIn') {
                    summaries[dateStr].totalOutKwh += kwh;
                    summaries[dateStr].otherCost -= otherItemCost;
                    summaries[dateStr].channels[channel.identifier].otherCost -= otherItemCost;
                } else {
                    summaries[dateStr].totalInKwh += kwh;
                    summaries[dateStr].otherCost += otherItemCost;
                    summaries[dateStr].channels[channel.identifier].otherCost += otherItemCost;
                }
            });
        });

        const monthlyData = {};
        Object.keys(channelData).forEach((channelId) => {
            channelData[channelId].usageData.forEach((item) => {
                const monthKey = Amber.usageDateStr(item).substring(0, 7);
                if (!monthlyData[monthKey]) monthlyData[monthKey] = {};
                if (!monthlyData[monthKey][channelId]) {
                    monthlyData[monthKey][channelId] = {
                        identifier: channelData[channelId].identifier,
                        type: channelData[channelId].type,
                        usageData: []
                    };
                }
                monthlyData[monthKey][channelId].usageData.push(item);
            });
        });

        const demandDays = (planConfig.demand && planConfig.demand.days) || [];

        Object.keys(monthlyData).forEach((monthKey) => {
            const monthChannelData = monthlyData[monthKey];
            const year = parseInt(monthKey.substring(0, 4), 10);
            const month = parseInt(monthKey.substring(5, 7), 10) - 1;
            const monthStartDate = new Date(year, month, 1);
            const monthEndDate = new Date(year, month + 1, 0);
            const monthStartDateStr = Amber.formatForInput(monthStartDate);
            const monthEndDateStr = Amber.formatForInput(monthEndDate);

            const amberDemandInfoMonth = Amber.calculateDemandTariff(monthChannelData, amberRates);
            const otherDemandInfoMonth = Amber.calculateOtherDemandTariff(
                monthChannelData, monthStartDateStr, monthEndDateStr, planConfig, state
            );

            monthlyDemandInfo[monthKey] = { amber: amberDemandInfoMonth, other: otherDemandInfoMonth };

            const amberDailyDemandCost = (amberDemandInfoMonth && amberDemandInfoMonth.demandDays > 0)
                ? (amberDemandInfoMonth.cost / amberDemandInfoMonth.demandDays) : 0;
            const otherDailyDemandCharge = otherDemandInfoMonth ? otherDemandInfoMonth.dailyCharge : 0;

            const amberDemandDaysInMonth = new Set();
            const generalChannelForMonth = Amber.mergedChannelOfType(monthChannelData, 'general');
            if (generalChannelForMonth) {
                generalChannelForMonth.usageData.forEach((item) => {
                    if (item.tariffInformation && item.tariffInformation.demandWindow) {
                        amberDemandDaysInMonth.add(Amber.usageDateStr(item));
                    }
                });
            }

            let loopDate = new Date(monthStartDate);
            while (loopDate <= monthEndDate) {
                const dateStr = Amber.formatForInput(loopDate);
                if (summaries[dateStr]) {
                    if (amberDemandDaysInMonth.has(dateStr)) {
                        summaries[dateStr].amberDemandCost = amberDailyDemandCost;
                    }
                    if (demandDays.includes(loopDate.getDay())) {
                        summaries[dateStr].otherDemandCost = otherDailyDemandCharge;
                    }
                }
                loopDate.setDate(loopDate.getDate() + 1);
            }
        });

        return { summaries, monthlyDemandInfo };
    };

    Amber.EXPORT_TARIFFS = {
        EA029: {
            clock: 'local',
            timeZone: 'Australia/Sydney',
            middayStart: '10:00',
            middayEnd: '15:00',
            // Export charge 1.23 c/kWh ex GST (bill "Export Charge Energy" 0.0123 $/kWh).
            chargeIncGst: 1.3552,
            chargeExGst: 1.232,
            belKwhPerDay: 6.83,
            // Evening export reward window. Amber's feed-in prices already include the reward,
            // so it is only measured (for Bill Check), never credited again.
            rewardStart: '16:00',
            rewardEnd: '21:00'
        }
    };

    Amber.intervalEndInWindow = function (parts, startHHMM, endHHMM) {
        if (!parts || !startHHMM || !endHHMM) return false;
        const t = parts.timeValue;
        const start = parseInt(String(startHHMM).replace(':', ''), 10);
        const end = parseInt(String(endHHMM).replace(':', ''), 10);
        if (start < end) return t > start && t <= end;
        return t > start || t <= end;
    };

    Amber.resolveExportTariff = function (site, channel) {
        const code = (channel && channel.tariff) || '';
        if (Amber.EXPORT_TARIFFS[code]) return Amber.EXPORT_TARIFFS[code];
        const channels = (site && site.channels) || [];
        for (let i = 0; i < channels.length; i++) {
            const t = channels[i] && channels[i].tariff;
            if (t && Amber.EXPORT_TARIFFS[t] && (channels[i].type === 'feedIn' || !channel)) {
                return Amber.EXPORT_TARIFFS[t];
            }
        }
        if (site && Amber.canonicalNetwork(site.network) === 'ausgrid' && channel && channel.type === 'feedIn') {
            return Amber.EXPORT_TARIFFS.EA029;
        }
        return null;
    };

    Amber.settleAmberFeedIn = function (channel, site, numDays) {
        if (!channel || channel.type !== 'feedIn') return null;
        const tariff = Amber.resolveExportTariff(site, channel);
        if (!tariff) return null;
        const days = Number(numDays) || 0;
        const opts = { clock: tariff.clock || 'local', timeZone: tariff.timeZone || 'Australia/Sydney' };
        let intervalCost = 0;
        let middayKwh = 0;
        let rewardKwh = 0;
        (channel.usageData || []).forEach((item) => {
            const kwh = Amber.absKwh(item.kwh);
            const perKwh = parseFloat(item.perKwh) || 0;
            intervalCost += (perKwh / 100) * kwh;
            const parts = Amber.itemClockParts(item, opts);
            if (Amber.intervalEndInWindow(parts, tariff.middayStart, tariff.middayEnd)) {
                middayKwh += kwh;
            }
            if (tariff.rewardStart && Amber.intervalEndInWindow(parts, tariff.rewardStart, tariff.rewardEnd)) {
                rewardKwh += kwh;
            }
        });
        /*
         * Amber's feed-in prices already net the network export charge off every midday kWh
         * (ex GST; feed-in carries no GST) and add the evening reward. The bill instead charges
         * only midday exports above the basic export level (BEL), as usage with GST. So: add the
         * embedded charge back onto the credit for all midday kWh, and charge the kWh above BEL
         * on usage. Checked against an Amber bill: credit $6.70, export charge $0.26 ex GST.
         */
        const bel = (tariff.belKwhPerDay || 0) * days;
        const freeKwh = Math.min(middayKwh, bel);
        const chargedKwh = Math.max(0, middayKwh - bel);
        const exRate = tariff.chargeExGst != null ? tariff.chargeExGst : (tariff.chargeIncGst || 0) / 1.1;
        const rate = tariff.chargeIncGst != null ? tariff.chargeIncGst : exRate * 1.1;
        const addBack = middayKwh * exRate / 100;
        const charge = chargedKwh * rate / 100;
        return {
            cost: intervalCost - addBack,
            intervalCost,
            rewardKwh,
            middayKwh,
            freeKwh,
            chargedKwh,
            charge,
            addBack,
            chargeRate: rate
        };
    };

    Amber.applyAmberFeedInSettlement = function (channelTotals, site, numDays) {
        Object.keys(channelTotals || {}).forEach((id) => {
            const channel = channelTotals[id];
            if (channel.amberExportCharge) {
                channel.totalAmberCost -= channel.amberExportCharge;
                channel.amberExportCharge = 0;
                channel.amberExportChargeKwh = 0;
                channel.amberExportChargeRate = 0;
            }
        });
        Object.keys(channelTotals || {}).forEach((id) => {
            const channel = channelTotals[id];
            const settled = Amber.settleAmberFeedIn(channel, site, numDays);
            if (!settled) return;
            channel.totalAmberCost = settled.cost;
            channel.amberFeedInSettlement = settled;
            if (settled.charge > 0) {
                const general = Object.keys(channelTotals).map((key) => channelTotals[key])
                    .find((c) => c.type === 'general');
                if (general) {
                    general.totalAmberCost += settled.charge;
                    general.amberExportCharge = settled.charge;
                    general.amberExportChargeKwh = settled.chargedKwh;
                    general.amberExportChargeRate = settled.chargeRate;
                }
            }
        });
    };

    Amber.processUsageData = function (usageArray, channelTotalsObject, shouldCalculateTotals) {
        usageArray.forEach((item) => {
            if (!item.processedTime) {
                item.nemTime = Amber.adjustNemTime(item.nemTime);
                item.processedTime = true;
            }
            const channelId = item.channelIdentifier;
            if (!channelTotalsObject[channelId]) return;
            const channelData = channelTotalsObject[channelId];
            const kwh = Amber.absKwh(item.kwh);
            const perKwh = parseFloat(item.perKwh) || 0;
            if (shouldCalculateTotals) {
                channelData.totalKWh += kwh;
                channelData.totalAmberCost += (perKwh / 100) * kwh;
            }
            channelData.usageData.push(item);
        });
    };

    Amber.emptyChannel = function (channel) {
        return {
            identifier: channel.identifier,
            type: channel.type,
            tariff: channel.tariff,
            totalKWh: 0,
            totalAmberCost: 0,
            totalOtherCost: 0,
            usageData: []
        };
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
