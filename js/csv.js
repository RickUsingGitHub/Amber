(function (root) {
    const Amber = root.Amber = root.Amber || {};

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

    Amber.generateFullIntervalCsv = function (cachedChannelData, startDate, endDate) {
        let csvContent = 'nemTime,channelIdentifier,channelType,kWh,SpotPrice_cents_per_kWh,quality,renewables\n';
        Object.values(cachedChannelData).forEach((channel) => {
            if (!channel.usageData || !channel.usageData.length) return;
            channel.usageData.forEach((item) => {
                const nemTime = item.nemTime ? Amber.formatNemForCsv(item.nemTime) : '';
                const kwh = item.kwh != null ? Amber.absKwh(item.kwh) : '';
                const perKwh = item.perKwh != null ? item.perKwh : '';
                const quality = item.quality || '';
                const renewables = item.renewables != null ? item.renewables : '';
                csvContent += `"${nemTime}",${channel.identifier},${channel.type},${kwh},${perKwh},${quality},${renewables}\n`;
            });
        });
        Amber.downloadCSV(csvContent, `amber_full_interval_data_${startDate}_to_${endDate}.csv`);
    };

    Amber.generateDailySummariesCsv = function (dailySummaries, options) {
        const amberFixedDailyCost = Amber.amberFixedDaily(options.amberRates);
        const otherDailyConnection = (parseFloat(options.otherDailyCents) || 0) / 100;
        let csvContent = 'Date,Total Usage (kWh),Total Feed-in (kWh),Amber Usage Cost ($),Amber Demand Cost ($),Amber Fixed Cost ($),Amber Total ($),Other Usage Cost ($),Other Demand Cost ($),Other Fixed Cost ($),Other Total ($),Estimated Intervals,Billable Intervals,Avg Renewables %\n';
        const sortedDates = Object.keys(dailySummaries).sort();
        sortedDates.forEach((dateStr) => {
            const summary = dailySummaries[dateStr];
            if (!summary) return;
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
                rowData.push('"' + col.innerText.replace(/\s+/g, ' ').trim().replace(/"/g, '""') + '"');
            });
            csv.push(rowData.join(','));
        });
        Amber.downloadCSV(csv.join('\n'), `amber_results_table_${startDate}_to_${endDate}.csv`);
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
