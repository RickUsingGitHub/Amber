(function (root) {
    const Amber = root.Amber = root.Amber || {};
    const app = Amber.app;
    const state = app.state;
    const $ = app.$;
    const money = Amber.money;

    /*
     * The Free? tab: what each free-power plan would have cost if some grid use moved into its free
     * hours each day (and battery exports into its best feed-in window). redispatch.js re-times
     * the readings and prices them; this file reads the tab's settings, runs it for whole months
     * and draws the two tables. renderMonthly (app-results.js) calls renderBatteryShift.
     */

    const SHIFT_SETTINGS_KEY = 'batteryShiftSettings';

    function readShiftParams() {
        const budgets = String($('shiftBudgets').value || '')
            .split(/[,\s]+/).map((v) => parseFloat(v)).filter((v) => Number.isFinite(v) && v >= 0);
        const unique = Array.from(new Set(budgets)).sort((a, b) => a - b).slice(0, 4);
        return {
            budgets: unique.length ? unique : Amber.REDISPATCH_DEFAULTS.budgets.slice(),
            windowKw: parseFloat($('shiftWindowKw').value) || Amber.REDISPATCH_DEFAULTS.windowKw,
            exportKw: parseFloat($('shiftExportKw').value) >= 0 ? parseFloat($('shiftExportKw').value) : Amber.REDISPATCH_DEFAULTS.exportKw,
            rte: parseFloat($('shiftRte').value) || Amber.REDISPATCH_DEFAULTS.rte,
            // Blank = auto (from the meter data); 0 = no battery.
            batteryKwh: $('shiftBatteryKwh').value.trim() === '' || !(parseFloat($('shiftBatteryKwh').value) >= 0)
                ? null : parseFloat($('shiftBatteryKwh').value)
        };
    }

    function loadShiftSettings() {
        try {
            const s = JSON.parse(localStorage.getItem(SHIFT_SETTINGS_KEY) || 'null');
            if (!s) return;
            if (Array.isArray(s.budgets) && s.budgets.length) $('shiftBudgets').value = s.budgets.join(', ');
            if (s.windowKw) $('shiftWindowKw').value = s.windowKw;
            if (s.exportKw != null) $('shiftExportKw').value = s.exportKw;
            if (s.rte) $('shiftRte').value = s.rte;
            if (s.batteryKwh != null) $('shiftBatteryKwh').value = s.batteryKwh;
            if (s.plan) state.shiftPlan = s.plan;
            if (s.budget != null) state.shiftBudget = s.budget;
        } catch (err) {
            console.error(err);
        }
    }

    function saveShiftSettings() {
        const p = readShiftParams();
        localStorage.setItem(SHIFT_SETTINGS_KEY, JSON.stringify(Object.assign({}, p, {
            plan: state.shiftPlan || null, budget: state.shiftBudget != null ? state.shiftBudget : null
        })));
    }

    /** Free-window plans for this state and network (the selected plan uses the form's rates). */
    function freeWindowPlans() {
        const stateCode = app.currentStateCode();
        const plans = state.templates[stateCode] || {};
        const selectedName = $('planSelector').value;
        const out = [];
        Object.keys(plans).forEach((name) => {
            if (!Amber.planMatchesNetwork(name, plans[name], app.currentSiteNetwork())) return;
            const config = name === selectedName ? app.createPlanObjectFromForm() : plans[name];
            if (Amber.planHasFreeWindow(config)) out.push({ name, config });
        });
        if (!selectedName) {
            const custom = app.createPlanObjectFromForm();
            if (Amber.planHasFreeWindow(custom)) out.push({ name: $('planName').value.trim() || 'Custom plan', config: custom });
        }
        return out;
    }

    let shiftRun = 0;

    // The Free? tab says why there's nothing to show once results are in.
    function showFreePowerEmpty(html) {
        const el = $('freePowerEmpty');
        const show = !!html && !$('resultsSection').classList.contains('hidden');
        el.classList.toggle('hidden', !show);
        if (show) el.innerHTML = html;
    }

    async function renderBatteryShift() {
        const section = $('batteryShiftSection');
        const monthly = state.monthly;
        const plans = freeWindowPlans();
        if (!monthly || !monthly.months.length || !plans.length) {
            section.classList.add('hidden');
            if (!monthly) showFreePowerEmpty('Press <strong>Compare costs</strong> to work this out for the dates at the top.');
            else if (!monthly.months.length) showFreePowerEmpty('This works month by month, so it needs at least one whole calendar month within the dates at the top. Pick a longer period (for example <strong>Last month</strong> or <strong>Last 12 months</strong>) and press <strong>Compare costs</strong>.');
            else showFreePowerEmpty('There are no free-power plans for your network in the app yet. To try one, go to the <button type="button" data-go-tab="compare" class="text-indigo-600 font-medium hover:underline">Compare</button> tab, pick <strong>Enter my own rates</strong> and set its free hours.');
            return;
        }
        showFreePowerEmpty('');
        section.classList.remove('hidden');
        const params = readShiftParams();
        if (!state.batteryDetect || state.batteryDetect.data !== monthly.channelData) {
            state.batteryDetect = { data: monthly.channelData, result: Amber.detectBattery(monthly.channelData, app.currentStateCode()) };
        }
        const detected = state.batteryDetect.result;
        const batteryKwh = params.batteryKwh != null ? params.batteryKwh : (detected.likely ? null : 0);
        showBatteryNote(params.batteryKwh, detected);
        const opts = {
            site: app.selectedSite(), state: app.currentStateCode(), gstInclusive: app.gstInclusive(), amberRates: app.readAmberRates(),
            budgets: params.budgets, params: { windowKw: params.windowKw, exportKw: params.exportKw, rte: params.rte, batteryKwh }
        };
        const key = JSON.stringify([monthly.months, plans, opts]);
        const run = ++shiftRun;
        if (!state.batteryShift || state.batteryShift.key !== key || state.batteryShift.data !== monthly.channelData) {
            $('batteryShiftTable').innerHTML = '<p class="text-sm text-gray-500">Re-timing your meter data…</p>';
            $('batteryShiftMonthly').innerHTML = '';
            await Amber.sleep(0);
            if (run !== shiftRun) return;
            let table;
            try {
                table = await Amber.batteryShiftTableAsync(monthly.channelData, monthly.months, plans, opts, () => run !== shiftRun);
            } catch (err) {
                console.error(err);
                if (run === shiftRun) $('batteryShiftTable').innerHTML = '<p class="text-sm text-red-700">Could not work out the re-scheduling estimate.</p>';
                return;
            }
            if (!table || run !== shiftRun) return;
            state.batteryShift = { key, data: monthly.channelData, table };
        }
        drawBatteryShift(state.batteryShift.table);
    }

    function showBatteryNote(entered, detected) {
        const note = $('shiftBatteryNote');
        let text;
        if (entered == null && detected.likely) {
            text = `Home battery: worked out for you. Your readings show power going to the grid after dark on ${detected.darkDays} of ${detected.days} days, which means a battery, so the app assumes yours can hold each amount above. Type its size to be exact (a Tesla Powerwall holds 13.5 kWh); anything over that is then treated as things like an electric car or pool pump.`;
        } else if (entered == null) {
            text = 'Home battery: worked out for you. Your readings show no power going to the grid after dark, so the app assumes there is no battery and only moves things like an electric car, pool pump or timer hot water. Type a size if you do have a battery.';
        } else if (entered === 0) {
            text = 'No home battery: only things like an electric car, pool pump or timer hot water are moved. If you have none of those, look at the "As you used it" column.';
        } else {
            text = `Home battery ${entered} kWh: up to ${entered} kWh a day is moved through the battery (losing a little on the way); the rest is things like an electric car or pool pump.`;
        }
        note.textContent = text;
        note.classList.remove('hidden');
    }

    function drawBatteryShift(table) {
        const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
        const th = (t, right, first) => `<th scope="col" class="px-2 sm:px-3 py-2 ${right ? 'text-right' : 'text-left'} align-bottom text-xs font-medium text-gray-500 uppercase tracking-wider${first ? ' sticky left-0 bg-inherit' : ''}">${t}</th>`;
        const vsAmber = (v, amber) => {
            const diff = amber - v;
            if (Math.abs(diff) < 0.005) return '<div class="text-xs text-gray-500">≈ Amber</div>';
            return diff > 0
                ? `<div class="text-xs text-green-700">${money(diff)} less than Amber</div>`
                : `<div class="text-xs text-red-700">${money(-diff)} more than Amber</div>`;
        };
        const n = table.months.length;
        const span = n === 1 ? monthLabel(table.months[0]) : `${monthLabel(table.months[0])} – ${monthLabel(table.months[n - 1])}`;
        const amber = table.amber;
        let html = `<p class="text-sm text-gray-700 mb-2">Using ${n} whole month${n === 1 ? '' : 's'} of readings (${span}). Amber cost <span class="font-semibold">${money(amber.total)}</span> over the same months, including ${money(amber.demand)} of demand charges.${n < 12 ? ' That\'s less than a year, so summer and winter aren\'t balanced yet.' : ''}</p>`;
        let plansTable = `<table class="min-w-full divide-y divide-gray-200 text-sm"><thead><tr class="bg-gray-50">
            ${th('Plan', 0, 1)}${th('As you used it', 1)}${table.budgets.map((b) => th(`Move ${b} kWh a day`, 1)).join('')}
        </tr></thead><tbody class="divide-y divide-gray-200">`;
        table.plans.slice().sort((a, b) => a.shifted[a.shifted.length - 1] - b.shifted[b.shifted.length - 1]).forEach((row) => {
            plansTable += `<tr class="bg-white">
                <td class="px-2 sm:px-3 py-2 sticky left-0 bg-inherit">${Amber.escapeHTML(Amber.planListLabel(row.name, app.currentSiteNetwork()))}</td>
                <td class="px-2 sm:px-3 py-2 text-right whitespace-nowrap">${money(row.metered)}${vsAmber(row.metered, amber.total)}</td>
                ${row.shifted.map((v) => `<td class="px-2 sm:px-3 py-2 text-right whitespace-nowrap font-medium">${money(v)}${vsAmber(v, amber.total)}</td>`).join('')}
            </tr>`;
        });
        html += app.scrollBox(plansTable + '</tbody></table>');
        html += `<p class="text-xs text-gray-500 mt-2">An estimate from your meter readings only. It assumes you can move the same amount every day, and limits extra solar or battery exports to the plan's daily feed-in cap and the maximum export. These plans have no demand charge. ${app.gstInclusive() ? 'Includes GST' : 'Without GST (solar credits unchanged)'}. Check each plan's fact sheet before switching.</p>`;
        $('batteryShiftTable').innerHTML = html;

        // Month by month for one plan and budget.
        const names = table.plans.map((p) => p.name);
        if (!state.shiftPlan || names.indexOf(state.shiftPlan) === -1) {
            const best = table.plans.slice().sort((a, b) => a.shifted[0] - b.shifted[0])[0];
            state.shiftPlan = best.name;
        }
        if (state.shiftBudget == null || table.budgets.indexOf(state.shiftBudget) === -1) {
            state.shiftBudget = table.budgets[Math.min(1, table.budgets.length - 1)];
        }
        const plan = table.plans.find((p) => p.name === state.shiftPlan);
        const bi = table.budgets.indexOf(state.shiftBudget);
        let m = `<div class="flex flex-wrap items-end gap-3 mb-2 text-sm">
            <h4 class="font-semibold text-gray-800 mr-2">One plan, month by month</h4>
            <label class="text-xs text-gray-600">Plan <select id="shiftPlanSelect" class="ml-1 border border-gray-300 rounded px-1 py-0.5 text-sm">
                ${names.map((nm) => `<option value="${Amber.escapeHTML(nm)}"${nm === state.shiftPlan ? ' selected' : ''}>${Amber.escapeHTML(Amber.planListLabel(nm, app.currentSiteNetwork()))}</option>`).join('')}
            </select></label>
            <label class="text-xs text-gray-600">Move <select id="shiftBudgetSelect" class="ml-1 border border-gray-300 rounded px-1 py-0.5 text-sm">
                ${table.budgets.map((b) => `<option value="${b}"${b === state.shiftBudget ? ' selected' : ''}>${b} kWh a day</option>`).join('')}
            </select></label>
        </div>`;
        let monthsTable = `<table class="min-w-full divide-y divide-gray-200 text-sm"><thead><tr class="bg-gray-50">
            ${th('Month', 0, 1)}${th('Amber', 1)}${th('incl. demand', 1)}${th('Plan as you used it', 1)}${th('Plan with use moved', 1)}${th('Difference', 1)}
        </tr></thead><tbody class="divide-y divide-gray-200">`;
        let tot = { amber: 0, demand: 0, metered: 0, shifted: 0 };
        table.months.forEach((month) => {
            const a = amber.byMonth[month];
            const p = plan.byMonth[month];
            const shifted = p.shifted[bi];
            tot = { amber: tot.amber + a.total, demand: tot.demand + a.demand, metered: tot.metered + p.metered, shifted: tot.shifted + shifted };
            monthsTable += monthRow(monthLabel(month), a.total, a.demand, p.metered, shifted, false);
        });
        monthsTable += monthRow('Total', tot.amber, tot.demand, tot.metered, tot.shifted, true);
        m += app.scrollBox(monthsTable + '</tbody></table>');
        $('batteryShiftMonthly').innerHTML = m;
        app.syncScrollHints();

        $('shiftPlanSelect').addEventListener('change', (e) => {
            state.shiftPlan = e.target.value;
            saveShiftSettings();
            drawBatteryShift(table);
        });
        $('shiftBudgetSelect').addEventListener('change', (e) => {
            state.shiftBudget = parseFloat(e.target.value);
            saveShiftSettings();
            drawBatteryShift(table);
        });
    }

    function monthRow(label, amber, demand, metered, shifted, isTotal) {
        const diff = amber - shifted;
        const cls = Math.abs(diff) < 0.005 ? 'text-gray-600' : (diff > 0 ? 'text-green-700' : 'text-red-700');
        const text = Math.abs(diff) < 0.005 ? '—' : (diff > 0 ? `Plan ${money(diff)} cheaper` : `Amber ${money(-diff)} cheaper`);
        const td = (c, extra) => `<td class="px-2 sm:px-3 py-2 whitespace-nowrap text-right ${extra || ''}">${c}</td>`;
        return `<tr class="${isTotal ? 'bg-gray-50 font-semibold' : 'bg-white'}">
            <td class="px-2 sm:px-3 py-2 whitespace-nowrap sticky left-0 bg-inherit">${label}</td>
            ${td(money(amber))}${td(money(demand))}${td(money(metered))}${td(money(shifted), 'font-medium')}${td(text, cls)}
        </tr>`;
    }

    /** Wire up the Free? tab's settings. */
    function setupFreeTab() {
        ['shiftBudgets', 'shiftBatteryKwh', 'shiftWindowKw', 'shiftExportKw', 'shiftRte'].forEach((id) => {
            $(id).addEventListener('change', () => {
                saveShiftSettings();
                renderBatteryShift();
            });
        });
    }

    // What the other app-*.js files use from this one.
    Object.assign(app, {
        loadShiftSettings, renderBatteryShift, setupFreeTab
    });

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
