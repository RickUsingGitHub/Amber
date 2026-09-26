(function (root) {
    const Amber = root.Amber = root.Amber || {};

    Amber.STATS_DEFAULTS = {
        spikeCents: 50
    };

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
