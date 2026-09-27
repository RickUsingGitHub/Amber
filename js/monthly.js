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
                    const parts = Amber.getClockParts(item.nemTime, { clock: 'local', timeZone });
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

    /** Per-calendar-month rows (clipped to [startDateStr, endDateStr]) plus a total row. */
    Amber.monthlyBreakdown = function (channelTotals, startDateStr, endDateStr, opts) {
        const rows = [];
        let month = startDateStr.substring(0, 7);
        const lastMonth = endDateStr.substring(0, 7);
        while (month <= lastMonth) {
            const monthStart = `${month}-01`;
            const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
            const from = startDateStr > monthStart ? startDateStr : monthStart;
            const to = endDateStr < monthEnd ? endDateStr : monthEnd;
            const t = Amber.periodTotals(channelTotals, from, to, opts);
            t.month = month;
            t.partial = t.days < daysInMonth(month);
            rows.push(t);
            const y = parseInt(month.substring(0, 4), 10);
            const m = parseInt(month.substring(5, 7), 10);
            month = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
        }
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
