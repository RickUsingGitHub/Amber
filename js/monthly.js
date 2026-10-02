(function (root) {
    const Amber = root.Amber = root.Amber || {};

    function daysInMonth(monthKey) {
        const y = parseInt(monthKey.substring(0, 4), 10);
        const m = parseInt(monthKey.substring(5, 7), 10);
        return new Date(y, m, 0).getDate();
    }

    /**
     * Amber and competitor totals for [from, to] (inclusive usage dates), worked out the same
     * way as the Comparison Results table: feed-in settlement (incl. Ausgrid export charge),
     * monthly demand, daily connection and subscription for every day in the period.
     * All dollar values are GST-inclusive; feed-in is negative when it is a credit.
     *
     * opts: { site, planConfig, state, amberRates }
     */
    Amber.periodTotals = function (channelTotals, from, to, opts) {
        const o = opts || {};
        const rates = o.amberRates || {
            connectionCents: Amber.DEFAULT_AMBER_CONNECTION_CENTS,
            subscriptionCents: Amber.DEFAULT_AMBER_SUBSCRIPTION_CENTS,
            demandCents: Amber.DEFAULT_AMBER_DEMAND_CENTS
        };
        const days = Amber.inclusiveDayCount(from, to);
        const ct = {};
        const dataDays = new Set();
        Object.keys(channelTotals || {}).forEach((id) => {
            const src = channelTotals[id];
            ct[id] = Amber.emptyChannel(src);
            const items = (src.usageData || []).filter((item) => {
                const d = Amber.usageDateStr(item);
                return d >= from && d <= to;
            });
            items.forEach((item) => dataDays.add(Amber.usageDateStr(item)));
            Amber.processUsageData(items, ct, true);
        });
        Amber.applyAmberFeedInSettlement(ct, o.site, days);
        const demand = Amber.calculateDemandTariff(ct, rates.demandCents);

        const out = {
            from, to, days, dataDays: dataDays.size,
            generalKwh: 0, controlledKwh: 0, exportKwh: 0,
            amberUsage: 0, amberExportCharge: 0, amberFeedIn: 0,
            amberDemand: demand.cost || 0,
            demandKw: (demand.maxDemandKwh || 0) * 2,
            demandDays: demand.demandDays || 0,
            demandMonths: demand.months || null,
            amberConnection: (rates.connectionCents * days) / 100,
            amberSubscription: (rates.subscriptionCents * days) / 100,
            channels: ct
        };
        const timeZone = Amber.STATE_TIMEZONES[o.state] || 'Australia/Sydney';
        out.eveningExportKwh = 0;
        Object.values(ct).forEach((c) => {
            if (c.type === 'feedIn') {
                out.exportKwh += c.totalKWh;
                // Exports ending 4–9 pm local (Ausgrid EA029 export reward window).
                c.usageData.forEach((item) => {
                    const parts = Amber.itemClockParts(item, { clock: 'local', timeZone });
                    if (parts.hours >= 16 && parts.hours < 21) out.eveningExportKwh += Amber.absKwh(item.kwh);
                });
                out.amberFeedIn += c.totalAmberCost;
            } else {
                if (c.type === 'controlledLoad') out.controlledKwh += c.totalKWh; else out.generalKwh += c.totalKWh;
                out.amberUsage += c.totalAmberCost; // includes any export charge booked on general
                out.amberExportCharge += c.amberExportCharge || 0;
            }
        });
        out.importKwh = out.generalKwh + out.controlledKwh;
        out.amberCharges = out.amberUsage + out.amberDemand + out.amberConnection + out.amberSubscription;
        out.amberTotal = out.amberCharges + out.amberFeedIn;

        if (o.planConfig) {
            const plan = Amber.computePlanTotals(ct, o.planConfig, {
                startDateStr: from, endDateStr: to, numDays: days, state: o.state, gstInclusive: true, amberRates: rates
            });
            out.otherTotal = plan.otherTotal;
            out.otherTotalExGst = Amber.computePlanTotals(ct, o.planConfig, {
                startDateStr: from, endDateStr: to, numDays: days, state: o.state, gstInclusive: false, amberRates: rates
            }).otherTotal;
        }
        return out;
    };

    /** Calendar months (YYYY-MM), oldest first, in which every day is one of dateStrs. */
    Amber.fullMonths = function (dateStrs) {
        const counts = {};
        new Set(dateStrs).forEach((d) => {
            const month = String(d).substring(0, 7);
            counts[month] = (counts[month] || 0) + 1;
        });
        return Object.keys(counts).filter((m) => counts[m] === daysInMonth(m)).sort();
    };

    /** One row per whole calendar month in months (YYYY-MM), plus a total row. */
    Amber.monthlyBreakdown = function (channelTotals, months, opts) {
        // Split the data by month once, so each month only scans its own intervals.
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
        const rows = months.map((month) => {
            const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
            const t = Amber.periodTotals(byMonth[month], `${month}-01`, monthEnd, opts);
            t.month = month;
            return t;
        });
        const sumKeys = ['days', 'dataDays', 'generalKwh', 'controlledKwh', 'exportKwh', 'importKwh', 'amberUsage', 'amberExportCharge',
            'amberFeedIn', 'amberDemand', 'amberConnection', 'amberSubscription', 'amberCharges', 'amberTotal', 'otherTotal', 'otherTotalExGst'];
        const total = { month: 'Total' };
        sumKeys.forEach((k) => {
            total[k] = rows.reduce((s, r) => s + (r[k] || 0), 0);
        });
        return { rows, total };
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
