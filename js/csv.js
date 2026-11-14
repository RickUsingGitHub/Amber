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
        const width = 760;
        const height = 450;
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(scale, scale);

        const font = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        const days = Math.max(1, summary.numDays || Amber.inclusiveDayCount(summary.startDate, summary.endDate) || 1);
        const plan = summary.planName || 'Comparison plan';
        const amberTotal = Number(summary.amberTotal) || 0;
        const otherTotal = Number(summary.otherTotal) || 0;
        const importKwh = Number(summary.importKwh) || 0;
        const exportKwh = Number(summary.exportKwh) || 0;
        const diff = otherTotal - amberTotal;
        const fmtKwh = (v) => v.toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        const startText = Amber.formatDate ? Amber.formatDate(summary.startDate) : summary.startDate;
        const endText = Amber.formatDate ? Amber.formatDate(summary.endDate) : summary.endDate;

        const roundBox = (x, y, w, h, r, bg, border, lineW) => {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
            if (bg) {
                ctx.fillStyle = bg;
                ctx.fill();
            }
            if (border) {
                ctx.strokeStyle = border;
                ctx.lineWidth = lineW || 1;
                ctx.stroke();
            }
        };

        const fitText = (text, maxW) => {
            if (ctx.measureText(text).width <= maxW) return text;
            let s = text;
            while (s.length > 4 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
            return s + '…';
        };

        // Background
        ctx.fillStyle = '#f3f4f6';
        ctx.fillRect(0, 0, width, height);

        // Header banner
        ctx.fillStyle = '#4f46e5';
        ctx.fillRect(0, 0, width, 74);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 22px ${font}`;
        ctx.fillText('Amber Compare & Export', 28, 34);
        ctx.fillStyle = '#e0e7ff';
        ctx.font = `14px ${font}`;
        ctx.fillText(`${startText} to ${endText} · ${days} day${days === 1 ? '' : 's'}`, 28, 56);

        // Section 1: Household usage (shared across both plans)
        roundBox(28, 92, 704, 86, 10, '#ffffff', '#e5e7eb', 1);
        ctx.fillStyle = '#6b7280';
        ctx.font = `bold 11px ${font}`;
        ctx.fillText('HOUSEHOLD METER READINGS (SAME USAGE PRICED ON BOTH PLANS)', 46, 114);

        // Divider between bought and exported
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(380, 124);
        ctx.lineTo(380, 166);
        ctx.stroke();

        ctx.fillStyle = '#2563eb';
        ctx.font = `bold 20px ${font}`;
        ctx.fillText(`↓ ${fmtKwh(importKwh)} kWh`, 46, 145);
        ctx.fillStyle = '#4b5563';
        ctx.font = `13px ${font}`;
        ctx.fillText(`Power bought from grid (${fmtKwh(importKwh / days)} kWh/day)`, 46, 165);

        ctx.fillStyle = '#16a34a';
        ctx.font = `bold 20px ${font}`;
        ctx.fillText(`↑ ${fmtKwh(exportKwh)} kWh`, 400, 145);
        ctx.fillStyle = '#4b5563';
        ctx.font = `13px ${font}`;
        ctx.fillText(`Solar sent out to grid (${fmtKwh(exportKwh / days)} kWh/day)`, 400, 165);

        // Section 2: Plan cost cards (side-by-side, comparing like with like)
        const amberWins = diff > 0.005;
        const otherWins = diff < -0.005;

        roundBox(28, 194, 342, 118, 10, '#ffffff', amberWins ? '#22c55e' : '#e5e7eb', amberWins ? 2 : 1);
        ctx.fillStyle = '#6b7280';
        ctx.font = `bold 12px ${font}`;
        ctx.fillText('AMBER ELECTRIC', 46, 220);
        if (amberWins) {
            roundBox(278, 206, 76, 20, 10, '#dcfce7', null);
            ctx.fillStyle = '#166534';
            ctx.font = `bold 11px ${font}`;
            ctx.fillText('CHEAPER', 290, 220);
        }
        ctx.fillStyle = '#111827';
        ctx.font = `bold 34px ${font}`;
        ctx.fillText(Amber.money(amberTotal), 46, 264);
        ctx.fillStyle = '#4b5563';
        ctx.font = `13px ${font}`;
        ctx.fillText(`Average ${Amber.money(amberTotal / days)} / day (incl. supply & fees)`, 46, 292);

        roundBox(390, 194, 342, 118, 10, '#ffffff', otherWins ? '#22c55e' : '#e5e7eb', otherWins ? 2 : 1);
        ctx.fillStyle = '#6b7280';
        ctx.font = `bold 12px ${font}`;
        ctx.fillText(fitText(plan.toUpperCase(), otherWins ? 235 : 306), 408, 220);
        if (otherWins) {
            roundBox(640, 206, 76, 20, 10, '#dcfce7', null);
            ctx.fillStyle = '#166534';
            ctx.font = `bold 11px ${font}`;
            ctx.fillText('CHEAPER', 652, 220);
        }
        ctx.fillStyle = '#111827';
        ctx.font = `bold 34px ${font}`;
        ctx.fillText(Amber.money(otherTotal), 408, 264);
        ctx.fillStyle = '#4b5563';
        ctx.font = `13px ${font}`;
        ctx.fillText(`Average ${Amber.money(otherTotal / days)} / day (incl. supply & fees)`, 408, 292);

        // Section 3: Verdict banner
        const bannerBg = amberWins ? '#dcfce7' : (otherWins ? '#fee2e2' : '#f3f4f6');
        const bannerBorder = amberWins ? '#86efac' : (otherWins ? '#fca5a5' : '#d1d5db');
        const bannerText = amberWins ? '#166534' : (otherWins ? '#991b1b' : '#374151');
        roundBox(28, 328, 704, 76, 10, bannerBg, bannerBorder, 1.5);

        ctx.fillStyle = bannerText;
        ctx.font = `bold 19px ${font}`;
        let verdict = 'Amber and this plan cost about the same for these dates.';
        let subVerdict = 'Less than 1 cent difference over the period.';
        if (amberWins) {
            const pct = otherTotal > 0 ? ` (${((diff / otherTotal) * 100).toFixed(1)}%)` : '';
            verdict = `Amber was ${Amber.money(diff)}${pct} cheaper than ${plan}`;
            subVerdict = `Saved ${Amber.money(diff / days)}/day · about ${Amber.money((diff / days) * 365)}/year at this rate`;
        } else if (otherWins) {
            const absDiff = Math.abs(diff);
            verdict = `${plan} would have been ${Amber.money(absDiff)} cheaper than Amber`;
            subVerdict = `${Amber.money(absDiff / days)}/day less · about ${Amber.money((absDiff / days) * 365)}/year at this rate`;
        }
        ctx.fillText(fitText(verdict, 668), 46, 360);
        ctx.font = `13px ${font}`;
        ctx.fillText(subVerdict, 46, 386);

        // Footer
        ctx.fillStyle = '#6b7280';
        ctx.font = `12px ${font}`;
        ctx.fillText('Generated in-browser by Amber Compare • Privacy-safe (no NMI or account IDs)', 28, 430);

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
