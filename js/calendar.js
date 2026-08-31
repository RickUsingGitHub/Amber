(function (root) {
    const Amber = root.Amber = root.Amber || {};

    Amber.hideTooltip = function () {
        const tooltip = document.getElementById('day-tooltip');
        if (tooltip) tooltip.remove();
    };

    Amber.positionTooltip = function (tooltip, cell) {
        document.body.appendChild(tooltip);
        const cellRect = cell.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        let top = cellRect.top + window.scrollY - (tooltipRect.height / 2) + (cellRect.height / 2);
        let left = cellRect.right + window.scrollX + 10;
        if (left + tooltipRect.width > window.innerWidth) {
            left = cellRect.left + window.scrollX - tooltipRect.width - 10;
        }
        if (top < window.scrollY) top = window.scrollY + 10;
        if (top + tooltipRect.height > window.scrollY + window.innerHeight) {
            top = window.scrollY + window.innerHeight - tooltipRect.height - 10;
        }
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    };

    Amber.showAmberDemandTooltip = function (element, cost, monthName) {
        Amber.hideTooltip();
        const tooltip = document.createElement('div');
        tooltip.id = 'day-tooltip';
        tooltip.className = 'absolute bg-white rounded-lg shadow-xl p-4 border border-gray-200 z-10 w-auto text-sm text-gray-800';
        tooltip.innerHTML = `
            <div class="font-bold mb-1">Estimated Monthly Tariff</div>
            <div>Expected total for <span class="font-semibold">${Amber.escapeHTML(monthName)}</span>:</div>
            <div class="text-lg font-bold text-blue-600 mt-1">$${cost.toFixed(2)}</div>
            <div class="text-xs text-gray-500 mt-2 max-w-[200px]">
                Based on the max demand occurring in this month applied to all days in the month.
            </div>
        `;
        Amber.positionTooltip(tooltip, element);
    };

    function channelRowsHtml(channels) {
        let html = '';
        Object.entries(channels).forEach(([id, data]) => {
            if (Math.abs(data.amberCost) > 0.001 || Math.abs(data.otherCost) > 0.001 || Math.abs(data.kwh) > 0.01) {
                html += `<tr>
                    <td class="px-2 py-1 whitespace-nowrap">${Amber.escapeHTML(id)} (${Amber.escapeHTML(data.type)})</td>
                    <td class="px-2 py-1 text-right">${data.kwh.toFixed(1)} kWh</td>
                    <td class="px-2 py-1 text-right">$${data.amberCost.toFixed(2)}</td>
                    <td class="px-2 py-1 text-right">$${data.otherCost.toFixed(2)}</td>
                </tr>`;
            }
        });
        return html;
    }

    Amber.showDayTooltip = function (cell, context) {
        Amber.hideTooltip();
        const dateStr = cell.dataset.date;
        const monthKey = dateStr.substring(0, 7);
        const summary = context.dailySummaries[dateStr];
        const tooltip = document.createElement('div');
        tooltip.id = 'day-tooltip';
        tooltip.className = 'absolute bg-white rounded-lg shadow-xl p-4 border border-gray-200 z-10 w-auto';

        if (!summary) {
            tooltip.innerHTML = `<h3 class="text-base font-bold text-gray-800 mb-2">Summary for ${dateStr}</h3><p class="text-xs text-red-500">Could not load summary data.</p>`;
            Amber.positionTooltip(tooltip, cell);
            return;
        }

        const monthDemandInfo = context.demandInfoForTooltip ? context.demandInfoForTooltip[monthKey] : null;
        const planName = context.planName;
        const otherDaily = (parseFloat(context.otherDailyCents) || 0) / 100;
        const amberDaily = Amber.amberFixedDaily(context.amberRates);
        const amberDemandCost = summary.amberDemandCost || 0;
        const otherDemandCost = summary.otherDemandCost || 0;
        const totalAmberCharges = summary.amberCost + amberDemandCost + amberDaily;
        const totalOtherCharges = summary.otherCost + otherDemandCost + otherDaily;
        const estimatedNote = summary.estimatedCount > 0
            ? `<p class="text-xs text-amber-700 mb-2">${summary.estimatedCount} estimated interval(s) — not yet billable.</p>`
            : '';
        const renewNote = summary.renewableKwh > 0
            ? `<p class="text-xs text-gray-500 mb-2">Grid renewables (weighted): ${(summary.renewableWeighted / summary.renewableKwh).toFixed(0)}%</p>`
            : '';

        let contentHtml = `<h3 class="text-base font-bold text-gray-800 mb-2">Summary for ${dateStr}</h3>${estimatedNote}${renewNote}`;
        contentHtml += `<table class="min-w-full text-xs">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-2 py-1 text-left font-medium text-gray-500">Channel</th>
                    <th class="px-2 py-1 text-right font-medium text-gray-500">Usage</th>
                    <th class="px-2 py-1 text-right font-medium text-gray-500">Amber</th>
                    <th class="px-2 py-1 text-right font-medium text-gray-500">${Amber.escapeHTML(planName)}</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">`;
        contentHtml += channelRowsHtml(summary.channels);
        contentHtml += `<tr class="border-t"></tr>`;

        let hasDemandRow = false;
        if (monthDemandInfo && monthDemandInfo.amber && monthDemandInfo.amber.cost > 0 && amberDemandCost > 0) {
            const maxDemandKw = (monthDemandInfo.amber.maxDemandKwh * 2).toFixed(2);
            contentHtml += `<tr>
                <td class="px-2 py-1 text-sm" colspan="2">Amber Demand Tariff <span class="font-normal text-gray-500 text-[10px]">(${maxDemandKw}kW peak)</span></td>
                <td class="px-2 py-1 text-right font-semibold">$${amberDemandCost.toFixed(2)}</td>
                <td class="px-2 py-1 text-right"></td>
            </tr>`;
            hasDemandRow = true;
        }
        if (monthDemandInfo && monthDemandInfo.other && monthDemandInfo.other.cost > 0 && otherDemandCost > 0) {
            const maxDemandKw = (monthDemandInfo.other.maxDemandKwh * 2).toFixed(2);
            contentHtml += `<tr>
                <td class="px-2 py-1 text-sm" colspan="2">${Amber.escapeHTML(planName)} Demand Tariff <span class="font-normal text-gray-500 text-[10px]">(${maxDemandKw}kW peak)</span></td>
                <td class="px-2 py-1 text-right"></td>
                <td class="px-2 py-1 text-right font-semibold">$${otherDemandCost.toFixed(2)}</td>
            </tr>`;
            hasDemandRow = true;
        }
        contentHtml += `<tr class="${hasDemandRow ? '' : 'border-t'}">
            <td class="px-2 py-1 font-semibold" colspan="2">Daily Charges</td>
            <td class="px-2 py-1 text-right font-semibold">$${amberDaily.toFixed(2)}</td>
            <td class="px-2 py-1 text-right font-semibold">$${otherDaily.toFixed(2)}</td>
        </tr>
        <tr class="bg-gray-50 font-bold">
            <td class="px-2 py-1" colspan="2">Total</td>
            <td class="px-2 py-1 text-right">$${totalAmberCharges.toFixed(2)}</td>
            <td class="px-2 py-1 text-right">$${totalOtherCharges.toFixed(2)}</td>
        </tr></tbody></table>
        <p class="text-xs text-gray-500 mt-2">Click to open this day on the graph.</p>`;

        tooltip.innerHTML = contentHtml;
        Amber.positionTooltip(tooltip, cell);
    };

    Amber.showMonthTooltip = function (element, context) {
        Amber.hideTooltip();
        const monthKey = element.dataset.monthKey;
        const monthlySummary = {
            totalInKwh: 0, totalOutKwh: 0, amberCost: 0, otherCost: 0,
            amberDemandCost: 0, otherDemandCost: 0, channels: {}, daysInMonth: 0,
            estimatedCount: 0
        };
        Object.keys(context.dailySummaries).filter((d) => d.startsWith(monthKey)).forEach((dateStr) => {
            const summary = context.dailySummaries[dateStr];
            if (!summary) return;
            monthlySummary.daysInMonth++;
            monthlySummary.totalInKwh += summary.totalInKwh;
            monthlySummary.totalOutKwh += summary.totalOutKwh;
            monthlySummary.amberCost += summary.amberCost;
            monthlySummary.otherCost += summary.otherCost;
            monthlySummary.amberDemandCost += summary.amberDemandCost || 0;
            monthlySummary.otherDemandCost += summary.otherDemandCost || 0;
            monthlySummary.estimatedCount += summary.estimatedCount || 0;
            Object.entries(summary.channels).forEach(([id, data]) => {
                if (!monthlySummary.channels[id]) {
                    monthlySummary.channels[id] = { type: data.type, kwh: 0, amberCost: 0, otherCost: 0 };
                }
                monthlySummary.channels[id].kwh += data.kwh;
                monthlySummary.channels[id].amberCost += data.amberCost;
                monthlySummary.channels[id].otherCost += data.otherCost;
            });
        });
        if (monthlySummary.daysInMonth === 0) return;

        const tooltip = document.createElement('div');
        tooltip.id = 'day-tooltip';
        tooltip.className = 'absolute bg-white rounded-lg shadow-xl p-4 border border-gray-200 z-10 w-auto';
        const monthDate = new Date(monthKey + '-02T00:00:00');
        const monthName = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });
        const planName = context.planName;
        const otherDaily = ((parseFloat(context.otherDailyCents) || 0) / 100) * monthlySummary.daysInMonth;
        const amberDaily = Amber.amberFixedDaily(context.amberRates) * monthlySummary.daysInMonth;
        const monthDemandInfo = context.demandInfoForTooltip ? context.demandInfoForTooltip[monthKey] : null;
        const totalAmberCharges = monthlySummary.amberCost + monthlySummary.amberDemandCost + amberDaily;
        const totalOtherCharges = monthlySummary.otherCost + monthlySummary.otherDemandCost + otherDaily;

        let contentHtml = `<h3 class="text-base font-bold text-gray-800 mb-2">Summary for ${monthName}</h3>`;
        contentHtml += `<table class="min-w-full text-xs">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-2 py-1 text-left font-medium text-gray-500">Channel</th>
                    <th class="px-2 py-1 text-right font-medium text-gray-500">Usage</th>
                    <th class="px-2 py-1 text-right font-medium text-gray-500">Amber</th>
                    <th class="px-2 py-1 text-right font-medium text-gray-500">${Amber.escapeHTML(planName)}</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">`;
        contentHtml += channelRowsHtml(monthlySummary.channels);
        contentHtml += `<tr class="border-t"></tr>`;
        let hasDemandRow = false;
        if (monthDemandInfo && monthDemandInfo.amber && monthDemandInfo.amber.cost > 0) {
            const maxDemandKw = (monthDemandInfo.amber.maxDemandKwh * 2).toFixed(2);
            contentHtml += `<tr>
                <td class="px-2 py-1 text-sm" colspan="2">Amber Demand Tariff <span class="font-normal text-gray-500 text-[10px]">(${maxDemandKw}kW peak)</span></td>
                <td class="px-2 py-1 text-right font-semibold">$${monthlySummary.amberDemandCost.toFixed(2)}</td>
                <td class="px-2 py-1 text-right"></td>
            </tr>`;
            hasDemandRow = true;
        }
        if (monthDemandInfo && monthDemandInfo.other && monthDemandInfo.other.cost > 0) {
            const maxDemandKw = (monthDemandInfo.other.maxDemandKwh * 2).toFixed(2);
            contentHtml += `<tr>
                <td class="px-2 py-1 text-sm" colspan="2">${Amber.escapeHTML(planName)} Demand Tariff <span class="font-normal text-gray-500 text-[10px]">(${maxDemandKw}kW peak)</span></td>
                <td class="px-2 py-1 text-right"></td>
                <td class="px-2 py-1 text-right font-semibold">$${monthlySummary.otherDemandCost.toFixed(2)}</td>
            </tr>`;
            hasDemandRow = true;
        }
        contentHtml += `<tr class="${hasDemandRow ? '' : 'border-t'}">
            <td class="px-2 py-1 font-semibold" colspan="2">Daily Charges (${monthlySummary.daysInMonth} days)</td>
            <td class="px-2 py-1 text-right font-semibold">$${amberDaily.toFixed(2)}</td>
            <td class="px-2 py-1 text-right font-semibold">$${otherDaily.toFixed(2)}</td>
        </tr>
        <tr class="bg-gray-50 font-bold">
            <td class="px-2 py-1" colspan="2">Total</td>
            <td class="px-2 py-1 text-right">$${totalAmberCharges.toFixed(2)}</td>
            <td class="px-2 py-1 text-right">$${totalOtherCharges.toFixed(2)}</td>
        </tr></tbody></table>`;
        tooltip.innerHTML = contentHtml;
        Amber.positionTooltip(tooltip, element);
    };

    Amber.displayCalendar = function (container, context) {
        container.innerHTML = '';
        container.className = 'relative space-y-6 max-h-[80vh] overflow-y-auto pr-2';
        const availableDateSet = new Set(Object.keys(context.dailySummaries));
        const selectedDateSet = new Set();
        if (context.startDate && context.endDate) {
            let d = new Date(context.startDate + 'T00:00:00');
            const endD = new Date(context.endDate + 'T00:00:00');
            while (d <= endD) {
                selectedDateSet.add(Amber.formatForInput(d));
                d.setDate(d.getDate() + 1);
            }
        }
        const allDates = [...availableDateSet].sort();
        if (allDates.length === 0) {
            if (context.siteId) container.innerHTML = '<p class="text-center text-gray-500">No data available to display.</p>';
            return;
        }

        const start = new Date(allDates[0] + 'T00:00:00');
        const end = new Date(allDates[allDates.length - 1] + 'T00:00:00');
        const allMonthlyTotals = {};
        Object.keys(context.dailySummaries).forEach((dateStr) => {
            const summary = context.dailySummaries[dateStr];
            if (!summary) return;
            const monthKey = dateStr.substring(0, 7);
            if (!allMonthlyTotals[monthKey]) allMonthlyTotals[monthKey] = { amber: 0, other: 0, inKwh: 0, outKwh: 0 };
            const totalAmberCost = summary.amberCost + (summary.amberDemandCost || 0) + Amber.amberFixedDaily(context.amberRates);
            const totalOtherCharges = summary.otherCost + (summary.otherDemandCost || 0) + ((parseFloat(context.otherDailyCents) || 0) / 100);
            allMonthlyTotals[monthKey].amber += totalAmberCost;
            allMonthlyTotals[monthKey].other += totalOtherCharges;
            allMonthlyTotals[monthKey].inKwh += summary.totalInKwh;
            allMonthlyTotals[monthKey].outKwh += summary.totalOutKwh;
        });

        let date = new Date(start.getFullYear(), start.getMonth(), 1);
        const lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0);
        let currentMonth = -1;
        let monthGrid;

        while (date <= lastDay) {
            const month = date.getMonth();
            const year = date.getFullYear();
            if (month !== currentMonth) {
                currentMonth = month;
                const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });
                const monthKey = `${year}-${(month + 1).toString().padStart(2, '0')}`;
                let summaryHtml = '';
                if (allMonthlyTotals[monthKey]) {
                    const totals = allMonthlyTotals[monthKey];
                    const savings = totals.other - totals.amber;
                    const savingsColor = savings > 0 ? 'text-green-700' : 'text-red-700';
                    summaryHtml = `
                        <div class="text-sm font-normal text-gray-600 flex items-center space-x-4 flex-wrap">
                            <span>
                              <span class="text-blue-600">↓${totals.inKwh.toFixed(1)}</span><span class="text-gray-400">/</span><span class="text-green-700">↑${totals.outKwh.toFixed(1)}</span>
                            </span>
                            <span><strong>Amber:</strong> $${totals.amber.toFixed(2)}</span>
                            <span><strong>Other:</strong> $${totals.other.toFixed(2)}</span>
                            <span class="${savingsColor}"><strong>Saving:</strong> $${savings.toFixed(2)}</span>
                        </div>`;
                }
                const monthContainer = document.createElement('div');
                monthContainer.innerHTML = `
                    <div class="flex justify-between items-center mb-2 flex-wrap">
                        <h3 class="text-lg font-bold text-gray-800 mr-4 cursor-pointer hover:underline" data-month-key="${monthKey}">${monthName}</h3>
                        ${summaryHtml}
                    </div>
                    <div class="grid grid-cols-7 gap-2 text-center font-semibold mb-1 text-sm text-gray-500">
                        <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>
                    </div>
                `;
                monthGrid = document.createElement('div');
                monthGrid.className = 'grid grid-cols-7 gap-2';
                monthContainer.appendChild(monthGrid);
                container.appendChild(monthContainer);
                const monthHeader = monthContainer.querySelector('h3');
                monthHeader.addEventListener('mouseenter', (e) => Amber.showMonthTooltip(e.currentTarget, context));
                monthHeader.addEventListener('mouseleave', Amber.hideTooltip);

                const firstDayOfMonth = new Date(year, month, 1);
                const startingDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;
                for (let i = 0; i < startingDayOfWeek; i++) {
                    monthGrid.insertAdjacentHTML('beforeend', '<div class="bg-gray-50 rounded-md"></div>');
                }
            }

            const dateStr = Amber.formatForInput(date);
            const day = date.getDate();
            let dayHtml;
            if (availableDateSet.has(dateStr)) {
                const summary = context.dailySummaries[dateStr];
                const isSelected = selectedDateSet.has(dateStr);
                const borderClass = isSelected ? 'border-4 border-indigo-500' : 'border border-gray-200';
                const estimatedClass = summary && summary.estimatedCount > 0 ? ' ring-1 ring-amber-400' : '';
                if (summary && (summary.totalInKwh > 0 || summary.totalOutKwh > 0)) {
                    const totalAmberCost = summary.amberCost + (summary.amberDemandCost || 0) + Amber.amberFixedDaily(context.amberRates);
                    const costColor = totalAmberCost > 0 ? 'text-red-600' : 'text-green-600';
                    dayHtml = `
                        <div class="calendar-day has-data ${borderClass}${estimatedClass} rounded-md p-2 flex flex-col hover:bg-indigo-50 shadow-sm" data-date="${dateStr}" role="button" tabindex="0" aria-label="Open ${dateStr} on the daily graph">
                            <div class="font-bold text-gray-800">${day}${summary.estimatedCount > 0 ? '<span class="ml-1 text-[10px] text-amber-700">est</span>' : ''}</div>
                            <div class="text-xs mt-1 whitespace-nowrap">
                                <span class="text-blue-600">↓${summary.totalInKwh.toFixed(1)}</span><span class="text-gray-400">/</span><span class="text-green-700">↑${summary.totalOutKwh.toFixed(1)}</span>
                            </div>
                            <div class="text-sm mt-auto font-semibold ${costColor}">$${totalAmberCost.toFixed(2)}</div>
                        </div>`;
                } else {
                    dayHtml = `<div class="calendar-day has-data ${borderClass} bg-gray-50 rounded-md p-2 flex flex-col justify-center items-center" data-date="${dateStr}" role="button" tabindex="0" aria-label="Open ${dateStr} on the daily graph"><div class="font-bold text-gray-800">${day}</div><div class="text-xs mt-1 text-center text-gray-500 leading-tight">No Usage</div></div>`;
                }
            } else {
                dayHtml = `<div class="bg-gray-100 border border-gray-200 rounded-md p-2 flex items-center justify-center"><span class="text-gray-400">${day}</span></div>`;
            }
            monthGrid.insertAdjacentHTML('beforeend', dayHtml);
            date.setDate(date.getDate() + 1);
        }

        container.querySelectorAll('.has-data').forEach((cell) => {
            cell.addEventListener('mouseenter', (e) => Amber.showDayTooltip(e.currentTarget, context));
            cell.addEventListener('mouseleave', Amber.hideTooltip);
            cell.addEventListener('click', () => {
                if (typeof context.onDaySelect === 'function') context.onDaySelect(cell.dataset.date);
            });
            cell.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (typeof context.onDaySelect === 'function') context.onDaySelect(cell.dataset.date);
                }
            });
        });
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
