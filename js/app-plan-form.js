(function (root) {
    const Amber = root.Amber = root.Amber || {};
    const app = Amber.app;
    const state = app.state;
    const $ = app.$;

    /*
     * The plan form on Compare ("Compare Amber with…"): the state and plan pickers, flat and
     * time-of-use prices, TOU and feed-in windows, the demand charge, and the plans the user typed
     * in. createPlanObjectFromForm turns the form into a plan config (docs/ARCHITECTURE.md, "Plan
     * configs") and applyPlanTemplate fills the form from one. saveAllSettings / loadAllSettings
     * keep the form, Amber's charges and the chosen site in localStorage.
     */

    // ---------- TOU and feed-in windows ----------

    // TOU periods in the plan form. 'free' and 'superOffpeak' start with no windows (unused).
    const TOU_PERIODS = ['free', 'superOffpeak', 'peak', 'shoulder', 'offpeak'];
    const OPTIONAL_TOU_PERIODS = ['free', 'superOffpeak'];
    const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function collectWindows(container, includeRate) {
        if (!container) return [];
        return Array.from(container.querySelectorAll('.tou-window')).map((win) => {
            const row = {
                start: win.querySelector('.tou-start').value,
                end: win.querySelector('.tou-end').value,
                days: Array.from(win.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => parseInt(cb.value, 10))
            };
            if (win.dataset.months) {
                row.months = win.dataset.months.split(',').map((m) => parseInt(m, 10)).filter((m) => m >= 1 && m <= 12);
            }
            if (includeRate) {
                row.rate = parseFloat(win.querySelector('.tou-rate').value) || 0;
                const cap = parseFloat(win.querySelector('.tou-cap') && win.querySelector('.tou-cap').value);
                if (cap > 0) {
                    row.capKwh = cap;
                    const over = parseFloat(win.querySelector('.tou-over-rate').value);
                    if (Number.isFinite(over)) row.overRate = over;
                }
            }
            return row;
        });
    }

    function addWindowRow(container, windowData, includeRate) {
        if (!container) return;
        const windowDiv = document.createElement('div');
        windowDiv.className = 'tou-window relative bg-white border border-gray-300 p-2 rounded shadow-sm text-sm';
        const startVal = windowData && windowData.start ? windowData.start : '00:00';
        const endVal = windowData && windowData.end ? windowData.end : '00:00';
        const daysArr = windowData && windowData.days ? windowData.days : [1, 2, 3, 4, 5, 6, 0];
        const rateVal = windowData && windowData.rate != null ? windowData.rate : '';
        const capVal = windowData && windowData.capKwh != null ? windowData.capKwh : '';
        const overVal = windowData && windowData.overRate != null ? windowData.overRate : '';
        const rateField = includeRate
            ? `<div class="mt-1"><label class="text-xs font-medium text-gray-600">Solar rate at these times (c/kWh)</label><input type="number" step="0.0001" class="tou-rate w-full text-xs p-1 border border-gray-300 rounded" value="${rateVal}"></div>
               <div class="grid grid-cols-2 gap-2 mt-1">
                   <div><label class="text-xs font-medium text-gray-600" title="The most kWh a day paid at this rate. Blank = no limit.">Up to (kWh a day)</label><input type="number" step="0.1" min="0" placeholder="none" class="tou-cap w-full text-xs p-1 border border-gray-300 rounded" value="${capVal}"></div>
                   <div><label class="text-xs font-medium text-gray-600" title="The rate for kWh over that daily limit. Blank = the plan's normal feed-in rate.">Then (c/kWh)</label><input type="number" step="0.0001" placeholder="normal rate" class="tou-over-rate w-full text-xs p-1 border border-gray-300 rounded" value="${overVal}"></div>
               </div>`
            : '';
        const months = (windowData && windowData.months) || [];
        if (months.length) windowDiv.dataset.months = months.join(',');
        const monthsNote = months.length
            ? `<div class="mt-1 text-[10px] text-gray-600" title="This time only applies in these months.">Months: ${months.slice().sort((a, b) => a - b).map((m) => MONTH_ABBR[m - 1]).filter(Boolean).join(', ')}</div>`
            : '';
        windowDiv.innerHTML = `
            <button type="button" class="absolute top-1 right-1 text-gray-400 hover:text-red-500 font-bold px-1" title="Remove these hours" data-remove-window="1" aria-label="Remove these hours">×</button>
            <div class="grid grid-cols-2 gap-2 pr-6">
                <div><label class="text-xs font-medium text-gray-600">From</label><input type="time" class="tou-start w-full text-xs p-1 border border-gray-300 rounded" value="${startVal}"></div>
                <div><label class="text-xs font-medium text-gray-600">To</label><input type="time" class="tou-end w-full text-xs p-1 border border-gray-300 rounded" value="${endVal}"></div>
            </div>
            ${rateField}
            ${monthsNote}
            <div class="mt-1 text-[10px] font-medium text-gray-600">On these days:</div>
            <div class="grid grid-cols-7 gap-1 mt-1 text-[10px]">
                <label class="day-checkbox-label flex flex-col items-center"><input type="checkbox" value="1" ${daysArr.includes(1) ? 'checked' : ''}><span class="mt-0.5">M</span></label>
                <label class="day-checkbox-label flex flex-col items-center"><input type="checkbox" value="2" ${daysArr.includes(2) ? 'checked' : ''}><span class="mt-0.5">T</span></label>
                <label class="day-checkbox-label flex flex-col items-center"><input type="checkbox" value="3" ${daysArr.includes(3) ? 'checked' : ''}><span class="mt-0.5">W</span></label>
                <label class="day-checkbox-label flex flex-col items-center"><input type="checkbox" value="4" ${daysArr.includes(4) ? 'checked' : ''}><span class="mt-0.5">T</span></label>
                <label class="day-checkbox-label flex flex-col items-center"><input type="checkbox" value="5" ${daysArr.includes(5) ? 'checked' : ''}><span class="mt-0.5">F</span></label>
                <label class="day-checkbox-label flex flex-col items-center"><input type="checkbox" value="6" ${daysArr.includes(6) ? 'checked' : ''}><span class="mt-0.5">S</span></label>
                <label class="day-checkbox-label flex flex-col items-center"><input type="checkbox" value="0" ${daysArr.includes(0) ? 'checked' : ''}><span class="mt-0.5">S</span></label>
            </div>
        `;
        windowDiv.querySelectorAll('input').forEach((input) => {
            input.addEventListener('change', saveAllSettings);
        });
        windowDiv.querySelector('[data-remove-window]').addEventListener('click', () => {
            windowDiv.remove();
            saveAllSettings();
        });
        container.appendChild(windowDiv);
    }

    function addTouWindow(period, windowData) {
        addWindowRow($(`tou_${period}_windows_container`), windowData, false);
    }

    function setRatesDetailsOpen(open, persist) {
        const details = $('ratesDetails');
        const label = $('ratesDetailsToggleLabel');
        details.classList.toggle('hidden', !open);
        label.textContent = open ? 'Hide this plan\'s prices' : 'Show this plan\'s prices';
        if (persist !== false) localStorage.setItem('ratesDetailsOpen', open ? 'true' : 'false');
    }

    // ---------- The plan picker ----------

    function updateOtherSupplierHeading() {
        const planName = $('planName').value.trim();
        $('otherSupplierHeading').textContent = planName ? `Compare Amber with ${planName}` : 'Compare Amber with…';
    }

    function visiblePlanNames(selectedState) {
        const plans = state.templates[selectedState] || {};
        const siteNetwork = app.currentSiteNetwork();
        return Object.keys(plans).filter((planName) =>
            Amber.planMatchesNetwork(planName, plans[planName], siteNetwork)
        );
    }

    function updatePlanSelector(selectedState) {
        const planSelector = $('planSelector');
        const previous = planSelector.value;
        planSelector.innerHTML = '<option value="">Enter my own rates</option>';
        const names = visiblePlanNames(selectedState);
        names.forEach((planName) => {
            const option = document.createElement('option');
            option.value = planName;
            option.textContent = Amber.planListLabel(planName, app.currentSiteNetwork());
            if (!state.originalTemplates[selectedState] || !state.originalTemplates[selectedState][planName]) {
                option.style.color = '#1a56db';
            }
            planSelector.appendChild(option);
        });
        syncPlanStateNote(selectedState, names);
        if (previous === '' || names.indexOf(previous) !== -1) {
            planSelector.value = previous;
            return;
        }
        const hintName = Amber.hintPlanForNetwork(app.currentSiteNetwork());
        if (hintName && names.indexOf(hintName) !== -1) {
            planSelector.value = hintName;
        } else if (names.length) {
            planSelector.value = names[0];
        }
        if (planSelector.value && planSelector.value !== previous) {
            applyPlanTemplate();
        } else if (!planSelector.value) {
            // The plan that was showing isn't offered here and nothing takes its place: don't
            // leave its name and prices behind under "Enter my own rates".
            clearPlanInputs();
        }
    }

    /** Say why the plan list is empty when the state chosen isn't the one the site's network is in. */
    function syncPlanStateNote(selectedState, names) {
        const note = $('planStateNote');
        const site = app.selectedSite();
        const home = app.siteNetworkState(site);
        const show = !!home && home !== selectedState && !names.length;
        note.classList.toggle('hidden', !show);
        note.textContent = show
            ? `Your meter is on the ${site.network} network, which is in ${home}, so there are no ${selectedState} plans to compare it with. Choose ${home} to see its plans, or enter your own rates.`
            : '';
    }

    function isBuiltInPlan(stateCode, planName) {
        return !!(state.originalTemplates[stateCode] && state.originalTemplates[stateCode][planName]);
    }

    function selectSupplierPlan(planName, opts) {
        const options = opts || {};
        const selector = $('planSelector');
        const next = planName || '';
        const unchanged = selector.value === next;
        selector.value = next;
        if (unchanged && !options.fromChange) {
            if (options.scroll && state.cachedChannelData) {
                $('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            return;
        }
        applyPlanTemplate();
        saveAllSettings();
        if (state.cachedChannelData && state.lastFetchedStartDate) {
            app.recalculateAndShow(false);
            if (options.scroll) $('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            app.updatePlanSavings();
        }
    }

    // ---------- The form as a plan, and a plan into the form ----------

    function createPlanObjectFromForm() {
        const rateType = document.querySelector('input[name="rateType"]:checked').value;
        const isDemandEnabled = $('enableDemandTariff').checked;
        const demandConfig = {
            e: isDemandEnabled,
            r: isDemandEnabled ? parseFloat($('demandRate').value) : 0,
            s: isDemandEnabled ? $('demandWindowStart').value : '16:00',
            f: isDemandEnabled ? $('demandWindowEnd').value : '21:00',
            days: isDemandEnabled ? Array.from($('demandDaysContainer').querySelectorAll('input:checked')).map((cb) => parseInt(cb.value, 10)) : []
        };
        const feedInWindows = $('enableFeedInTou').checked ? collectWindows($('feedInWindowsContainer'), true) : [];
        const stateCode = app.currentStateCode();
        const selectedPlan = $('planSelector').value;
        const template = selectedPlan && state.templates[stateCode] ? state.templates[stateCode][selectedPlan] : null;
        const clock = (template && template.clock) || 'local';
        const timeZone = (template && template.timeZone) || Amber.STATE_TIMEZONES[stateCode];

        const getPeriodSettings = (period) => {
            const container = document.querySelector(`[data-tou-period="${period}"]`);
            if (!container) return {};
            const rate = parseFloat($(`tou_${period}_rate`).value) || 0;
            if (period === 'offpeak') return { rate };
            const settings = { rate, windows: collectWindows(container, false) };
            if (period === 'free') {
                const cap = parseFloat($('tou_free_cap').value);
                if (cap > 0) settings.capKwh = cap;
            }
            return settings;
        };

        if (rateType === 'flat') {
            return {
                rateType: 'flat',
                daily: parseFloat($('dailyConnectionRate').value),
                flat: parseFloat($('otherSupplierRate').value),
                cl: parseFloat($('otherSupplierControlledLoadFlat').value) || 0,
                feedIn: parseFloat($('otherSupplierFeedInRateFlat').value),
                feedInWindows,
                demand: demandConfig,
                clock,
                timeZone
            };
        }
        return {
            rateType: 'tou',
            daily: parseFloat($('dailyConnectionRate').value),
            feedIn: parseFloat($('otherSupplierFeedInRateTou').value),
            cl: parseFloat($('tou_controlled_load_rate').value),
            feedInWindows,
            tou: TOU_PERIODS.reduce((tou, period) => {
                const settings = getPeriodSettings(period);
                if (OPTIONAL_TOU_PERIODS.indexOf(period) === -1 || (settings.windows && settings.windows.length)) {
                    tou[period] = settings;
                }
                return tou;
            }, {}),
            demand: demandConfig,
            clock,
            timeZone
        };
    }

    function applyFeedInWindows(windows) {
        const container = $('feedInWindowsContainer');
        container.innerHTML = '';
        const list = windows || [];
        $('enableFeedInTou').checked = list.length > 0;
        $('feedInWindowsSection').classList.toggle('hidden', list.length === 0);
        list.forEach((win) => addWindowRow(container, win, true));
    }

    // The fingerprint of the built-in plan the form was last filled from (Amber.templateSignature).
    const PLAN_SIGNATURE_KEY = 'selectedPlanSig';

    /**
     * Fill the plan form from the selected plan. opts.planOnly: save just the plan form (used
     * while the page is still loading, before the site and Amber's charges are in their fields).
     */
    function applyPlanTemplate(opts) {
        const stateCode = $('stateSelector').value;
        const planName = $('planSelector').value;
        if (!stateCode || !planName) {
            if (planName === '') clearPlanInputs();
            return;
        }
        const template = state.templates[stateCode][planName];
        if (!template) return;
        localStorage.setItem(PLAN_SIGNATURE_KEY, Amber.templateSignature(template));

        $('planName').value = planName;
        updateOtherSupplierHeading();
        document.querySelector(`input[name="rateType"][value="${template.rateType}"]`).checked = true;

        if (template.rateType === 'tou') {
            $('flatRateSection').classList.add('hidden');
            $('touRateSection').classList.remove('hidden');
            $('otherSupplierFeedInRateTou').value = template.feedIn || 0;
            $('tou_controlled_load_rate').value = template.cl || 0;
            TOU_PERIODS.forEach((period) => {
                const periodConfig = template.tou && template.tou[period];
                if (period !== 'offpeak') {
                    const windowsContainer = $(`tou_${period}_windows_container`);
                    if (windowsContainer) windowsContainer.innerHTML = '';
                }
                if (period === 'free') {
                    $('tou_free_cap').value = periodConfig && periodConfig.capKwh ? periodConfig.capKwh : '';
                }
                if (!periodConfig) {
                    $(`tou_${period}_rate`).value = 0;
                    return;
                }
                $(`tou_${period}_rate`).value = periodConfig.rate || 0;
                if (period !== 'offpeak') {
                    if (periodConfig.windows && periodConfig.windows.length > 0) {
                        periodConfig.windows.forEach((win) => addTouWindow(period, win));
                    } else if (periodConfig.start) {
                        addTouWindow(period, { start: periodConfig.start, end: periodConfig.end, days: periodConfig.days });
                    }
                }
            });
        } else {
            $('flatRateSection').classList.remove('hidden');
            $('touRateSection').classList.add('hidden');
            $('otherSupplierRate').value = template.flat || 0;
            $('otherSupplierFeedInRateFlat').value = template.feedIn || 0;
            $('otherSupplierControlledLoadFlat').value = template.cl || 0;
        }

        $('dailyConnectionRate').value = template.daily || 0;
        applyFeedInWindows(template.feedInWindows || []);

        const demand = template.demand || { e: false };
        $('enableDemandTariff').checked = demand.e;
        if (demand.e) {
            $('demandTariffInputs').classList.remove('hidden');
            $('demandRate').value = demand.r || 0;
            $('demandWindowStart').value = demand.s || '16:00';
            $('demandWindowEnd').value = demand.f || '21:00';
            $('demandDaysContainer').querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                cb.checked = (demand.days || []).includes(parseInt(cb.value, 10));
            });
        } else {
            $('demandTariffInputs').classList.add('hidden');
        }
        if (opts && opts.planOnly) savePlanSettings();
        else saveAllSettings();
    }

    function clearPlanInputs() {
        localStorage.removeItem(PLAN_SIGNATURE_KEY);
        $('planName').value = '';
        updateOtherSupplierHeading();
        document.querySelector('input[name="rateType"][value="flat"]').checked = true;
        $('flatRateSection').classList.remove('hidden');
        $('touRateSection').classList.add('hidden');
        $('otherSupplierRate').value = '';
        $('otherSupplierFeedInRateFlat').value = '';
        $('otherSupplierControlledLoadFlat').value = '';
        $('dailyConnectionRate').value = '';
        TOU_PERIODS.forEach((period) => {
            const optional = OPTIONAL_TOU_PERIODS.indexOf(period) !== -1;
            $(`tou_${period}_rate`).value = optional ? 0 : '';
            if (period !== 'offpeak') {
                const windowsContainer = $(`tou_${period}_windows_container`);
                if (windowsContainer) {
                    windowsContainer.innerHTML = '';
                    if (!optional) addTouWindow(period);
                }
            }
        });
        $('tou_free_cap').value = '';
        $('tou_controlled_load_rate').value = '';
        $('otherSupplierFeedInRateTou').value = '';
        applyFeedInWindows([]);
        $('enableDemandTariff').checked = false;
        $('demandTariffInputs').classList.add('hidden');
        $('demandRate').value = '';
        $('demandWindowStart').value = '16:00';
        $('demandWindowEnd').value = '21:00';
        $('demandDaysContainer').querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
        setRatesDetailsOpen(true);
        saveAllSettings();
    }

    // ---------- Saved settings ----------

    function saveAllSettings() {
        savePlanSettings();
        if (!state.localChargesShown) app.AMBER_CHARGE_FIELDS.forEach((id) => localStorage.setItem(id, $(id).value));
        localStorage.setItem('selectedSiteId', $('siteSelector').value || '');
    }

    /** The plan form on Compare: state, plan, name and every price and time in it. */
    function savePlanSettings() {
        localStorage.setItem('rateType', document.querySelector('input[name="rateType"]:checked').value);
        localStorage.setItem('flatRate', $('otherSupplierRate').value);
        localStorage.setItem('flatFeedInRate', $('otherSupplierFeedInRateFlat').value);
        localStorage.setItem('flatControlledLoad', $('otherSupplierControlledLoadFlat').value);
        localStorage.setItem('dailyConnectionRate', $('dailyConnectionRate').value);

        const getPeriodSettings = (period) => {
            const container = document.querySelector(`[data-tou-period="${period}"]`);
            if (!container) return {};
            const rate = $(`tou_${period}_rate`).value;
            if (period === 'offpeak') return { rate };
            const settings = { rate, windows: collectWindows(container, false) };
            if (period === 'free') settings.capKwh = $('tou_free_cap').value;
            return settings;
        };
        const touConfig = {
            controlledLoad: $('tou_controlled_load_rate').value,
            feedIn: $('otherSupplierFeedInRateTou').value
        };
        TOU_PERIODS.forEach((period) => { touConfig[period] = getPeriodSettings(period); });
        localStorage.setItem('touConfig', JSON.stringify(touConfig));
        localStorage.setItem('feedInWindows', JSON.stringify(collectWindows($('feedInWindowsContainer'), true)));
        localStorage.setItem('enableFeedInTou', $('enableFeedInTou').checked ? 'true' : 'false');
        localStorage.setItem('selectedState', $('stateSelector').value);
        localStorage.setItem('selectedPlan', $('planSelector').value);
        localStorage.setItem('planName', $('planName').value);
        localStorage.setItem('demandSettings', JSON.stringify({
            enabled: $('enableDemandTariff').checked,
            rate: $('demandRate').value,
            start: $('demandWindowStart').value,
            end: $('demandWindowEnd').value,
            days: Array.from($('demandDaysContainer').querySelectorAll('input:checked')).map((cb) => parseInt(cb.value, 10))
        }));
    }

    function loadAllSettings() {
        const savedState = localStorage.getItem('selectedState') || 'NSW';
        $('stateSelector').value = savedState;
        updatePlanSelector(savedState);
        const savedPlan = localStorage.getItem('selectedPlan');
        if (savedPlan) $('planSelector').value = savedPlan;
        const savedPlanName = localStorage.getItem('planName');
        if (savedPlanName) {
            $('planName').value = savedPlanName;
            updateOtherSupplierHeading();
        }
        const savedRateType = localStorage.getItem('rateType');
        if (savedRateType === 'flat' || savedRateType === 'tou') {
            document.querySelector(`input[name="rateType"][value="${savedRateType}"]`).checked = true;
            if (savedRateType === 'tou') {
                $('flatRateSection').classList.add('hidden');
                $('touRateSection').classList.remove('hidden');
            }
        }
        const savedFlatRate = localStorage.getItem('flatRate');
        if (savedFlatRate) $('otherSupplierRate').value = savedFlatRate;
        const savedFlatFeedIn = localStorage.getItem('flatFeedInRate');
        if (savedFlatFeedIn) $('otherSupplierFeedInRateFlat').value = savedFlatFeedIn;
        const savedFlatCl = localStorage.getItem('flatControlledLoad');
        if (savedFlatCl) $('otherSupplierControlledLoadFlat').value = savedFlatCl;

        // Saved settings that can't be read (damaged, or from a much older version) are skipped,
        // leaving that part of the form as it starts out, rather than stopping the page loading.
        const config = app.storedJson('touConfig', null);
        if (config) {
            if (config.feedIn != null) $('otherSupplierFeedInRateTou').value = config.feedIn;
            if (config.controlledLoad != null) $('tou_controlled_load_rate').value = config.controlledLoad;
            const setPeriodSettings = (period, settings) => {
                if (!settings || typeof settings !== 'object') return;
                $(`tou_${period}_rate`).value = settings.rate || 0;
                if (period === 'free') $('tou_free_cap').value = settings.capKwh || '';
                if (period !== 'offpeak') {
                    const windowsContainer = $(`tou_${period}_windows_container`);
                    if (windowsContainer) windowsContainer.innerHTML = '';
                    if (settings.windows && settings.windows.length > 0) {
                        settings.windows.forEach((win) => addTouWindow(period, win));
                    } else if (settings.start) {
                        addTouWindow(period, { start: settings.start, end: settings.end, days: settings.days });
                    } else if (OPTIONAL_TOU_PERIODS.indexOf(period) === -1) {
                        addTouWindow(period);
                    }
                }
            };
            TOU_PERIODS.forEach((period) => setPeriodSettings(period, config[period]));
        }

        const savedDaily = localStorage.getItem('dailyConnectionRate');
        if (savedDaily) $('dailyConnectionRate').value = savedDaily;
        app.loadAmberChargeFields();

        const settings = app.storedJson('demandSettings', null);
        if (settings) {
            $('enableDemandTariff').checked = !!settings.enabled;
            if (settings.rate != null) $('demandRate').value = settings.rate;
            if (settings.start) $('demandWindowStart').value = settings.start;
            if (settings.end) $('demandWindowEnd').value = settings.end;
            if (settings.enabled) $('demandTariffInputs').classList.remove('hidden');
            const days = Array.isArray(settings.days) ? settings.days : [];
            $('demandDaysContainer').querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                cb.checked = days.includes(parseInt(cb.value, 10));
            });
        }

        const feedInWindows = app.storedJson('feedInWindows', []).filter((win) => win && typeof win === 'object');
        if (localStorage.getItem('enableFeedInTou') === 'true' || feedInWindows.length) {
            applyFeedInWindows(feedInWindows);
        }

        // The saved form was filled from a built-in plan whose published prices have changed since
        // (a newer version of the app): fill it again, so old prices can't stay under the plan's
        // name. Prices the user changed themselves are kept until the plan itself changes.
        const plan = $('planSelector').value;
        if (plan && isBuiltInPlan(savedState, plan)
            && localStorage.getItem(PLAN_SIGNATURE_KEY) !== Amber.templateSignature(state.templates[savedState][plan])) {
            applyPlanTemplate({ planOnly: true });
        }
    }

    // ---------- Plans the user typed in ----------

    function mergeCustomPlans() {
        const customPlans = storedCustomPlans();
        Object.keys(customPlans).forEach((stateCode) => {
            if (!state.templates[stateCode]) state.templates[stateCode] = {};
            Object.keys(customPlans[stateCode]).forEach((planName) => {
                state.templates[stateCode][planName] = customPlans[stateCode][planName];
            });
        });
    }

    /** Plans the user typed in, by state: { NSW: { 'My plan': { rateType, ... } } }. Damaged entries are left out. */
    function storedCustomPlans() {
        const saved = app.storedJson('customSupplierPlans', {});
        const out = {};
        Object.keys(saved).forEach((stateCode) => {
            const plans = saved[stateCode];
            if (!plans || typeof plans !== 'object' || Array.isArray(plans)) return;
            Object.keys(plans).forEach((name) => {
                const plan = plans[name];
                if (!plan || typeof plan !== 'object' || (plan.rateType !== 'flat' && plan.rateType !== 'tou')) return;
                (out[stateCode] || (out[stateCode] = {}))[name] = plan;
            });
        });
        return out;
    }

    function saveCustomPlan() {
        const stateCode = $('stateSelector').value;
        const planName = $('planName').value.trim();
        if (!stateCode || !planName) return;
        if (isBuiltInPlan(stateCode, planName)) return;
        const plan = createPlanObjectFromForm();
        const customPlans = storedCustomPlans();
        if (!customPlans[stateCode]) customPlans[stateCode] = {};
        customPlans[stateCode][planName] = plan;
        localStorage.setItem('customSupplierPlans', JSON.stringify(customPlans));
        if (!state.templates[stateCode]) state.templates[stateCode] = {};
        state.templates[stateCode][planName] = plan;
        updatePlanSelector(stateCode);
        $('planSelector').value = planName;
    }

    // ---------- Wiring ----------

    /** Wire up the plan form on Compare. Runs once, after loadAllSettings has filled it. */
    function setupPlanForm() {
        if (!$('tou_peak_windows_container').children.length) addTouWindow('peak');
        if (!$('tou_shoulder_windows_container').children.length) addTouWindow('shoulder');
        setRatesDetailsOpen(localStorage.getItem('ratesDetailsOpen') === 'true', false);

        $('ratesDetailsToggle').addEventListener('click', (e) => {
            e.preventDefault();
            setRatesDetailsOpen($('ratesDetails').classList.contains('hidden'));
        });
        $('stateSelector').addEventListener('change', (e) => {
            // A plan from the old state gives way to the new state's usual plan (or to blank own
            // rates when the state has none for this network); rates typed in by hand stay.
            state.stateChosenByHand = true;
            updatePlanSelector(e.target.value);
            saveAllSettings();
            if (state.cachedChannelData && state.lastFetchedStartDate && !state.fetching) app.recalculateAndShow(false);
            else app.updatePlanSavings();
        });
        $('planSelector').addEventListener('change', () => {
            selectSupplierPlan($('planSelector').value, { fromChange: true });
        });
        $('planName').addEventListener('input', () => {
            updateOtherSupplierHeading();
            saveAllSettings();
        });
        $('enableDemandTariff').addEventListener('change', (e) => {
            $('demandTariffInputs').classList.toggle('hidden', !e.target.checked);
            saveAllSettings();
        });
        $('enableFeedInTou').addEventListener('change', (e) => {
            $('feedInWindowsSection').classList.toggle('hidden', !e.target.checked);
            if (e.target.checked && !$('feedInWindowsContainer').children.length) {
                addWindowRow($('feedInWindowsContainer'), { start: '15:00', end: '21:00', days: [1, 2, 3, 4, 5, 6, 0], rate: 10 }, true);
            }
            saveAllSettings();
        });
        $('addFeedInWindowBtn').addEventListener('click', () => {
            addWindowRow($('feedInWindowsContainer'), { start: '15:00', end: '21:00', days: [1, 2, 3, 4, 5, 6, 0], rate: 10 }, true);
            saveAllSettings();
        });
        document.querySelectorAll('[data-add-tou-window]').forEach((btn) => {
            btn.addEventListener('click', () => addTouWindow(btn.getAttribute('data-add-tou-window')));
        });
        // Every other box in the plan form, and on the Start tab's account card, saves as it is typed in.
        document.querySelectorAll('#planChooser input, #planChooser select, #setupSection input').forEach((el) => {
            if (el.type === 'file' || ['stateSelector', 'planSelector', 'planName', 'apiKey', 'rememberApiKey', 'siteSelector'].includes(el.id)) return;
            el.addEventListener('input', saveAllSettings);
        });
        $('rateTypeSelector').addEventListener('change', () => {
            const selectedType = document.querySelector('input[name="rateType"]:checked').value;
            $('flatRateSection').classList.toggle('hidden', selectedType !== 'flat');
            $('touRateSection').classList.toggle('hidden', selectedType !== 'tou');
            saveAllSettings();
        });
        const cdrInput = $('cdrPlanFile');
        if (cdrInput) {
            cdrInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                const status = $('cdrPlanStatus');
                const setStatus = (msg, err) => {
                    if (!status) return;
                    status.textContent = msg;
                    status.className = `text-xs ${err ? 'text-red-700' : 'text-green-700'}`;
                };
                file.text().then((text) => {
                    const parsed = Amber.parseCdrPlan(text);
                    if (!parsed || !parsed.ok) {
                        setStatus((parsed && parsed.error) || 'Could not read that plan JSON.', true);
                        return;
                    }
                    const stateCode = parsed.state || $('stateSelector').value || 'NSW';
                    if ($('stateSelector').value !== stateCode) $('stateSelector').value = stateCode;
                    if (!state.templates[stateCode]) state.templates[stateCode] = {};
                    state.templates[stateCode][parsed.name] = parsed.plan;
                    const customPlans = storedCustomPlans();
                    if (!customPlans[stateCode]) customPlans[stateCode] = {};
                    customPlans[stateCode][parsed.name] = parsed.plan;
                    localStorage.setItem('customSupplierPlans', JSON.stringify(customPlans));
                    updatePlanSelector(stateCode);
                    selectSupplierPlan(parsed.name, { fromChange: true });
                    setStatus(`Imported "${parsed.name}" (${stateCode}).`, false);
                }).catch(() => {
                    setStatus('Could not read that file.', true);
                }).finally(() => {
                    cdrInput.value = '';
                });
            });
        }
    }

    // What the other app-*.js files use from this one.
    Object.assign(app, {
        visiblePlanNames, updatePlanSelector, isBuiltInPlan, selectSupplierPlan,
        createPlanObjectFromForm, clearPlanInputs, saveAllSettings, loadAllSettings,
        mergeCustomPlans, storedCustomPlans, saveCustomPlan, setupPlanForm
    });

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
