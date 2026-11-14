(function (root) {
    const Amber = root.Amber = root.Amber || {};
    const app = Amber.app;
    const state = app.state;
    const $ = app.$;
    const money = Amber.money;

    /*
     * Showing results. Compare: the answer and its table (displayResults), every plan
     * (renderAllPlansTable), the savings beside each plan in the picker (updatePlanSavings) and
     * month by month (renderMonthly). Usage: the daily graph and its day picker, and More Stats;
     * the charts and calendar themselves are in charts.js and calendar.js. Pricing lives in
     * costs.js and monthly.js: this file reads the inputs, calls it and builds the HTML.
     */

    /** kWh as text: one decimal place, thousands separated ("3,496.7"). */
    const kwhText = (v) => (Number(v) || 0).toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

    // ---------- Every plan, and the savings in the plan picker ----------

    function planTotalsOptions(planConfig, numDays, startDateStr, endDateStr) {
        return {
            startDateStr,
            endDateStr,
            numDays,
            state: app.currentStateCode(),
            gstInclusive: app.gstInclusive(),
            amberRates: app.readAmberRates(),
            planConfig
        };
    }

    function computeAmberDisplayTotal(channelTotals, demandTariffInfo, startDateStr, endDateStr) {
        const rates = app.readAmberRates();
        const fixed = Amber.amberFixedForPeriod(rates, startDateStr, endDateStr);
        let total = 0;
        Object.values(channelTotals).forEach((c) => {
            total += Amber.adjustForGst(c.totalAmberCost || 0, app.gstInclusive(), c.type === 'feedIn');
        });
        if (demandTariffInfo && demandTariffInfo.cost > 0) {
            total += Amber.adjustForGst(demandTariffInfo.cost, app.gstInclusive(), false);
        }
        total += Amber.adjustForGst(fixed.connection, app.gstInclusive(), false);
        total += Amber.adjustForGst(fixed.subscription, app.gstInclusive(), false);
        return total;
    }

    function renderAllPlansTable(channelTotals, amberTotal, startDateStr, endDateStr, numDays) {
        const section = $('allPlansSection');
        const host = $('allPlansTable');
        const stateCode = app.currentStateCode();
        const plans = state.templates[stateCode] || {};
        const names = Object.keys(plans).filter((planName) =>
            Amber.planMatchesNetwork(planName, plans[planName], app.currentSiteNetwork())
        );
        if (!names.length) {
            section.classList.add('hidden');
            return;
        }
        const selectedName = $('planSelector').value;
        const rows = names.map((name) => {
            const planConfig = name === selectedName ? app.createPlanObjectFromForm() : plans[name];
            const result = Amber.computePlanTotals(channelTotals, planConfig, planTotalsOptions(planConfig, numDays, startDateStr, endDateStr));
            return { name, total: result.otherTotal, asAt: Amber.templateAsAt(plans[name]) };
        }).sort((a, b) => a.total - b.total);

        let html = `<table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-1.5 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                    <th class="px-1.5 sm:px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cost for these dates</th>
                    <th class="px-1.5 sm:px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Compared with Amber</th>
                </tr>
            </thead><tbody class="bg-white divide-y divide-gray-200">`;
        rows.forEach((row) => {
            const diff = amberTotal - row.total;
            let vs = '≈ no difference';
            let cls = 'text-gray-600';
            if (Math.abs(diff) >= 0.01) {
                // On a phone the heading already says "compared with Amber": keep the cell to one line.
                const thanAmber = '<span class="hidden sm:inline"> than Amber</span>';
                if (diff > 0) { vs = `<span class="whitespace-nowrap">${Amber.money(diff)}</span> cheaper${thanAmber}`; cls = 'text-red-700'; }
                else { vs = `<span class="whitespace-nowrap">${Amber.money(Math.abs(diff))}</span> more${thanAmber}`; cls = 'text-green-700'; }
            }
            const current = row.name === selectedName ? ' font-semibold bg-indigo-50' : '';
            html += `<tr class="cursor-pointer hover:bg-gray-50${current}" role="button" tabindex="0" title="Show this plan in full above">
                <td class="px-1.5 sm:px-4 py-2 text-sm text-gray-900 group-data-[tight]:[overflow-wrap:anywhere]">${Amber.escapeHTML(Amber.planListLabel(row.name, app.currentSiteNetwork()))}</td>
                <td class="px-1.5 sm:px-4 py-2 text-sm text-right whitespace-nowrap">${Amber.money(row.total)}</td>
                <td class="px-1.5 sm:px-4 py-2 text-sm text-right sm:whitespace-nowrap ${cls}">${vs}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        host.innerHTML = app.scrollBox(html);
        host.querySelectorAll('tbody tr').forEach((tr, index) => {
            const planName = rows[index].name;
            const activate = () => app.selectSupplierPlan(planName, { scroll: true });
            tr.addEventListener('click', activate);
            tr.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    activate();
                }
            });
        });
        section.classList.remove('hidden');
    }

    function updatePlanSavings() {
        const planSelector = $('planSelector');
        if (!state.lastResultDataPayload) {
            for (const option of planSelector.options) {
                option.textContent = option.value
                    ? Amber.planListLabel(option.value, app.currentSiteNetwork())
                    : 'Enter my own rates';
            }
            return;
        }
        const payload = state.lastResultDataPayload;
        const amberTotal = computeAmberDisplayTotal(
            payload.channelTotals,
            payload.demandTariffInfo,
            payload.startDateStr,
            payload.endDateStr
        );
        state.amberCostBaseline = amberTotal;
        const stateCode = app.currentStateCode();
        const selectedName = planSelector.value;
        for (const option of planSelector.options) {
            if (!option.value) {
                option.textContent = 'Enter my own rates';
                continue;
            }
            const planConfig = option.value === selectedName
                ? app.createPlanObjectFromForm()
                : (state.templates[stateCode] && state.templates[stateCode][option.value]);
            if (!planConfig) {
                option.textContent = option.value;
                continue;
            }
            const result = Amber.computePlanTotals(
                payload.channelTotals,
                planConfig,
                planTotalsOptions(planConfig, payload.numDays, payload.startDateStr, payload.endDateStr)
            );
            const difference = amberTotal - result.otherTotal;
            let savingsText = ' (~ no difference)';
            if (Math.abs(difference) >= 0.01) {
                savingsText = difference > 0
                    ? ` (${Amber.money(difference)} cheaper)`
                    : ` (${Amber.money(Math.abs(difference))} more)`;
            }
            option.textContent = Amber.planListLabel(option.value, app.currentSiteNetwork()) + savingsText;
        }
        planSelector.value = selectedName;
    }

    // ---------- Usage: the daily graph and its day picker ----------

    function renderDailyGraph(dateStr) {
        const canvas = $('dailyChart');
        if (!canvas || !state.cachedAllChannelData && !state.cachedChannelData) return;
        if (state.dailyUsageChart) {
            state.dailyUsageChart.destroy();
            state.dailyUsageChart = null;
        }
        const data = state.cachedAllChannelData || state.cachedChannelData;
        state.dailyUsageChart = Amber.displayDailyGraph(canvas.getContext('2d'), data, dateStr, {
            planConfig: app.createPlanObjectFromForm(),
            state: app.currentStateCode(),
            onZoom: () => $('resetDailyZoomBtn').classList.remove('hidden')
        });
        $('dailyGraphSection').classList.remove('hidden');
        $('resetDailyZoomBtn').classList.add('hidden');
    }

    function selectCalendarDay(dateStr) {
        const selector = $('daySelector');
        let found = false;
        for (const option of selector.options) {
            if (option.value === dateStr) {
                selector.value = dateStr;
                found = true;
                break;
            }
        }
        if (!found) {
            const option = document.createElement('option');
            option.value = dateStr;
            option.textContent = Amber.formatDate(dateStr, true);
            selector.insertBefore(option, selector.firstChild);
            selector.value = dateStr;
        }
        renderDailyGraph(dateStr);
        $('dailyGraphSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
        updateDayNavButtons();
    }

    function updateDayNavButtons() {
        const selector = $('daySelector');
        $('prevDayBtn').disabled = selector.selectedIndex <= 0;
        $('nextDayBtn').disabled = selector.selectedIndex >= selector.options.length - 1;
    }

    function setupDaySelector(startDateStr, endDateStr) {
        const selector = $('daySelector');
        selector.innerHTML = '';
        const datesArray = [];
        const currentDate = new Date(startDateStr + 'T00:00:00');
        const end = new Date(endDateStr + 'T00:00:00');
        while (currentDate <= end) {
            datesArray.push(Amber.formatForInput(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }
        datesArray.reverse().forEach((dateValue) => {
            const option = document.createElement('option');
            option.value = dateValue;
            option.textContent = Amber.formatDate(dateValue, true);
            selector.appendChild(option);
        });
        selector.onchange = () => {
            renderDailyGraph(selector.value);
            updateDayNavButtons();
        };
        $('prevDayBtn').onclick = () => {
            if (selector.selectedIndex > 0) {
                selector.selectedIndex--;
                selector.dispatchEvent(new Event('change'));
            }
        };
        $('nextDayBtn').onclick = () => {
            if (selector.selectedIndex < selector.options.length - 1) {
                selector.selectedIndex++;
                selector.dispatchEvent(new Event('change'));
            }
        };
        $('resetDailyZoomBtn').onclick = () => {
            if (state.dailyUsageChart) {
                $('resetDailyZoomBtn').classList.add('hidden');
                state.dailyUsageChart.resetZoom();
            }
        };
        if (selector.options.length > 0) {
            selector.dispatchEvent(new Event('change'));
        }
        updateDayNavButtons();
    }

    // ---------- The answer ----------

    /** Per-month demand lines ("Jul: 6.67 kW × 31 d") when a range spans several months. */
    function demandMonthsHtml(months) {
        if (!months || months.length < 2) return '';
        return months.map((m) => {
            const name = new Date(`${m.month}-01T00:00:00`).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
            return `<div class="text-xs font-normal">${name}: ${(m.maxDemandKwh * 2).toFixed(2)} kW × ${m.days || 0} d</div>`;
        }).join('');
    }

    // Plain names for meter channels.
    function channelName(c) {
        if (c.type === 'feedIn') return 'Solar sent out';
        if (c.type === 'controlledLoad') return 'Hot water (controlled load)';
        return 'Power bought';
    }

    async function displayResults(channelTotals, startDateStr, endDateStr, numDays, demandTariffInfo, otherDemandTariffInfo, skipGraphs) {
        const planName = $('planName').value.trim() || 'your plan';
        const period = `(${app.fmtDate(startDateStr)} to ${app.fmtDate(endDateStr)})`;
        const rates = app.readAmberRates();
        state.lastResultDataPayload = {
            channelTotals, startDateStr, endDateStr, numDays, demandTariffInfo, otherDemandTariffInfo
        };

        let adjustedAmberTotal = 0;
        let adjustedOtherTotal = 0;
        let projectedMonthlyCostData = null;
        const comparePlan = app.createPlanObjectFromForm();
        const daysWithReadings = new Set(Object.values(channelTotals).flatMap((c) => c.usageData.map(Amber.usageDateStr)));
        const missingDays = Math.max(0, numDays - daysWithReadings.size);
        const incompleteNotice = missingDays ? `<p role="status" class="text-sm text-amber-800 mb-4">Incomplete comparison: ${missingDays} of ${numDays} days have no readings. Usage costs omit those days; fixed charges and export allowances still cover the full selected period. Savings are provisional. Daily exports and calendar totals cover only days with readings.</p>` : '';
        // One row shape for the whole table (five cells, no spans), so two columns can step aside on
        // a phone: "When" and "kWh" are hidden there and shown under "What" instead, which leaves
        // room for the two prices without swiping.
        // Tight sides on a phone, so What and both prices fit across whatever font the phone uses.
        const CELL = 'px-1.5 sm:px-3 py-3 text-sm';
        const headCell = (label, key, right, compact) => `<th scope="col" class="px-1.5 sm:px-3 py-3 ${right ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider${compact ? ' hidden sm:table-cell' : ''}"><span data-help="${key}" data-help-label="${Amber.escapeHTML(label)}">${Amber.escapeHTML(label)}</span></th>`;
        const rateLine = (rate) => {
            const text = Amber.formatCentsPerKwh(rate);
            return text ? `<div class="text-xs font-normal text-gray-400">${text}</div>` : '';
        };
        // r: { what, when, kwh, amber, other (HTML), sub (shown under "what" on a phone), tone, row }.
        const line = (r) => {
            const tone = r.tone || 'text-gray-500';
            return `<tr class="${r.row || ''}">
                <td class="${CELL} font-medium text-gray-900 sm:whitespace-nowrap">${r.what}${r.sub ? `<div class="sm:hidden mt-0.5 text-xs font-normal text-gray-500" data-compact-only>${r.sub}</div>` : ''}</td>
                <td class="${CELL} text-gray-700 hidden sm:table-cell">${r.when || ''}</td>
                <td class="${CELL} ${tone} text-right whitespace-nowrap hidden sm:table-cell">${r.kwh || ''}</td>
                <td class="${CELL} ${tone} text-right whitespace-nowrap">${r.amber || ''}</td>
                <td class="${CELL} ${tone} text-right whitespace-nowrap">${r.other || ''}</td>
            </tr>`;
        };
        const tableIntro = `<p class="text-sm text-gray-500 mb-4">${numDays} days ${period}</p>${incompleteNotice}`;
        let tableHTML = `
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        ${headCell('What', 'colLine')}${headCell('When', 'colPeriod', false, true)}${headCell('kWh', 'colUsage', true, true)}${headCell('Amber', 'colAmber', true)}${headCell(planName, 'colOther', true)}
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">`;

        Object.values(channelTotals).forEach((c) => {
            if (c.totalKWh === 0 && c.totalAmberCost === 0 && c.totalOtherCost === 0) return;
            const isFeedIn = c.type === 'feedIn';
            const rows = Amber.channelPeriodBreakdown(c, comparePlan, app.currentStateCode(), channelTotals);
            const periodRows = rows.length ? rows : [{
                period: c.type === 'feedIn' ? 'feedIn' : (c.type === 'controlledLoad' ? 'controlledLoad' : 'anytime'),
                label: c.type === 'feedIn' ? 'Feed-in' : (c.type === 'controlledLoad' ? 'Controlled load' : 'Anytime'),
                kwh: c.totalKWh || 0,
                amberCost: c.totalAmberCost || 0,
                otherCost: c.totalOtherCost || 0
            }];
            const channelLabel = `${channelName(c)} <span class="font-normal text-xs text-gray-400">${Amber.escapeHTML(c.identifier)}</span>`;
            let channelKwh = 0;
            let channelAmber = 0;
            let channelOther = 0;
            periodRows.forEach((row) => {
                const adjustedAmberCost = Amber.adjustForGst(row.amberCost || 0, app.gstInclusive(), isFeedIn);
                const adjustedOtherCost = Amber.adjustForGst(row.otherCost || 0, app.gstInclusive(), isFeedIn);
                adjustedAmberTotal += adjustedAmberCost;
                adjustedOtherTotal += adjustedOtherCost;
                channelKwh += row.kwh || 0;
                channelAmber += adjustedAmberCost;
                channelOther += adjustedOtherCost;
                tableHTML += line({
                    what: channelLabel,
                    when: Amber.escapeHTML(row.label),
                    kwh: kwhText(row.kwh),
                    sub: `${Amber.escapeHTML(row.label)} · ${kwhText(row.kwh)} kWh`,
                    amber: money(adjustedAmberCost),
                    other: `${money(adjustedOtherCost)}${rateLine(row.rate)}`
                });
            });
            if (c.amberExportCharge) {
                const exportAmber = Amber.adjustForGst(c.amberExportCharge, app.gstInclusive(), false);
                adjustedAmberTotal += exportAmber;
                channelAmber += exportAmber;
                tableHTML += line({
                    what: `Solar sent out <span class="font-normal text-xs text-gray-400">${Amber.escapeHTML(c.identifier)}</span>`,
                    when: '<span data-help="rowExportCharge" data-help-label="Network export charge">Network export charge</span>',
                    kwh: kwhText(c.amberExportChargeKwh),
                    sub: `Network export charge · ${kwhText(c.amberExportChargeKwh)} kWh`,
                    amber: `${money(exportAmber)}${rateLine(c.amberExportChargeRate)}`,
                    other: money(0)
                });
            }
            if (periodRows.length + (c.amberExportCharge ? 1 : 0) > 1) {
                tableHTML += line({
                    row: 'bg-gray-50 font-semibold', tone: 'text-gray-900',
                    what: channelName(c), when: 'Subtotal', kwh: kwhText(channelKwh), sub: `Subtotal · ${kwhText(channelKwh)} kWh`,
                    amber: money(channelAmber), other: money(channelOther)
                });
            }
        });

        if (demandTariffInfo && demandTariffInfo.cost > 0) {
            const adjustedDemandCost = Amber.adjustForGst(demandTariffInfo.cost || 0, app.gstInclusive(), false);
            adjustedAmberTotal += adjustedDemandCost;
            const maxDemandKw = ((demandTariffInfo.maxDemandKwh || 0) * 2).toFixed(2);
            const maxDemandDateTimeObj = new Date(demandTariffInfo.maxDemandTime + '+10:00');
            const maxDemandDateTime = Number.isNaN(maxDemandDateTimeObj.getTime())
                ? demandTariffInfo.maxDemandTime
                : maxDemandDateTimeObj.toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' });
            const monthOfMaxDemand = maxDemandDateTimeObj.getMonth();
            const yearOfMaxDemand = maxDemandDateTimeObj.getFullYear();
            const daysInMonth = new Date(yearOfMaxDemand, monthOfMaxDemand + 1, 0).getDate();
            const monthKey = `${yearOfMaxDemand}-${String(monthOfMaxDemand + 1).padStart(2, '0')}`;
            const projectedMonthlyCost = (demandTariffInfo.maxDemandKwh * 2) * (Amber.demandCentsFor(rates, monthKey) / 100) * daysInMonth;
            projectedMonthlyCostData = {
                cost: Amber.adjustForGst(projectedMonthlyCost, app.gstInclusive(), false),
                month: maxDemandDateTimeObj.toLocaleString('default', { month: 'long' })
            };
            tableHTML += line({
                row: 'font-semibold border-t', tone: 'text-gray-900',
                what: '<span id="amber-demand-tooltip-trigger" class="border-b border-dotted border-gray-500">Amber demand charge</span><span data-help="rowDemand" data-help-label="Amber demand charge"></span>',
                kwh: `<div class="text-xs font-normal text-gray-500">Busiest: ${maxDemandKw} kW</div>
                    <div class="text-xs text-blue-600 font-normal">on ${maxDemandDateTime}</div>
                    <div class="font-normal text-gray-500">${demandMonthsHtml(demandTariffInfo.months) || `<div class="text-xs">× ${demandTariffInfo.demandDays} days</div>`}</div>`,
                sub: `Busiest: ${maxDemandKw} kW on ${maxDemandDateTime}`,
                amber: money(adjustedDemandCost)
            });
        }

        if (otherDemandTariffInfo && otherDemandTariffInfo.cost > 0) {
            const adjustedOtherDemandCost = Amber.adjustForGst(otherDemandTariffInfo.cost || 0, app.gstInclusive(), false);
            adjustedOtherTotal += adjustedOtherDemandCost;
            const maxDemandKw = ((otherDemandTariffInfo.maxDemandKwh || 0) * 2).toFixed(2);
            const maxDemandDateTime = otherDemandTariffInfo.maxDemandTime || '';
            const dayCount = otherDemandTariffInfo.applicableDaysCount || numDays;
            tableHTML += line({
                row: 'font-semibold border-t', tone: 'text-gray-900',
                what: `<span class="whitespace-normal">${Amber.escapeHTML(planName)} demand charge</span><span data-help="rowOtherDemand" data-help-label="Demand charge"></span>`,
                kwh: `<div class="text-xs font-normal text-gray-500">Busiest: ${maxDemandKw} kW</div>
                    <div class="text-xs text-blue-600 font-normal">${Amber.escapeHTML(String(maxDemandDateTime))}</div>
                    <div class="font-normal text-gray-500">${demandMonthsHtml(otherDemandTariffInfo.months) || `<div class="text-xs">× ${dayCount} applicable days</div>`}</div>`,
                sub: `Busiest: ${maxDemandKw} kW`,
                other: money(adjustedOtherDemandCost)
            });
        }

        const amberFixed = Amber.amberFixedForPeriod(rates, startDateStr, endDateStr);
        const amberConnectionCost = Amber.adjustForGst(amberFixed.connection, app.gstInclusive(), false);
        const otherDailyConnection = Amber.adjustForGst(((parseFloat($('dailyConnectionRate').value) || 0) * numDays) / 100, app.gstInclusive(), false);
        const amberSubscriptionCost = Amber.adjustForGst(amberFixed.subscription, app.gstInclusive(), false);
        adjustedAmberTotal += amberConnectionCost + amberSubscriptionCost;
        adjustedOtherTotal += otherDailyConnection;

        let totalImportKwh = 0;
        let totalExportKwh = 0;
        Object.values(channelTotals).forEach((c) => {
            if (c.type === 'feedIn') totalExportKwh += c.totalKWh || 0;
            else totalImportKwh += c.totalKWh || 0;
        });
        state.lastResultDataPayload.amberTotal = adjustedAmberTotal;
        state.lastResultDataPayload.otherTotal = adjustedOtherTotal;
        state.lastResultDataPayload.planName = planName;
        state.lastResultDataPayload.importKwh = totalImportKwh;
        state.lastResultDataPayload.exportKwh = totalExportKwh;

        tableHTML += line({
            row: 'font-semibold border-t', tone: 'text-gray-900',
            what: 'Daily supply charge<span data-help="rowDaily" data-help-label="Daily supply charge"></span>',
            amber: money(amberConnectionCost), other: money(otherDailyConnection)
        }) + line({
            row: 'font-semibold', tone: 'text-gray-900',
            what: 'Amber membership fee<span data-help="rowSubscription" data-help-label="Amber membership fee"></span>',
            amber: money(amberSubscriptionCost), other: '<span class="font-normal text-gray-500">none</span>'
        }) + line({
            row: 'bg-gray-50 font-bold', tone: 'text-gray-900',
            what: 'Total<span data-help="rowTotal" data-help-label="Total"></span>',
            amber: money(adjustedAmberTotal), other: money(adjustedOtherTotal)
        }) + '</tbody></table>';

        const savings = adjustedOtherTotal - adjustedAmberTotal;
        let savingsSummaryHTML = '<div class="mb-4 p-4 rounded-lg text-center ';
        if (missingDays) {
            savingsSummaryHTML += 'bg-amber-50"><p class="text-lg font-medium text-amber-800">Incomplete comparison — savings are provisional.</p>';
        } else if (savings > 0) {
            const percent = adjustedOtherTotal > 0 ? ` (${((savings / adjustedOtherTotal) * 100).toFixed(1)}%)` : '';
            savingsSummaryHTML += `bg-green-100"><p class="text-lg font-medium text-green-800">Amber was <span class="font-bold">${Amber.money(savings)}${percent}</span> cheaper than <span class="italic">${Amber.escapeHTML(planName)}</span> for these dates.</p>`;
        } else if (savings < 0) {
            savingsSummaryHTML += `bg-red-100"><p class="text-lg font-medium text-red-800"><span class="italic">${Amber.escapeHTML(planName)}</span> would have been <span class="font-bold">${Amber.money(Math.abs(savings))}</span> cheaper than Amber for these dates.</p>`;
        } else {
            savingsSummaryHTML += 'bg-gray-100"><p class="text-lg font-medium text-gray-800">Amber and this plan cost about the same for these dates.</p>';
        }
        if (!$('planSelector').value && !$('planName').value.trim()) {
            savingsSummaryHTML += '<p class="mt-2 text-sm text-gray-700">That\'s against example prices. For a real answer, choose the plan you\'re on (or type its prices) under <button type="button" data-jump="planChooser" class="text-indigo-600 font-medium hover:underline">Compare Amber with…</button></p>';
        }
        savingsSummaryHTML += '</div>';
        // The answer first; the table underneath.
        $('results-table-container').innerHTML = savingsSummaryHTML + tableIntro + app.scrollBox(tableHTML);

        if (projectedMonthlyCostData) {
            const trigger = $('amber-demand-tooltip-trigger');
            if (trigger) {
                trigger.addEventListener('mouseenter', (e) => {
                    Amber.showAmberDemandTooltip(e.currentTarget, projectedMonthlyCostData.cost, projectedMonthlyCostData.month);
                });
                trigger.addEventListener('mouseleave', Amber.hideTooltip);
            }
        }

        const asAt = Amber.latestAsAtForState(app.currentStateCode(), state.templates);
        const estSite = app.selectedSite();
        const banner = $('estimateBanner');
        if (estSite && estSite.local) {
            const e = estSite.estimate || {};
            banner.textContent = `NMI ${estSite.nmi} isn't on Amber, so the Amber column is an estimate of what Amber would have charged: every reading priced at the wholesale price at that moment plus Amber's 2026-27 charges for ${estSite.network} (tariff ${e.tariffCode}${e.exportCode ? `, export tariff ${e.exportCode}` : ''}). It assumes power is used exactly as it was; with a home battery, Amber's automatic battery control (SmartShift) would usually do better. Pick the plan this household is on now under "Compare Amber with…" above.`;
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }
        $('resultsDisclaimer').textContent = `Plan prices are the published ones as at ${app.fmtDate(asAt)}, including GST. Prices change, so check the plan's fact sheet or Energy Made Easy (energymadeeasy.gov.au) before switching. Public holidays are treated as normal days.`;

        const estimatedDays = Object.values(state.dailySummaries).filter((s) => s && s.estimatedCount > 0).length;
        const qualityBanner = $('qualityBanner');
        if (estimatedDays > 0) {
            qualityBanner.classList.remove('hidden');
            qualityBanner.textContent = `${estimatedDays} day${estimatedDays === 1 ? '' : 's'} in these dates still ${estimatedDays === 1 ? 'has' : 'have'} estimated meter readings, so the figures may change a little. This is normal for the last few days.`;
        } else {
            qualityBanner.classList.add('hidden');
        }

        $('downloadCsvButton').disabled = false;
        $('resultsSection').classList.remove('hidden');
        $('calendarSection').classList.remove('hidden');

        if (!skipGraphs) await Amber.sleep(0);
        renderAllPlansTable(channelTotals, adjustedAmberTotal, startDateStr, endDateStr, numDays);
        updatePlanSavings();

        if (!skipGraphs) {
            await Amber.sleep(0);
            const avgContainer = $('averageGraphContainer');
            avgContainer.classList.remove('hidden');
            if (state.usageChart) { state.usageChart.destroy(); state.usageChart = null; }
            try {
                state.usageChart = Amber.displayAverageGraph($('usagePriceChart').getContext('2d'), channelTotals, {
                    numDays,
                    startDate: startDateStr,
                    endDate: endDateStr,
                    planConfig: app.createPlanObjectFromForm(),
                    state: app.currentStateCode(),
                    onZoom: () => $('resetAverageZoomBtn').classList.remove('hidden')
                });
            } catch (err) {
                console.error(err);
            }
            $('resetAverageZoomBtn').onclick = () => {
                if (state.usageChart) {
                    $('resetAverageZoomBtn').classList.add('hidden');
                    state.usageChart.resetZoom();
                }
            };
            setupDaySelector(startDateStr, endDateStr);
        }

        Amber.displayCalendar($('calendar-container'), {
            dailySummaries: state.dailySummaries,
            demandInfoForTooltip: state.demandInfoForTooltip,
            startDate: startDateStr,
            endDate: endDateStr,
            siteId: state.currentSiteId,
            planName,
            otherDailyCents: parseFloat($('dailyConnectionRate').value) || 0,
            amberRates: rates,
            onDaySelect: selectCalendarDay
        });

        try {
            renderMoreStats();
        } catch (err) {
            console.error(err);
        }
        try {
            renderMonthly();
            app.renderBillCheck();
        } catch (err) {
            console.error(err);
        }
    }

    // ---------- Month by month ----------

    function periodOpts() {
        return { site: app.selectedSite(), planConfig: app.createPlanObjectFromForm(), state: app.currentStateCode(), amberRates: app.readAmberRates() };
    }

    /**
     * Channel data for every whole calendar month inside the chosen dates [from, to].
     * Months outside them are left out (even if cached), so "Last 12 months" lists exactly 12.
     * rangeItems already holds every usable cached day in the range, so no other cache read is needed.
     */
    function loadMonthlyData(channels, rangeItems, from, to) {
        const byDate = {};
        rangeItems.forEach((item) => {
            const dateStr = Amber.usageDateStr(item);
            if (dateStr < from || dateStr > to) return;
            (byDate[dateStr] || (byDate[dateStr] = [])).push(item);
        });
        const months = Amber.fullMonths(Object.keys(byDate).filter((d) => Amber.coversWholeDay(byDate[d])));
        const wanted = new Set(months);
        const channelData = {};
        channels.forEach((c) => { channelData[c.identifier] = Amber.emptyChannel(c); });
        Object.keys(byDate).sort().forEach((dateStr) => {
            if (wanted.has(dateStr.substring(0, 7))) Amber.processUsageData(byDate[dateStr], channelData, false);
        });
        Object.values(channelData).forEach((c) => c.usageData.sort((a, b) => (a.nemTime < b.nemTime ? -1 : (a.nemTime > b.nemTime ? 1 : 0))));
        return { months, channelData };
    }

    function renderMonthly() {
        const section = $('monthlySection');
        const monthly = state.monthly;
        if (!monthly) { section.classList.add('hidden'); app.renderBatteryShift(); return; }
        section.classList.remove('hidden');
        if (!monthly.months.length) {
            $('monthlyTable').innerHTML = '<p class="text-sm text-gray-600">No whole calendar months in the dates above. Choose dates that cover a full month (for example Last month) and it will show here.</p>';
            app.renderBatteryShift();
            return;
        }
        const opts = periodOpts();
        const key = JSON.stringify(opts);
        if (monthly.key !== key) {
            monthly.breakdown = Amber.monthlyBreakdown(monthly.channelData, monthly.months, opts);
            monthly.key = key;
        }
        const { rows, total } = monthly.breakdown;
        const gst = app.gstInclusive();
        const adj = (v) => Amber.adjustForGst(v || 0, gst, false);
        const planName = $('planName').value.trim() || 'your plan';
        const view = (r) => {
            const amberTotal = adj(r.amberUsage) + (r.amberFeedIn || 0) + adj(r.amberDemand) + adj(r.amberConnection + r.amberSubscription);
            const otherTotal = gst ? r.otherTotal : r.otherTotalExGst;
            return { amberTotal, otherTotal, diff: otherTotal - amberTotal };
        };
        const label = (r) => (r.month === 'Total'
            ? 'Total'
            : new Date(`${r.month}-01T00:00:00`).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }));
        const daysCell = (r) => (r.dataDays < r.days ? `<span class="text-amber-700" title="Days with meter data / days in period">${r.dataDays}/${r.days}</span>` : String(r.days));
        // Headings wrap onto two lines and cells are tight, so all eleven columns fit a computer
        // screen. Fonts differ in width from one computer to the next: if the table is still too
        // wide there, its last column wraps ("Plan $53.10" over "cheaper") before anything is
        // pushed off the side (see syncScrollHints).
        // On a phone the table scrolls sideways with the month staying in view.
        const th = (t, right, help, first) => `<th scope="col" class="px-1.5 py-2 ${right ? 'text-right' : 'text-left'} align-bottom text-xs font-medium text-gray-500 uppercase tracking-wider${first ? ' sticky left-0 bg-inherit' : ''}">${help ? `<span data-help="${help}" data-help-label="${t}">${t}</span>` : t}</th>`;
        let html = `<table class="min-w-full divide-y divide-gray-200 text-sm"><thead><tr class="bg-gray-50">
            ${th('Month', 0, '', 1)}${th('Days', 1, 'Days in the month. If some show as 25/31, only 25 days had meter readings.')}${th('kWh bought', 1, 'colUsage')}${th('kWh sent out', 1, 'Solar sent to the grid, in kWh.')}${th('Power', 1, 'What Amber charged for the power you bought (including any network export charge).')}${th('Solar credit', 1, 'What Amber paid for solar you sent out (shown with a minus sign).')}${th('Demand', 1, 'rowDemand')}${th('Daily + fees', 1, 'Daily supply charge plus Amber\'s membership fee.')}${th('Amber', 1, 'Everything on Amber for the month.')}${th(Amber.escapeHTML(planName), 1, 'colOther')}${th('Difference', 1, 'Which was cheaper that month, and by how much.')}
        </tr></thead><tbody class="divide-y divide-gray-200">`;
        rows.concat([total]).forEach((r) => {
            const v = view(r);
            const isTotal = r.month === 'Total';
            const diffCls = Math.abs(v.diff) < 0.005 ? 'text-gray-600' : (v.diff > 0 ? 'text-green-700' : 'text-red-700');
            // "Plan" is the one named in the column before (its full name here made every row three lines tall).
            const diffText = Math.abs(v.diff) < 0.005 ? '—' : `${v.diff > 0 ? 'Amber' : 'Plan'} ${money(Math.abs(v.diff))} cheaper`;
            const td = (content, right, extra) => `<td class="px-1.5 py-2 whitespace-nowrap ${right ? 'text-right' : ''} ${extra || ''}">${content}</td>`;
            html += `<tr class="${isTotal ? 'bg-gray-50 font-semibold' : 'bg-white'}">
                ${td(label(r), 0, 'sticky left-0 bg-inherit')}${td(daysCell(r), 1)}${td(kwhText(r.importKwh), 1)}${td(kwhText(r.exportKwh), 1)}
                ${td(money(adj(r.amberUsage)), 1)}${td(money(r.amberFeedIn || 0), 1)}${td(money(adj(r.amberDemand)), 1)}${td(money(adj(r.amberConnection + r.amberSubscription)), 1)}
                ${td(money(v.amberTotal), 1, 'font-semibold')}${td(money(v.otherTotal), 1)}${td(diffText, 1, `${diffCls} lg:group-data-[tight]:whitespace-normal`)}
            </tr>`;
        });
        html = app.scrollBox(html + '</tbody></table>');
        html += `<p class="text-xs text-gray-500 mt-2">${gst ? 'Includes GST' : 'Without GST (solar credits unchanged)'}.</p>`;
        $('monthlyTable').innerHTML = html;
        app.syncScrollHints();
        app.renderBatteryShift();
    }

    // ---------- More Stats ----------

    function currentTimeZone() {
        return Amber.STATE_TIMEZONES[app.currentStateCode()] || 'Australia/Sydney';
    }

    function fmt(n, dp) {
        return Number.isFinite(n) ? n.toFixed(dp == null ? 1 : dp) : '–';
    }

    function renderMoreStats() {
        if (!state.cachedChannelData) return;
        const s = Amber.moreStats(state.cachedChannelData, { timeZone: currentTimeZone() });
        const section = $('moreStatsSection');
        if (!s.dayCount) { section.classList.add('hidden'); return; }
        section.classList.remove('hidden');
        const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(0)}%` : '–');
        const rows = [
            ['Average price you paid', s.avgImportCents != null ? `${s.avgImportCents.toFixed(1)} c/kWh` : '–', `${fmt(s.importKwh, 0)} kWh bought for ${money(s.importCost)}`,
                'Your power cost (not counting daily charges) divided by the kWh you bought. Handy to compare with another plan\'s price per kWh.'],
            ['Average paid for your solar', s.avgExportCents != null ? `${s.avgExportCents.toFixed(1)} c/kWh` : '–', `${fmt(s.exportKwh, 0)} kWh sent out, ${money(s.exportEarn)} earned`,
                'What Amber paid on average for each kWh of solar (or battery power) you sent to the grid.'],
            ['Bought during price spikes (50c+)', `${fmt(s.spikeImportKwh)} kWh`, `${money(s.spikeImportCost)}, ${pct(s.spikeImportCost, s.importCost)} of your power cost`,
                'Amber\'s price jumps when the market is short of power, sometimes to several dollars per kWh. This is how much you bought while it was 50 c/kWh or more. A battery or shifting use helps avoid these moments.'],
            ['Sold during price spikes (50c+)', `${fmt(s.spikeExportKwh)} kWh`, `${money(s.spikeExportEarn)}, ${pct(s.spikeExportEarn, s.exportEarn)} of your solar credit`,
                'Power you sent out while Amber\'s price was 50 c/kWh or more: the best-paid moments, usually on hot evenings.'],
            ['Bought at negative prices', `${fmt(s.negImportKwh)} kWh`, `${money(s.negImportCredit)} paid to you`,
                'On very sunny days there can be so much power that the price drops below zero, so you\'re paid to use it.'],
            ['Sold at negative prices', `${fmt(s.negExportKwh)} kWh`, `${money(s.negExportCost)} cost`,
                'When the price is below zero, sending solar to the grid costs you a little. Storing it in a battery or turning exports down avoids that.'],
            ['Evening use (4pm to 9pm)', `${fmt(s.eveningImportKwh)} kWh`, `${pct(s.eveningImportKwh, s.importKwh)} of all power bought`,
                'Power bought in the evening, when prices are usually highest. Moving use out of these hours saves the most.'],
            ['Days with almost no grid power', `${s.gridFreeDays} of ${s.dayCount}`, 'under 0.5 kWh bought',
                'Days you bought less than half a kWh from the grid in total, for example thanks to solar and a battery.'],
            ['Days you sent out more than you bought', `${s.netExportDays} of ${s.dayCount}`, '',
                'Days when the solar you sent to the grid was more than the power you bought from it.']
        ];
        $('moreStatsTable').innerHTML = `<table class="min-w-full divide-y divide-gray-200 text-sm"><tbody class="divide-y divide-gray-200">${rows.map((r) => `
            <tr>
                <td class="px-3 py-2 text-gray-900 font-medium"><span data-help="${Amber.escapeHTML(r[3])}" data-help-label="${Amber.escapeHTML(r[0])}">${Amber.escapeHTML(r[0])}</span></td>
                <td class="px-3 py-2 text-right text-gray-900 whitespace-nowrap">${Amber.escapeHTML(r[1])}</td>
                <td class="px-3 py-2 text-gray-500">${Amber.escapeHTML(r[2])}</td>
            </tr>`).join('')}</tbody></table>`;
    }

    // ---------- Taking results down ----------

    function destroyCharts() {
        if (state.dailyUsageChart) { state.dailyUsageChart.destroy(); state.dailyUsageChart = null; }
        if (state.usageChart) { state.usageChart.destroy(); state.usageChart = null; }
    }

    /** Take the results off every tab (before a new Compare, or when the readings are cleared). */
    function hideResults() {
        ['resultsSection', 'calendarSection', 'averageGraphContainer', 'dailyGraphSection', 'allPlansSection',
            'batteryShiftSection', 'freePowerEmpty', 'moreStatsSection'].forEach((id) => $(id).classList.add('hidden'));
        $('downloadCsvButton').disabled = true;
        $('results-table-container').innerHTML = '';
        destroyCharts();
    }

    // What the other app-*.js files use from this one.
    Object.assign(app, {
        updatePlanSavings, displayResults, loadMonthlyData, renderMonthly, hideResults
    });

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
