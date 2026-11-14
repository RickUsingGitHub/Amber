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

    Amber.formatShareSummaryText = function (summary) {
        if (!summary) return '';
        const s = summary;
        const days = s.numDays || Amber.inclusiveDayCount(s.startDate, s.endDate) || 1;
        const plan = s.planName || 'Comparison plan';
        const inKwh = (Number(s.importKwh) || 0).toFixed(1);
        const outKwh = (Number(s.exportKwh) || 0).toFixed(1);
        const amberStr = Amber.money(s.amberTotal || 0);
        const otherStr = Amber.money(s.otherTotal || 0);
        const diff = (Number(s.otherTotal) || 0) - (Number(s.amberTotal) || 0);
        let verdict = 'Amber and ' + plan + ' cost about the same.';
        if (diff > 0.005) {
            const pct = s.otherTotal > 0 ? ` (${((diff / s.otherTotal) * 100).toFixed(1)}%)` : '';
            verdict = `Amber was ${Amber.money(diff)}${pct} cheaper than ${plan}.`;
        } else if (diff < -0.005) {
            verdict = `${plan} was ${Amber.money(Math.abs(diff))} cheaper than Amber.`;
        }
        return [
            `Amber Compare (${s.startDate} to ${s.endDate}, ${days} days)`,
            `Power bought: ${inKwh} kWh | Solar sent out: ${outKwh} kWh`,
            `Amber: ${amberStr} | ${plan}: ${otherStr}`,
            `Result: ${verdict}`
        ].join('\n');
    };

    Amber.generateSummaryCardPng = function (summary) {
        if (!summary || typeof document === 'undefined') return;
        const canvas = document.createElement('canvas');
        canvas.width = 720;
        canvas.height = 360;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const days = summary.numDays || Amber.inclusiveDayCount(summary.startDate, summary.endDate) || 1;
        const plan = summary.planName || 'Comparison plan';
        const diff = (Number(summary.otherTotal) || 0) - (Number(summary.amberTotal) || 0);

        ctx.fillStyle = '#f9fafb';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#4f46e5';
        ctx.fillRect(0, 0, canvas.width, 68);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText('Amber Compare — Cost Summary', 28, 36);
        ctx.font = '14px sans-serif';
        ctx.fillStyle = '#e0e7ff';
        ctx.fillText(`${summary.startDate} to ${summary.endDate} (${days} days)`, 28, 56);

        const drawBox = (x, y, w, h, bg, border) => {
            ctx.fillStyle = bg;
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = border;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, h);
        };

        drawBox(28, 88, 320, 110, '#ffffff', '#e5e7eb');
        ctx.fillStyle = '#6b7280';
        ctx.font = '13px sans-serif';
        ctx.fillText('AMBER TOTAL', 44, 114);
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 30px sans-serif';
        ctx.fillText(Amber.money(summary.amberTotal || 0), 44, 152);
        ctx.fillStyle = '#4b5563';
        ctx.font = '13px sans-serif';
        ctx.fillText(`Bought: ${(Number(summary.importKwh) || 0).toFixed(1)} kWh`, 44, 182);

        drawBox(372, 88, 320, 110, '#ffffff', '#e5e7eb');
        ctx.fillStyle = '#6b7280';
        ctx.font = '13px sans-serif';
        ctx.fillText(plan.slice(0, 34).toUpperCase(), 388, 114);
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 30px sans-serif';
        ctx.fillText(Amber.money(summary.otherTotal || 0), 388, 152);
        ctx.fillStyle = '#4b5563';
        ctx.font = '13px sans-serif';
        ctx.fillText(`Solar exported: ${(Number(summary.exportKwh) || 0).toFixed(1)} kWh`, 388, 182);

        const amberCheaper = diff >= 0;
        drawBox(28, 218, 664, 78, amberCheaper ? '#dcfce7' : '#fee2e2', amberCheaper ? '#86efac' : '#fca5a5');
        ctx.fillStyle = amberCheaper ? '#166534' : '#991b1b';
        ctx.font = 'bold 20px sans-serif';
        let verdict = 'Amber and this plan cost about the same.';
        if (diff > 0.005) {
            const pct = summary.otherTotal > 0 ? ` (${((diff / summary.otherTotal) * 100).toFixed(1)}%)` : '';
            verdict = `Amber was ${Amber.money(diff)}${pct} cheaper than ${plan}`;
        } else if (diff < -0.005) {
            verdict = `${plan} was ${Amber.money(Math.abs(diff))} cheaper than Amber`;
        }
        ctx.fillText(verdict.slice(0, 62), 44, 264);

        ctx.fillStyle = '#6b7280';
        ctx.font = '12px sans-serif';
        ctx.fillText('Generated in-browser by Amber Compare • Privacy-safe (no NMI or account IDs)', 28, 332);

        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.setAttribute('href', dataUrl);
        link.setAttribute('download', `amber_summary_${summary.startDate}_to_${summary.endDate}.png`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
