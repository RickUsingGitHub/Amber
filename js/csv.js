(function (root) {
    const Amber = root.Amber = root.Amber || {};

    /*
     * CSV downloads: every meter reading (a versioned file that the Amber CSV import on Start can
     * restore as a backup), one row per day, or the comparison table as shown.
     */

    Amber.downloadCSV = function (csvContent, fileName) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    Amber.fullIntervalCsv = function (cachedChannelData) {
        const quote = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
        const rows = ['NEM Time,NEM Day,Channel Type,Channel Identifier,Price,Usage,Cost,Duration,Quality,Renewables,Demand Window,Amber Compare CSV Version'];
        Object.values(cachedChannelData).forEach((channel) => {
            (channel.usageData || []).forEach((item) => {
                // processUsageData subtracts one second for bucketing. Export the original end.
                const end = item.processedTime
                    ? new Date(Date.parse(item.nemTime.substring(0, 19) + 'Z') + 1000).toISOString().substring(0, 19)
                    : item.nemTime.substring(0, 19);
                const kwh = Amber.absKwh(item.kwh);
                rows.push([end.replace('T', ' '), Amber.usageDateStr(item), channel.type, channel.identifier,
                    item.perKwh, kwh, item.cost != null ? item.cost : kwh * item.perKwh,
                    item.duration || 30, item.quality || 'billable', item.renewables,
                    !!(item.tariffInformation && item.tariffInformation.demandWindow), 1].map(quote).join(','));
            });
        });
        return rows.join('\n') + '\n';
    };

    Amber.generateFullIntervalCsv = function (cachedChannelData, startDate, endDate) {
        Amber.downloadCSV(Amber.fullIntervalCsv(cachedChannelData), `amber_full_interval_data_${startDate}_to_${endDate}.csv`);
    };

    Amber.generateDailySummariesCsv = function (dailySummaries, options) {
        const otherDailyConnection = (parseFloat(options.otherDailyCents) || 0) / 100;
        let csvContent = 'Date,Total Usage (kWh),Total Feed-in (kWh),Amber Usage Cost ($),Amber Demand Cost ($),Amber Fixed Cost ($),Amber Total ($),Other Usage Cost ($),Other Demand Cost ($),Other Fixed Cost ($),Other Total ($),Estimated Intervals,Billable Intervals,Avg Renewables %\n';
        const sortedDates = Object.keys(dailySummaries).sort();
        sortedDates.forEach((dateStr) => {
            const summary = dailySummaries[dateStr];
            if (!summary) return;
            const amberFixedDailyCost = Amber.amberFixedDaily(options.amberRates, dateStr);
            const totalAmberCost = summary.amberCost + (summary.amberDemandCost || 0) + amberFixedDailyCost;
            const totalOtherCost = summary.otherCost + (summary.otherDemandCost || 0) + otherDailyConnection;
            const avgRenew = summary.renewableKwh > 0 ? (summary.renewableWeighted / summary.renewableKwh) : '';
            csvContent += [
                dateStr,
                summary.totalInKwh.toFixed(3),
                summary.totalOutKwh.toFixed(3),
                summary.amberCost.toFixed(4),
                (summary.amberDemandCost || 0).toFixed(4),
                amberFixedDailyCost.toFixed(4),
                totalAmberCost.toFixed(4),
                summary.otherCost.toFixed(4),
                (summary.otherDemandCost || 0).toFixed(4),
                otherDailyConnection.toFixed(4),
                totalOtherCost.toFixed(4),
                summary.estimatedCount || 0,
                summary.billableCount || 0,
                avgRenew === '' ? '' : avgRenew.toFixed(1)
            ].join(',') + '\n';
        });
        Amber.downloadCSV(csvContent, `amber_daily_summaries_${options.startDate}_to_${options.endDate}.csv`);
    };

    Amber.generateResultsTableCsv = function (table, startDate, endDate) {
        const csv = [];
        table.querySelectorAll('tr').forEach((row) => {
            const rowData = [];
            row.querySelectorAll('td, th').forEach((col) => {
                const cell = col.cloneNode(true);
                cell.querySelectorAll('[data-compact-only], .help-btn, .help-bubble').forEach((el) => el.remove());
                // A line break between two parts of a cell (an amount and its rate) becomes a space.
                cell.querySelectorAll('div').forEach((el) => el.insertAdjacentText('beforebegin', ' '));
                rowData.push('"' + cell.textContent.replace(/\s+/g, ' ').trim().replace(/"/g, '""') + '"');
            });
            csv.push(rowData.join(','));
        });
        Amber.downloadCSV(csv.join('\n'), `amber_results_table_${startDate}_to_${endDate}.csv`);
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
