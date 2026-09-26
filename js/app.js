(function (root) {
    const Amber = root.Amber = root.Amber || {};

    const state = {
        templates: Amber.cloneTemplates(),
        originalTemplates: Amber.cloneTemplates(),
        cachedChannelData: null,
        cachedAllChannelData: null,
        dailySummaries: {},
        demandInfoForTooltip: null,
        lastFetchedStartDate: null,
        lastFetchedEndDate: null,
        lastFetchTimestamp: null,
        lastFetchedSiteId: null,
        usageChart: null,
        dailyUsageChart: null,
        currentSiteId: null,
        sites: [],
        sitesApiKey: null,
        lastResultDataPayload: null,
        amberCostBaseline: null,
        fetching: false
    };

    const configElements = {};

    function $(id) {
        return document.getElementById(id);
    }

    function gstInclusive() {
        const toggle = $('gstToggle');
        return !toggle || toggle.checked;
    }

    function readAmberRates() {
        return {
            connectionCents: parseFloat($('amberConnectionRate').value) || Amber.DEFAULT_AMBER_CONNECTION_CENTS,
            subscriptionCents: parseFloat($('amberSubscriptionRate').value) || Amber.DEFAULT_AMBER_SUBSCRIPTION_CENTS,
            demandCents: parseFloat($('amberDemandRate').value) || Amber.DEFAULT_AMBER_DEMAND_CENTS
        };
    }

    function setAmberBillStatus(message, isError) {
        const el = $('amberBillStatus');
        if (!el) return;
        if (!message) {
            el.classList.add('hidden');
            el.textContent = '';
            return;
        }
        el.classList.remove('hidden');
        el.classList.toggle('text-red-700', !!isError);
        el.classList.toggle('text-green-700', !isError);
        el.textContent = message;
    }

    function loadPdfJs() {
        if (root.pdfjsLib) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'pdf.min.js';
            script.onload = () => {
                if (root.pdfjsLib && root.pdfjsLib.GlobalWorkerOptions) {
                    root.pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
                }
                resolve();
            };
            script.onerror = () => reject(new Error('Could not load the PDF reader.'));
            document.head.appendChild(script);
        });
    }

    function applyAmberBillRates(parsed) {
        if (!parsed || !parsed.ok) {
            setAmberBillStatus('Could not find daily connection, subscription or demand rates in that file. You can type them from the charges page.', true);
            return;
        }
        if (parsed.connectionCents != null) $('amberConnectionRate').value = parsed.connectionCents.toFixed(3);
        if (parsed.subscriptionCents != null) $('amberSubscriptionRate').value = parsed.subscriptionCents.toFixed(3);
        if (parsed.demandCents != null) $('amberDemandRate').value = parsed.demandCents.toFixed(3);
        saveAllSettings();
        const gstNote = parsed.exGst ? ' Bill unit prices were ex GST; 10% GST was added.' : '';
        setAmberBillStatus(`Prefill (inc GST): ${parsed.found.join(', ')}.${gstNote} Edit the fields if a line looks wrong.`, false);
        if (state.cachedChannelData && state.lastFetchedStartDate) recalculateAndShow(true);
    }

    async function handleAmberBillFile(file) {
        if (!file) return;
        setAmberBillStatus('Reading bill…', false);
        try {
            const text = await Amber.readBillFile(file, loadPdfJs);
            applyAmberBillRates(Amber.parseAmberBillText(text));
        } catch (err) {
            setAmberBillStatus(err && err.message ? err.message : 'Could not read that file.', true);
        } finally {
            const input = $('amberBillFile');
            if (input) input.value = '';
        }
    }

    function currentStateCode() {
        return $('stateSelector').value;
    }

    function collectWindows(container, includeRate) {
        if (!container) return [];
        return Array.from(container.querySelectorAll('.tou-window')).map((win) => {
            const row = {
                start: win.querySelector('.tou-start').value,
                end: win.querySelector('.tou-end').value,
                days: Array.from(win.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => parseInt(cb.value, 10))
            };
            if (includeRate) {
                row.rate = parseFloat(win.querySelector('.tou-rate').value) || 0;
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
        const rateField = includeRate
            ? `<div class="mt-1"><label class="text-xs font-medium text-gray-600">Rate (c/kWh, published)</label><input type="number" step="0.0001" class="tou-rate w-full text-xs p-1 border border-gray-300 rounded" value="${rateVal}"></div>`
            : '';
        windowDiv.innerHTML = `
            <button type="button" class="absolute top-1 right-1 text-gray-400 hover:text-red-500 font-bold px-1" title="Remove" data-remove-window="1" aria-label="Remove window">×</button>
            <div class="grid grid-cols-2 gap-2 pr-6">
                <div><label class="text-xs font-medium text-gray-600">Start</label><input type="time" class="tou-start w-full text-xs p-1 border border-gray-300 rounded" value="${startVal}"></div>
                <div><label class="text-xs font-medium text-gray-600">End</label><input type="time" class="tou-end w-full text-xs p-1 border border-gray-300 rounded" value="${endVal}"></div>
            </div>
            ${rateField}
            <div class="mt-1 text-[10px] font-medium text-gray-600">Days:</div>
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
        label.textContent = open ? 'Hide comparison plan rates' : 'Show comparison plan rates';
        if (persist !== false) localStorage.setItem('ratesDetailsOpen', open ? 'true' : 'false');
    }

    function updateConfigVisibility(isHidden, animate) {
        const { configContent, configDetails, toggleConfigBtn, configChevron } = configElements;
        const collapsible = configDetails || configContent;
        if (!collapsible) return;
        if (animate) collapsible.classList.add('transition-all', 'duration-300', 'ease-in-out');
        else collapsible.classList.remove('transition-all', 'duration-300', 'ease-in-out');

        if (isHidden) {
            collapsible.classList.add('hidden');
            toggleConfigBtn.querySelector('span').textContent = 'Show';
            configChevron.style.transform = 'rotate(180deg)';
        } else {
            collapsible.classList.remove('hidden');
            toggleConfigBtn.querySelector('span').textContent = 'Hide';
            configChevron.style.transform = 'rotate(0deg)';
        }
    }

    function updateOtherSupplierHeading() {
        const planName = $('planName').value.trim();
        $('otherSupplierHeading').textContent = planName ? `${planName} Details` : 'Other Supplier Details';
    }

    function currentSiteNetwork() {
        const site = selectedSite();
        return site && site.network ? site.network : '';
    }

    function visiblePlanNames(selectedState) {
        const plans = state.templates[selectedState] || {};
        const siteNetwork = currentSiteNetwork();
        return Object.keys(plans).filter((planName) =>
            Amber.planMatchesNetwork(planName, plans[planName], siteNetwork)
        );
    }

    function updatePlanSelector(selectedState) {
        const planSelector = $('planSelector');
        const previous = planSelector.value;
        planSelector.innerHTML = '<option value="">-- Custom --</option>';
        const names = visiblePlanNames(selectedState);
        names.forEach((planName) => {
            const option = document.createElement('option');
            option.value = planName;
            option.textContent = Amber.planListLabel(planName, currentSiteNetwork());
            if (!state.originalTemplates[selectedState] || !state.originalTemplates[selectedState][planName]) {
                option.style.color = '#1a56db';
            }
            planSelector.appendChild(option);
        });
        if (previous === '' || names.indexOf(previous) !== -1) {
            planSelector.value = previous;
            return;
        }
        const hintName = Amber.hintPlanForNetwork(currentSiteNetwork());
        if (hintName && names.indexOf(hintName) !== -1) {
            planSelector.value = hintName;
        } else if (names.length) {
            planSelector.value = names[0];
        }
        if (planSelector.value && planSelector.value !== previous) {
            applyPlanTemplate();
        }
    }

    function isBuiltInPlan(stateCode, planName) {
        return !!(state.originalTemplates[stateCode] && state.originalTemplates[stateCode][planName]);
    }

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
        const stateCode = currentStateCode();
        const selectedPlan = $('planSelector').value;
        const template = selectedPlan && state.templates[stateCode] ? state.templates[stateCode][selectedPlan] : null;
        const clock = (template && template.clock) || 'local';
        const timeZone = (template && template.timeZone) || Amber.STATE_TIMEZONES[stateCode];

        const getPeriodSettings = (period) => {
            const container = document.querySelector(`[data-tou-period="${period}"]`);
            if (!container) return {};
            const rate = parseFloat($(`tou_${period}_rate`).value);
            if (period === 'offpeak') return { rate };
            return { rate, windows: collectWindows(container, false) };
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
            tou: {
                peak: getPeriodSettings('peak'),
                shoulder: getPeriodSettings('shoulder'),
                offpeak: getPeriodSettings('offpeak')
            },
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

    function applyPlanTemplate() {
        const stateCode = $('stateSelector').value;
        const planName = $('planSelector').value;
        if (!stateCode || !planName) {
            if (planName === '') clearPlanInputs();
            return;
        }
        const template = state.templates[stateCode][planName];
        if (!template) return;

        $('planName').value = planName;
        updateOtherSupplierHeading();
        document.querySelector(`input[name="rateType"][value="${template.rateType}"]`).checked = true;

        if (template.rateType === 'tou') {
            $('flatRateSection').classList.add('hidden');
            $('touRateSection').classList.remove('hidden');
            $('otherSupplierFeedInRateTou').value = template.feedIn || 0;
            $('tou_controlled_load_rate').value = template.cl || 0;
            ['peak', 'shoulder', 'offpeak'].forEach((period) => {
                const periodConfig = template.tou && template.tou[period];
                if (period !== 'offpeak') {
                    const windowsContainer = $(`tou_${period}_windows_container`);
                    if (windowsContainer) windowsContainer.innerHTML = '';
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
        saveAllSettings();
    }

    function clearPlanInputs() {
        $('planName').value = '';
        updateOtherSupplierHeading();
        document.querySelector('input[name="rateType"][value="flat"]').checked = true;
        $('flatRateSection').classList.remove('hidden');
        $('touRateSection').classList.add('hidden');
        $('otherSupplierRate').value = '';
        $('otherSupplierFeedInRateFlat').value = '';
        $('otherSupplierControlledLoadFlat').value = '';
        $('dailyConnectionRate').value = '';
        ['peak', 'shoulder', 'offpeak'].forEach((period) => {
            $(`tou_${period}_rate`).value = '';
            if (period !== 'offpeak') {
                const windowsContainer = $(`tou_${period}_windows_container`);
                if (windowsContainer) {
                    windowsContainer.innerHTML = '';
                    addTouWindow(period);
                }
            }
        });
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

    function saveAllSettings() {
        localStorage.setItem('rateType', document.querySelector('input[name="rateType"]:checked').value);
        localStorage.setItem('flatRate', $('otherSupplierRate').value);
        localStorage.setItem('flatFeedInRate', $('otherSupplierFeedInRateFlat').value);
        localStorage.setItem('flatControlledLoad', $('otherSupplierControlledLoadFlat').value);
        localStorage.setItem('dailyConnectionRate', $('dailyConnectionRate').value);
        localStorage.setItem('amberConnectionRate', $('amberConnectionRate').value);
        localStorage.setItem('amberSubscriptionRate', $('amberSubscriptionRate').value);
        localStorage.setItem('amberDemandRate', $('amberDemandRate').value);

        const getPeriodSettings = (period) => {
            const container = document.querySelector(`[data-tou-period="${period}"]`);
            if (!container) return {};
            const rate = $(`tou_${period}_rate`).value;
            if (period === 'offpeak') return { rate };
            return { rate, windows: collectWindows(container, false) };
        };
        const touConfig = {
            peak: getPeriodSettings('peak'),
            shoulder: getPeriodSettings('shoulder'),
            offpeak: getPeriodSettings('offpeak'),
            controlledLoad: $('tou_controlled_load_rate').value,
            feedIn: $('otherSupplierFeedInRateTou').value
        };
        localStorage.setItem('touConfig', JSON.stringify(touConfig));
        localStorage.setItem('feedInWindows', JSON.stringify(collectWindows($('feedInWindowsContainer'), true)));
        localStorage.setItem('enableFeedInTou', $('enableFeedInTou').checked ? 'true' : 'false');
        localStorage.setItem('selectedState', $('stateSelector').value);
        localStorage.setItem('selectedPlan', $('planSelector').value);
        localStorage.setItem('planName', $('planName').value);
        localStorage.setItem('selectedSiteId', $('siteSelector').value || '');
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
        if (savedRateType) {
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

        const savedTouConfig = localStorage.getItem('touConfig');
        if (savedTouConfig) {
            const config = JSON.parse(savedTouConfig);
            $('otherSupplierFeedInRateTou').value = config.feedIn;
            $('tou_controlled_load_rate').value = config.controlledLoad;
            const setPeriodSettings = (period, settings) => {
                if (!settings) return;
                $(`tou_${period}_rate`).value = settings.rate || 0;
                if (period !== 'offpeak') {
                    const windowsContainer = $(`tou_${period}_windows_container`);
                    if (windowsContainer) windowsContainer.innerHTML = '';
                    if (settings.windows && settings.windows.length > 0) {
                        settings.windows.forEach((win) => addTouWindow(period, win));
                    } else if (settings.start) {
                        addTouWindow(period, { start: settings.start, end: settings.end, days: settings.days });
                    } else {
                        addTouWindow(period);
                    }
                }
            };
            setPeriodSettings('peak', config.peak);
            setPeriodSettings('shoulder', config.shoulder);
            setPeriodSettings('offpeak', config.offpeak);
        }

        const savedDaily = localStorage.getItem('dailyConnectionRate');
        if (savedDaily) $('dailyConnectionRate').value = savedDaily;
        const storedConn = localStorage.getItem('amberConnectionRate');
        const storedSub = localStorage.getItem('amberSubscriptionRate');
        $('amberConnectionRate').value = (!storedConn || storedConn === '109.894')
            ? Amber.DEFAULT_AMBER_CONNECTION_CENTS
            : storedConn;
        $('amberSubscriptionRate').value = (!storedSub || storedSub === '82.203')
            ? Amber.DEFAULT_AMBER_SUBSCRIPTION_CENTS
            : storedSub;
        $('amberDemandRate').value = localStorage.getItem('amberDemandRate') || Amber.DEFAULT_AMBER_DEMAND_CENTS;

        const savedDemand = localStorage.getItem('demandSettings');
        if (savedDemand) {
            const settings = JSON.parse(savedDemand);
            $('enableDemandTariff').checked = settings.enabled;
            $('demandRate').value = settings.rate;
            $('demandWindowStart').value = settings.start;
            $('demandWindowEnd').value = settings.end;
            if (settings.enabled) $('demandTariffInputs').classList.remove('hidden');
            $('demandDaysContainer').querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                cb.checked = (settings.days || []).includes(parseInt(cb.value, 10));
            });
        }

        const feedInWindows = JSON.parse(localStorage.getItem('feedInWindows') || '[]');
        if (localStorage.getItem('enableFeedInTou') === 'true' || feedInWindows.length) {
            applyFeedInWindows(feedInWindows);
        }
    }

    function mergeCustomPlans() {
        const customPlans = JSON.parse(localStorage.getItem('customSupplierPlans') || '{}');
        Object.keys(customPlans).forEach((stateCode) => {
            if (!state.templates[stateCode]) state.templates[stateCode] = {};
            Object.keys(customPlans[stateCode]).forEach((planName) => {
                state.templates[stateCode][planName] = customPlans[stateCode][planName];
            });
        });
    }

    function saveCustomPlan() {
        const stateCode = $('stateSelector').value;
        const planName = $('planName').value.trim();
        if (!stateCode || !planName) return;
        if (isBuiltInPlan(stateCode, planName)) return;
        const plan = createPlanObjectFromForm();
        const customPlans = JSON.parse(localStorage.getItem('customSupplierPlans') || '{}');
        if (!customPlans[stateCode]) customPlans[stateCode] = {};
        customPlans[stateCode][planName] = plan;
        localStorage.setItem('customSupplierPlans', JSON.stringify(customPlans));
        if (!state.templates[stateCode]) state.templates[stateCode] = {};
        state.templates[stateCode][planName] = plan;
        updatePlanSelector(stateCode);
        $('planSelector').value = planName;
    }

    function applyDatePreset(name) {
        const yesterday = Amber.localYesterday();
        const yStr = Amber.formatForInput(yesterday);
        let startStr;
        let endStr = yStr;
        if (name === '7d') {
            startStr = Amber.addDays(yStr, -6);
        } else if (name === 'thisMonth') {
            const first = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1);
            startStr = Amber.formatForInput(first);
        } else if (name === 'lastMonth') {
            const first = new Date(yesterday.getFullYear(), yesterday.getMonth() - 1, 1);
            const last = new Date(yesterday.getFullYear(), yesterday.getMonth(), 0);
            startStr = Amber.formatForInput(first);
            endStr = Amber.formatForInput(last);
        } else if (name === '3m') {
            const first = new Date(yesterday.getFullYear(), yesterday.getMonth() - 3, 1);
            const last = new Date(yesterday.getFullYear(), yesterday.getMonth(), 0);
            startStr = Amber.formatForInput(first);
            endStr = Amber.formatForInput(last);
        } else if (name === '90d') {
            startStr = Amber.addDays(yStr, -89);
        } else {
            return;
        }
        $('startDate').value = startStr;
        $('endDate').value = endStr;
        localStorage.setItem('startDate', startStr);
        localStorage.setItem('endDate', endStr);
        fetchAndCompare();
    }

    function defaultDateRange() {
        const yesterday = Amber.localYesterday();
        const first = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1);
        return { start: Amber.formatForInput(first), end: Amber.formatForInput(yesterday) };
    }

    function populateSites(sites) {
        state.sites = sites || [];
        const select = $('siteSelector');
        const row = $('siteSelectorRow');
        select.innerHTML = '';
        if (!state.sites.length) {
            row.classList.add('hidden');
            return;
        }
        row.classList.remove('hidden');
        const saved = localStorage.getItem('selectedSiteId');
        state.sites.forEach((site) => {
            const option = document.createElement('option');
            option.value = site.id;
            const nmi = site.nmi ? `NMI ${site.nmi}` : site.id;
            const network = site.network ? ` · ${site.network}` : '';
            const status = site.status && site.status !== 'active' ? ` (${site.status})` : '';
            option.textContent = `${nmi}${network}${status}`;
            select.appendChild(option);
        });
        const match = state.sites.find((s) => s.id === saved) || state.sites.find((s) => s.status === 'active') || state.sites[0];
        select.value = match.id;
        state.currentSiteId = match.id;
        updatePlanSelector(currentStateCode());
    }

    function selectedSite() {
        const id = $('siteSelector').value;
        return state.sites.find((s) => s.id === id) || state.sites[0] || null;
    }

    function destroyCharts() {
        if (state.dailyUsageChart) { state.dailyUsageChart.destroy(); state.dailyUsageChart = null; }
        if (state.usageChart) { state.usageChart.destroy(); state.usageChart = null; }
    }

    function setFetching(isFetching) {
        state.fetching = isFetching;
        const btn = $('fetchData');
        btn.disabled = isFetching;
        btn.setAttribute('aria-busy', isFetching ? 'true' : 'false');
        btn.textContent = isFetching ? 'Comparing…' : 'Compare Costs';
    }

    function showMessage(text, isError) {
        const container = $('messageContainer');
        const el = $('message');
        container.classList.remove('hidden');
        el.textContent = text;
        el.className = isError ? 'text-lg text-red-700' : 'text-lg';
    }

    function hideMessage() {
        $('messageContainer').classList.add('hidden');
    }

    function injectFakeControlledLoad(channels, usageData, startDate, endDate) {
        let clChannel = channels.find((c) => c.type === 'controlledLoad');
        if (!clChannel) {
            clChannel = { identifier: 'C', type: 'controlledLoad' };
            channels.push(clChannel);
        }
        let loopDate = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T00:00:00');
        while (loopDate <= end) {
            const dateStr = Amber.formatForInput(loopDate);
            for (let hour = 1; hour < 5; hour++) {
                for (let minute = 0; minute < 60; minute += 5) {
                    const endMinute = minute + 5;
                    const endHour = endMinute >= 60 ? hour + 1 : hour;
                    const endMin = endMinute >= 60 ? 0 : endMinute;
                    usageData.push({
                        nemTime: Amber.toNemIso(dateStr, endHour, endMin, 0),
                        date: dateStr,
                        channelIdentifier: clChannel.identifier,
                        kwh: 0.25,
                        perKwh: 15,
                        quality: 'billable',
                        tariffInformation: { demandWindow: false }
                    });
                }
            }
            loopDate.setDate(loopDate.getDate() + 1);
        }
    }

    function planTotalsOptions(planConfig, numDays, startDateStr, endDateStr) {
        return {
            startDateStr,
            endDateStr,
            numDays,
            state: currentStateCode(),
            gstInclusive: gstInclusive(),
            amberRates: readAmberRates(),
            planConfig
        };
    }

    function computeAmberDisplayTotal(channelTotals, demandTariffInfo, numDays) {
        const rates = readAmberRates();
        let total = 0;
        Object.values(channelTotals).forEach((c) => {
            total += Amber.adjustForGst(c.totalAmberCost || 0, gstInclusive(), c.type === 'feedIn');
        });
        if (demandTariffInfo && demandTariffInfo.cost > 0) {
            total += Amber.adjustForGst(demandTariffInfo.cost, gstInclusive(), false);
        }
        total += Amber.adjustForGst((rates.connectionCents * numDays) / 100, gstInclusive(), false);
        total += Amber.adjustForGst((rates.subscriptionCents * numDays) / 100, gstInclusive(), false);
        return total;
    }

    function renderAllPlansTable(channelTotals, amberTotal, startDateStr, endDateStr, numDays) {
        const section = $('allPlansSection');
        const host = $('allPlansTable');
        const stateCode = currentStateCode();
        const plans = state.templates[stateCode] || {};
        const names = Object.keys(plans).filter((planName) =>
            Amber.planMatchesNetwork(planName, plans[planName], currentSiteNetwork())
        );
        if (!names.length) {
            section.classList.add('hidden');
            return;
        }
        const selectedName = $('planSelector').value;
        const rows = names.map((name) => {
            const planConfig = name === selectedName ? createPlanObjectFromForm() : plans[name];
            const result = Amber.computePlanTotals(channelTotals, planConfig, planTotalsOptions(planConfig, numDays, startDateStr, endDateStr));
            return { name, total: result.otherTotal, asAt: Amber.templateAsAt(plans[name]) };
        }).sort((a, b) => a.total - b.total);

        let html = `<table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                    <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Estimated total</th>
                    <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">vs Amber</th>
                </tr>
            </thead><tbody class="bg-white divide-y divide-gray-200">`;
        rows.forEach((row) => {
            const diff = amberTotal - row.total;
            let vs = '≈ no difference';
            let cls = 'text-gray-600';
            if (Math.abs(diff) >= 0.01) {
                if (diff > 0) { vs = `$${diff.toFixed(2)} cheaper than Amber`; cls = 'text-red-700'; }
                else { vs = `$${Math.abs(diff).toFixed(2)} more than Amber`; cls = 'text-green-700'; }
            }
            const current = row.name === selectedName ? ' font-semibold bg-indigo-50' : '';
            html += `<tr class="cursor-pointer hover:bg-gray-50${current}" role="button" tabindex="0" title="Compare using this plan">
                <td class="px-4 py-2 text-sm text-gray-900">${Amber.escapeHTML(Amber.planListLabel(row.name, currentSiteNetwork()))}</td>
                <td class="px-4 py-2 text-sm text-right">$${row.total.toFixed(2)}</td>
                <td class="px-4 py-2 text-sm text-right ${cls}">${vs}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        host.innerHTML = html;
        host.querySelectorAll('tbody tr').forEach((tr, index) => {
            const planName = rows[index].name;
            const activate = () => selectSupplierPlan(planName, { scroll: true });
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
            recalculateAndShow(false);
            if (options.scroll) $('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            updatePlanSavings();
        }
    }

    function updatePlanSavings() {
        const planSelector = $('planSelector');
        if (!state.lastResultDataPayload) {
            for (const option of planSelector.options) {
                option.textContent = option.value
                    ? Amber.planListLabel(option.value, currentSiteNetwork())
                    : '-- Custom --';
            }
            return;
        }
        const payload = state.lastResultDataPayload;
        const amberTotal = computeAmberDisplayTotal(
            payload.channelTotals,
            payload.demandTariffInfo,
            payload.numDays
        );
        state.amberCostBaseline = amberTotal;
        const stateCode = currentStateCode();
        const selectedName = planSelector.value;
        for (const option of planSelector.options) {
            if (!option.value) {
                option.textContent = '-- Custom --';
                continue;
            }
            const planConfig = option.value === selectedName
                ? createPlanObjectFromForm()
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
                    ? ` ($${difference.toFixed(2)} cheaper)`
                    : ` ($${Math.abs(difference).toFixed(2)} more)`;
            }
            option.textContent = Amber.planListLabel(option.value, currentSiteNetwork()) + savingsText;
        }
        planSelector.value = selectedName;
    }

    function renderDailyGraph(dateStr) {
        const canvas = $('dailyChart');
        if (!canvas || !state.cachedAllChannelData && !state.cachedChannelData) return;
        if (state.dailyUsageChart) {
            state.dailyUsageChart.destroy();
            state.dailyUsageChart = null;
        }
        const data = state.cachedAllChannelData || state.cachedChannelData;
        state.dailyUsageChart = Amber.displayDailyGraph(canvas.getContext('2d'), data, dateStr, {
            planConfig: createPlanObjectFromForm(),
            state: currentStateCode(),
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
            option.textContent = dateStr;
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
        let currentDate = new Date(startDateStr + 'T00:00:00');
        const end = new Date(endDateStr + 'T00:00:00');
        while (currentDate <= end) {
            datesArray.push(Amber.formatForInput(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }
        datesArray.reverse().forEach((dateValue) => {
            const option = document.createElement('option');
            option.value = dateValue;
            option.textContent = dateValue;
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

    async function displayResults(channelTotals, startDateStr, endDateStr, numDays, demandTariffInfo, otherDemandTariffInfo, skipGraphs) {
        const planName = $('planName').value.trim() || 'Other Supplier';
        const period = `(${startDateStr} to ${endDateStr})`;
        const rates = readAmberRates();
        state.lastResultDataPayload = {
            channelTotals, startDateStr, endDateStr, numDays, demandTariffInfo, otherDemandTariffInfo
        };

        let adjustedAmberTotal = 0;
        let adjustedOtherTotal = 0;
        let projectedMonthlyCostData = null;
        const comparePlan = createPlanObjectFromForm();
        let tableHTML = `
            <p class="text-sm text-gray-500 mb-4">Period: ${numDays} days ${period}</p>
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th scope="col" class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Channel</th>
                        <th scope="col" class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Period</th>
                        <th scope="col" class="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Usage (kWh)</th>
                        <th scope="col" class="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amber</th>
                        <th scope="col" class="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">${Amber.escapeHTML(planName)}</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">`;

        Object.values(channelTotals).forEach((c) => {
            if (c.totalKWh === 0 && c.totalAmberCost === 0 && c.totalOtherCost === 0) return;
            const isFeedIn = c.type === 'feedIn';
            const rows = Amber.channelPeriodBreakdown(c, comparePlan, currentStateCode());
            const periodRows = rows.length ? rows : [{
                period: c.type === 'feedIn' ? 'feedIn' : (c.type === 'controlledLoad' ? 'controlledLoad' : 'anytime'),
                label: c.type === 'feedIn' ? 'Feed-in' : (c.type === 'controlledLoad' ? 'Controlled load' : 'Anytime'),
                kwh: c.totalKWh || 0,
                amberCost: c.totalAmberCost || 0,
                otherCost: c.totalOtherCost || 0
            }];
            let channelKwh = 0;
            let channelAmber = 0;
            let channelOther = 0;
            periodRows.forEach((row) => {
                const adjustedAmberCost = Amber.adjustForGst(row.amberCost || 0, gstInclusive(), isFeedIn);
                const adjustedOtherCost = Amber.adjustForGst(row.otherCost || 0, gstInclusive(), isFeedIn);
                adjustedAmberTotal += adjustedAmberCost;
                adjustedOtherTotal += adjustedOtherCost;
                channelKwh += row.kwh || 0;
                channelAmber += adjustedAmberCost;
                channelOther += adjustedOtherCost;
                tableHTML += `<tr>
                    <td class="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900">${Amber.escapeHTML(c.identifier)} <span class="font-normal text-gray-500">${Amber.escapeHTML(c.type)}</span></td>
                    <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-700">${Amber.escapeHTML(row.label)}</td>
                    <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-500 text-right">${(row.kwh || 0).toFixed(1)}</td>
                    <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-500 text-right">$${adjustedAmberCost.toFixed(2)}</td>
                    <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-500 text-right">${Amber.formatCentsPerKwh(row.rate)}$${adjustedOtherCost.toFixed(2)}</td>
                </tr>`;
            });
            if (c.amberExportCharge) {
                const exportAmber = Amber.adjustForGst(c.amberExportCharge, gstInclusive(), false);
                adjustedAmberTotal += exportAmber;
                channelAmber += exportAmber;
                tableHTML += `<tr>
                    <td class="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900">${Amber.escapeHTML(c.identifier)} <span class="font-normal text-gray-500">export</span></td>
                    <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-700">Export charge</td>
                    <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-500 text-right">${(c.amberExportChargeKwh || 0).toFixed(1)}</td>
                    <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-500 text-right">${Amber.formatCentsPerKwh(c.amberExportChargeRate)}$${exportAmber.toFixed(2)}</td>
                    <td class="px-3 py-3 whitespace-nowrap text-sm text-gray-500 text-right">$0.00</td>
                </tr>`;
            }
            if (periodRows.length + (c.amberExportCharge ? 1 : 0) > 1) {
                tableHTML += `<tr class="bg-gray-50 font-semibold">
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900">${Amber.escapeHTML(c.identifier)}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900">Total</td>
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right">${channelKwh.toFixed(1)}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right">$${channelAmber.toFixed(2)}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-900 text-right">$${channelOther.toFixed(2)}</td>
                </tr>`;
            }
        });

        if (demandTariffInfo && demandTariffInfo.cost > 0) {
            const adjustedDemandCost = Amber.adjustForGst(demandTariffInfo.cost || 0, gstInclusive(), false);
            adjustedAmberTotal += adjustedDemandCost;
            const maxDemandKw = ((demandTariffInfo.maxDemandKwh || 0) * 2).toFixed(2);
            const maxDemandDateTimeObj = new Date(demandTariffInfo.maxDemandTime + '+10:00');
            const maxDemandDateTime = Number.isNaN(maxDemandDateTimeObj.getTime())
                ? demandTariffInfo.maxDemandTime
                : maxDemandDateTimeObj.toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' });
            const monthOfMaxDemand = maxDemandDateTimeObj.getMonth();
            const yearOfMaxDemand = maxDemandDateTimeObj.getFullYear();
            const daysInMonth = new Date(yearOfMaxDemand, monthOfMaxDemand + 1, 0).getDate();
            const projectedMonthlyCost = (demandTariffInfo.maxDemandKwh * 2) * (rates.demandCents / 100) * daysInMonth;
            projectedMonthlyCostData = {
                cost: Amber.adjustForGst(projectedMonthlyCost, gstInclusive(), false),
                month: maxDemandDateTimeObj.toLocaleString('default', { month: 'long' })
            };
            tableHTML += `<tr class="font-semibold border-t">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900" colspan="2">
                    <span id="amber-demand-tooltip-trigger" class="cursor-help border-b border-dotted border-gray-500">Amber Demand Tariff</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                    <div class="text-xs">Max: ${maxDemandKw} kW</div>
                    <div class="text-xs text-blue-600 font-normal">on ${maxDemandDateTime}</div>
                    <div class="text-xs">X ${demandTariffInfo.demandDays} days</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">$${adjustedDemandCost.toFixed(2)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500"></td>
            </tr>`;
        }

        if (otherDemandTariffInfo && otherDemandTariffInfo.cost > 0) {
            const adjustedOtherDemandCost = Amber.adjustForGst(otherDemandTariffInfo.cost || 0, gstInclusive(), false);
            adjustedOtherTotal += adjustedOtherDemandCost;
            const maxDemandKw = ((otherDemandTariffInfo.maxDemandKwh || 0) * 2).toFixed(2);
            const maxDemandDateTime = otherDemandTariffInfo.maxDemandTime || '';
            const dayCount = otherDemandTariffInfo.applicableDaysCount || numDays;
            tableHTML += `<tr class="font-semibold border-t">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900" colspan="2">${Amber.escapeHTML(planName)} Demand Tariff</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                    <div class="text-xs">Max: ${maxDemandKw} kW</div>
                    <div class="text-xs text-blue-600 font-normal">${Amber.escapeHTML(String(maxDemandDateTime))}</div>
                    <div class="text-xs">X ${dayCount} applicable days</div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900"></td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">$${adjustedOtherDemandCost.toFixed(2)}</td>
            </tr>`;
        }

        const amberConnectionCost = Amber.adjustForGst((rates.connectionCents * numDays) / 100, gstInclusive(), false);
        const otherDailyConnection = Amber.adjustForGst(((parseFloat($('dailyConnectionRate').value) || 0) * numDays) / 100, gstInclusive(), false);
        const amberSubscriptionCost = Amber.adjustForGst((rates.subscriptionCents * numDays) / 100, gstInclusive(), false);
        adjustedAmberTotal += amberConnectionCost + amberSubscriptionCost;
        adjustedOtherTotal += otherDailyConnection;

        tableHTML += `<tr class="font-semibold border-t">
            <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-900" colspan="3">Daily Connection</td>
            <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-900 text-right">$${amberConnectionCost.toFixed(2)}</td>
            <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-900 text-right">$${otherDailyConnection.toFixed(2)}</td>
        </tr>
        <tr class="font-semibold">
            <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-900" colspan="3">Amber Subscription</td>
            <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-900 text-right">$${amberSubscriptionCost.toFixed(2)}</td>
            <td class="px-6 py-2 whitespace-nowrap text-sm text-gray-900 text-right">N/A</td>
        </tr>
        <tr class="bg-gray-50 font-bold">
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900" colspan="3">Total</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">$${adjustedAmberTotal.toFixed(2)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">$${adjustedOtherTotal.toFixed(2)}</td>
        </tr></tbody></table>`;

        const savings = adjustedOtherTotal - adjustedAmberTotal;
        let savingsSummaryHTML = '<div class="mt-6 p-4 rounded-lg text-center ';
        if (savings > 0) {
            const percent = adjustedOtherTotal > 0 ? ` (${((savings / adjustedOtherTotal) * 100).toFixed(1)}%)` : '';
            savingsSummaryHTML += `bg-green-100"><p class="text-lg font-medium text-green-800">Amber saved you <span class="font-bold">$${savings.toFixed(2)}${percent}</span> compared to <span class="italic">${Amber.escapeHTML(planName)}</span>.</p>`;
        } else if (savings < 0) {
            savingsSummaryHTML += `bg-red-100"><p class="text-lg font-medium text-red-800">It would have been <span class="font-bold">$${Math.abs(savings).toFixed(2)}</span> cheaper with <span class="italic">${Amber.escapeHTML(planName)}</span>.</p>`;
        } else {
            savingsSummaryHTML += 'bg-gray-100"><p class="text-lg font-medium text-gray-800">No material difference versus the selected plan.</p>';
        }
        savingsSummaryHTML += '</div>';
        $('results-table-container').innerHTML = tableHTML + savingsSummaryHTML;

        if (projectedMonthlyCostData) {
            const trigger = $('amber-demand-tooltip-trigger');
            if (trigger) {
                trigger.addEventListener('mouseenter', (e) => {
                    Amber.showAmberDemandTooltip(e.currentTarget, projectedMonthlyCostData.cost, projectedMonthlyCostData.month);
                });
                trigger.addEventListener('mouseleave', Amber.hideTooltip);
            }
        }

        const asAt = Amber.latestAsAtForState(currentStateCode(), state.templates);
        $('resultsDisclaimer').textContent = `All plan, custom and Amber rates are entered inc GST (GST-inclusive), as at ${asAt}. Turn inc GST off to show dollar totals excluding GST (feed-in credits are unchanged). Verify current rates with Energy Made Easy or the retailer before switching. Amber daily connection, subscription and demand rates are editable and may differ by network. Public holidays are not treated as off-peak.`;

        const estimatedDays = Object.values(state.dailySummaries).filter((s) => s && s.estimatedCount > 0).length;
        const qualityBanner = $('qualityBanner');
        if (estimatedDays > 0) {
            qualityBanner.classList.remove('hidden');
            qualityBanner.textContent = `${estimatedDays} day(s) in this range include estimated meter data (not yet billable). Recent days are often estimated.`;
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
                    planConfig: createPlanObjectFromForm(),
                    state: currentStateCode(),
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
    }

    // ---------- More stats ----------

    function currentTimeZone() {
        return Amber.STATE_TIMEZONES[currentStateCode()] || 'Australia/Sydney';
    }

    function fmt(n, dp) {
        return Number.isFinite(n) ? n.toFixed(dp == null ? 1 : dp) : '–';
    }

    function clearRetiredStatsStorage() {
        // v1.19 kept Tesla uploads and overnight settings here; v1.20 removed that section.
        try {
            localStorage.removeItem('teslaHomeLoad');
            localStorage.removeItem('nightStatsSettings');
        } catch (e) { /* ignore */ }
    }

    function renderMoreStats() {
        if (!state.cachedChannelData) return;
        const s = Amber.moreStats(state.cachedChannelData, { timeZone: currentTimeZone() });
        const section = $('moreStatsSection');
        if (!s.dayCount) { section.classList.add('hidden'); return; }
        section.classList.remove('hidden');
        const money = (v) => `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}`;
        const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(0)}%` : '–');
        const rows = [
            ['Average import price', s.avgImportCents != null ? `${s.avgImportCents.toFixed(1)} c/kWh` : '–', `${fmt(s.importKwh, 0)} kWh imported, ${money(s.importCost)} energy cost`],
            ['Average feed-in earned', s.avgExportCents != null ? `${s.avgExportCents.toFixed(1)} c/kWh` : '–', `${fmt(s.exportKwh, 0)} kWh exported, ${money(s.exportEarn)} earned`],
            ['Imported during price spikes (≥ 50c)', `${fmt(s.spikeImportKwh)} kWh`, `${money(s.spikeImportCost)} — ${pct(s.spikeImportCost, s.importCost)} of energy cost`],
            ['Exported during price spikes (≥ 50c)', `${fmt(s.spikeExportKwh)} kWh`, `${money(s.spikeExportEarn)} — ${pct(s.spikeExportEarn, s.exportEarn)} of feed-in earnings`],
            ['Imported at negative prices', `${fmt(s.negImportKwh)} kWh`, `${money(s.negImportCredit)} paid to you`],
            ['Exported at negative prices', `${fmt(s.negExportKwh)} kWh`, `${money(s.negExportCost)} cost`],
            ['Evening import (4–9 pm)', `${fmt(s.eveningImportKwh)} kWh`, `${pct(s.eveningImportKwh, s.importKwh)} of all import`],
            ['Days with (almost) no grid import', `${s.gridFreeDays} of ${s.dayCount}`, 'under 0.5 kWh imported'],
            ['Days exporting more than importing', `${s.netExportDays} of ${s.dayCount}`, '']
        ];
        $('moreStatsTable').innerHTML = `<table class="min-w-full divide-y divide-gray-200 text-sm"><tbody class="divide-y divide-gray-200">${rows.map((r) => `
            <tr>
                <td class="px-3 py-2 text-gray-900 font-medium">${Amber.escapeHTML(r[0])}</td>
                <td class="px-3 py-2 text-right text-gray-900 whitespace-nowrap">${Amber.escapeHTML(r[1])}</td>
                <td class="px-3 py-2 text-gray-500">${Amber.escapeHTML(r[2])}</td>
            </tr>`).join('')}</tbody></table>`;
    }


    async function recalculateAndShow(skipGraphs) {
        if (!state.cachedChannelData) return;
        const startDateStr = state.lastFetchedStartDate;
        const endDateStr = state.lastFetchedEndDate;
        const numDays = Amber.inclusiveDayCount(startDateStr, endDateStr);
        const planConfig = createPlanObjectFromForm();
        const rates = readAmberRates();
        Amber.applyAmberFeedInSettlement(state.cachedChannelData, selectedSite(), numDays);
        Amber.calculateOtherSupplierCosts(state.cachedChannelData, planConfig, currentStateCode());
        const otherDemand = Amber.calculateOtherDemandTariff(state.cachedChannelData, startDateStr, endDateStr, planConfig, currentStateCode());
        const demandTariffInfo = Amber.calculateDemandTariff(state.cachedChannelData, rates.demandCents);
        const { summaries, monthlyDemandInfo } = Amber.precalculateDailySummaries(
            state.cachedAllChannelData || state.cachedChannelData, planConfig, rates, currentStateCode()
        );
        state.dailySummaries = summaries;
        state.demandInfoForTooltip = monthlyDemandInfo;
        await displayResults(state.cachedChannelData, startDateStr, endDateStr, numDays, demandTariffInfo, otherDemand, skipGraphs === true);
    }

    async function fetchAndCompare() {
        if (state.fetching) return;
        saveCustomPlan();
        saveAllSettings();

        const resultsSection = $('resultsSection');
        const calendarSection = $('calendarSection');
        const downloadCsvButton = $('downloadCsvButton');
        resultsSection.classList.add('hidden');
        calendarSection.classList.add('hidden');
        $('averageGraphContainer').classList.add('hidden');
        $('dailyGraphSection').classList.add('hidden');
        $('allPlansSection').classList.add('hidden');
        $('moreStatsSection').classList.add('hidden');
        downloadCsvButton.disabled = true;
        $('results-table-container').innerHTML = '';
        destroyCharts();

        const apiKey = $('apiKey').value.trim();
        const startDateValue = $('startDate').value;
        const endDateValue = $('endDate').value;
        Amber.setApiKey(apiKey, $('rememberApiKey').checked);
        localStorage.setItem('startDate', startDateValue);
        localStorage.setItem('endDate', endDateValue);

        if (!apiKey) {
            showMessage('Please enter your Amber API key.', true);
            return;
        }
        if (!startDateValue || !endDateValue) {
            showMessage('Please select a start and end date.', true);
            return;
        }
        if (endDateValue < startDateValue) {
            showMessage('End date cannot be before the start date.', true);
            return;
        }

        const yesterday = Amber.formatForInput(Amber.localYesterday());
        const clampedEnd = endDateValue > yesterday ? yesterday : endDateValue;
        if (clampedEnd !== endDateValue) $('endDate').value = clampedEnd;
        const numDays = Amber.inclusiveDayCount(startDateValue, clampedEnd);

        setFetching(true);
        $('progressBar').style.width = '0%';

        try {
            let sites = state.sites;
            if (sites.length && state.sitesApiKey === apiKey) {
                populateSites(sites);
            } else {
                showMessage('Fetching your site details...');
                await Amber.sleep(0);
                sites = await Amber.fetchSites(apiKey);
                populateSites(sites);
                state.sitesApiKey = apiKey;
            }
            const site = selectedSite();
            if (!site) throw new Error('No sites found for this API key.');
            if (state.currentSiteId !== site.id) state.amberCostBaseline = null;
            state.currentSiteId = site.id;
            const channels = [...(site.channels || [])];
            if (!channels.length) throw new Error('No channels found for this site.');

            const cacheFresh = state.cachedChannelData
                && state.lastFetchTimestamp
                && (Date.now() - state.lastFetchTimestamp < Amber.CACHE_FRESH_MS)
                && startDateValue === state.lastFetchedStartDate
                && clampedEnd === state.lastFetchedEndDate
                && state.lastFetchedSiteId === site.id;

            if (cacheFresh) {
                hideMessage();
                await recalculateAndShow(false);
                return;
            }

            showMessage(`Site found: ${site.nmi || site.id}. Preparing to fetch usage data...`);
            await Amber.sleep(0);
            const db = await Amber.openDb();
            const rangeDates = [];
            Amber.eachDateInclusive(new Date(startDateValue + 'T00:00:00'), new Date(clampedEnd + 'T00:00:00'), (dateStr) => {
                rangeDates.push(dateStr);
            });
            const cache = await Amber.loadSiteCacheDates(db, site.id, rangeDates);
            const cacheBoundary = Amber.localYesterday();
            cacheBoundary.setDate(cacheBoundary.getDate() - (Amber.CACHE_BOUNDARY_DAYS - 1));

            const selectedUsageData = [];
            const datesToFetch = [];
            let processedDays = 0;
            Amber.eachDateInclusive(new Date(startDateValue + 'T00:00:00'), new Date(clampedEnd + 'T00:00:00'), (dateStr, dateObj) => {
                if (dateObj >= cacheBoundary) {
                    datesToFetch.push(dateStr);
                } else if (cache.byDate[dateStr]) {
                    selectedUsageData.push(...cache.byDate[dateStr]);
                    processedDays++;
                    $('progressBar').style.width = `${(processedDays / numDays) * 100}%`;
                } else {
                    datesToFetch.push(dateStr);
                }
            });

            const fetchRanges = Amber.buildFetchRanges(datesToFetch);
            const chunkErrors = [];
            let completedChunks = 0;
            const cacheWrites = [];
            const chunkResults = await Amber.mapPool(fetchRanges, Amber.FETCH_CONCURRENCY, async (range) => {
                try {
                    const data = await Amber.fetchUsageRange(apiKey, site.id, range);
                    const daysInThisRange = Amber.inclusiveDayCount(range.start, range.end);
                    processedDays += daysInThisRange;
                    completedChunks++;
                    $('progressBar').style.width = `${Math.min(100, (processedDays / numDays) * 100)}%`;
                    $('message').textContent = `Fetching data from Amber (${completedChunks}/${fetchRanges.length} chunks)...`;

                    const dailyData = {};
                    data.forEach((item) => {
                        const usageDateStr = Amber.usageDateStr(item);
                        if (!usageDateStr) return;
                        if (!dailyData[usageDateStr]) dailyData[usageDateStr] = [];
                        dailyData[usageDateStr].push(item);
                    });
                    Object.keys(dailyData).forEach((dateStr) => {
                        const dayDate = new Date(dateStr + 'T00:00:00');
                        if (dayDate < cacheBoundary) {
                            cacheWrites.push({ id: `${site.id}_${dateStr}`, data: dailyData[dateStr] });
                            cache.byDate[dateStr] = dailyData[dateStr];
                        }
                    });
                    return data;
                } catch (err) {
                    chunkErrors.push(err.message);
                    return [];
                }
            });
            if (cacheWrites.length) await Amber.setUsageDataMany(db, cacheWrites);
            chunkResults.forEach((data) => selectedUsageData.push(...data));

            const params = new URLSearchParams(root.location.search);
            if (params.has('fakeControlledLoad')) {
                injectFakeControlledLoad(channels, selectedUsageData, startDateValue, clampedEnd);
            }

            if (!selectedUsageData.length) {
                const detail = chunkErrors.length ? chunkErrors.join(' ') : 'No usage returned.';
                throw new Error(detail);
            }

            showMessage('Calculating costs...');
            await Amber.sleep(0);
            const channelTotalsSelectedPeriod = {};
            channels.forEach((c) => {
                channelTotalsSelectedPeriod[c.identifier] = Amber.emptyChannel(c);
            });

            Amber.processUsageData(selectedUsageData, channelTotalsSelectedPeriod, true);
            Object.values(channelTotalsSelectedPeriod).forEach((c) => c.usageData.sort((a, b) => a.nemTime.localeCompare(b.nemTime)));
            Amber.applyAmberFeedInSettlement(channelTotalsSelectedPeriod, site, numDays);

            const planConfig = createPlanObjectFromForm();
            const rates = readAmberRates();
            Amber.calculateOtherSupplierCosts(channelTotalsSelectedPeriod, planConfig, currentStateCode());
            const otherDemandInfo = Amber.calculateOtherDemandTariff(channelTotalsSelectedPeriod, startDateValue, clampedEnd, planConfig, currentStateCode());
            const demandTariffInfo = Amber.calculateDemandTariff(channelTotalsSelectedPeriod, rates.demandCents);
            const { summaries, monthlyDemandInfo } = Amber.precalculateDailySummaries(channelTotalsSelectedPeriod, planConfig, rates, currentStateCode());

            state.lastFetchedStartDate = startDateValue;
            state.lastFetchedEndDate = clampedEnd;
            state.lastFetchedSiteId = site.id;
            state.cachedChannelData = channelTotalsSelectedPeriod;
            state.cachedAllChannelData = channelTotalsSelectedPeriod;
            state.lastFetchTimestamp = Date.now();
            state.dailySummaries = summaries;
            state.demandInfoForTooltip = monthlyDemandInfo;

            if (chunkErrors.length) {
                showMessage(`Some days failed to load: ${chunkErrors[0]} Showing the data that did arrive.`, true);
            } else {
                hideMessage();
            }

            await displayResults(channelTotalsSelectedPeriod, startDateValue, clampedEnd, numDays, demandTariffInfo, otherDemandInfo, false);
        } catch (error) {
            console.error(error);
            state.cachedChannelData = null;
            state.dailySummaries = {};
            showMessage(`Error: ${error.message}`, true);
        } finally {
            setFetching(false);
        }
    }

    function formatBytes(bytes, decimals) {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals || 2;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    function showModal(title, bodyNode) {
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;z-index:100;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;';
        const content = document.createElement('div');
        content.className = 'bg-white rounded-lg p-5 w-11/12 max-w-xl text-gray-800';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '×';
        closeBtn.className = 'float-right text-2xl text-gray-500';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.onclick = () => document.body.removeChild(modal);
        const header = document.createElement('h2');
        header.className = 'text-xl font-bold mb-4';
        header.textContent = title;
        content.appendChild(closeBtn);
        content.appendChild(header);
        content.appendChild(bodyNode);
        modal.appendChild(content);
        modal.addEventListener('click', (e) => { if (e.target === modal) document.body.removeChild(modal); });
        document.body.appendChild(modal);
    }

    async function showStatsForRick() {
        let totalLocalStorageSize = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            totalLocalStorageSize += key.length + (localStorage.getItem(key) || '').length;
        }
        const customPlans = JSON.parse(localStorage.getItem('customSupplierPlans') || '{}');
        let planCount = 0;
        Object.keys(customPlans).forEach((s) => { planCount += Object.keys(customPlans[s]).length; });
        let storageEstimate = { usage: 'N/A', quota: 'N/A' };
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            storageEstimate.usage = formatBytes(estimate.usage);
            storageEstimate.quota = formatBytes(estimate.quota);
        }
        const wrap = document.createElement('div');
        wrap.innerHTML = `<table class="min-w-full text-sm">
            <tr><td class="py-1 font-medium">LocalStorage</td><td>${formatBytes(totalLocalStorageSize)}</td><td>${localStorage.length} keys, ${planCount} custom plans</td></tr>
            <tr><td class="py-1 font-medium">Origin storage</td><td>${storageEstimate.usage} of ${storageEstimate.quota}</td><td>Cached daily usage</td></tr>
        </table>`;
        showModal('Application storage', wrap);
    }

    function saveCustomPlansForRick() {
        const customPlans = JSON.parse(localStorage.getItem('customSupplierPlans') || '{}');
        const outputLines = [];
        Object.keys(customPlans).forEach((stateCode) => {
            Object.keys(customPlans[stateCode]).forEach((planName) => {
                outputLines.push(`"${planName}": ${JSON.stringify(customPlans[stateCode][planName])}`);
            });
        });
        if (!outputLines.length) {
            alert('No custom plans to save.');
            return;
        }
        const wrap = document.createElement('div');
        const pre = document.createElement('pre');
        pre.className = 'bg-gray-100 p-3 text-xs whitespace-pre-wrap break-all';
        pre.textContent = outputLines.join(',\n');
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'mt-3 bg-indigo-600 text-white px-3 py-2 rounded';
        copy.textContent = 'Copy to clipboard';
        copy.onclick = () => navigator.clipboard.writeText(pre.textContent);
        wrap.appendChild(pre);
        wrap.appendChild(copy);
        showModal('Custom plans for code', wrap);
    }

    function buildSettingsMenu() {
        const settingsMenu = $('settingsMenu');
        let html = `
            <button type="button" id="clearCacheBtn" class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">Clear cached data</button>
            <div class="border-t border-gray-100"></div>
            <button type="button" id="clearCustomPlansBtn" class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">Clear custom plans</button>
        `;
        const urlParams = new URLSearchParams(root.location.search);
        if (urlParams.get('name') === 'Rick') {
            html += `
                <div class="border-t border-gray-100"></div>
                <button type="button" id="saveCustomPlansForRick" class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">Save custom plans</button>
                <button type="button" id="showStatsForRick" class="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">Show stats</button>
            `;
        }
        settingsMenu.innerHTML = html;
        if (urlParams.get('name') === 'Rick') {
            $('saveCustomPlansForRick').addEventListener('click', saveCustomPlansForRick);
            $('showStatsForRick').addEventListener('click', showStatsForRick);
        }
        $('clearCustomPlansBtn').addEventListener('click', () => {
            if (!window.confirm('Delete ALL saved custom plans? This cannot be undone.')) return;
            const oldCustomPlans = JSON.parse(localStorage.getItem('customSupplierPlans') || '{}');
            localStorage.removeItem('customSupplierPlans');
            Object.keys(oldCustomPlans).forEach((stateCode) => {
                if (!state.templates[stateCode]) return;
                Object.keys(oldCustomPlans[stateCode]).forEach((planName) => {
                    if (!isBuiltInPlan(stateCode, planName)) delete state.templates[stateCode][planName];
                });
            });
            const previouslySelected = $('planSelector').value;
            updatePlanSelector($('stateSelector').value);
            if (previouslySelected && !(state.templates[$('stateSelector').value] || {})[previouslySelected]) {
                $('planSelector').value = '';
                clearPlanInputs();
            }
            const msg = $('cacheMessage');
            msg.textContent = 'Custom plans cleared successfully!';
            msg.className = 'text-sm mt-2 font-medium text-green-600';
            setTimeout(() => { msg.textContent = ''; }, 3000);
        });
        $('clearCacheBtn').addEventListener('click', async () => {
            if (!window.confirm('Clear all cached usage data? This cannot be undone.')) return;
            const msg = $('cacheMessage');
            msg.textContent = 'Clearing cache...';
            msg.className = 'text-sm mt-2 font-medium text-yellow-600';
            try {
                await Amber.deleteDatabase();
                state.cachedChannelData = null;
                state.cachedAllChannelData = null;
                state.dailySummaries = {};
                state.lastFetchedStartDate = null;
                state.lastFetchedEndDate = null;
                $('calendar-container').innerHTML = '';
                msg.textContent = 'Cache cleared successfully!';
                msg.className = 'text-sm mt-2 font-medium text-green-600';
            } catch (err) {
                if (err && err.message === 'blocked') {
                    msg.textContent = 'Cache is busy. Refresh the page and try again.';
                    msg.className = 'text-sm mt-2 font-medium text-orange-600';
                } else {
                    msg.textContent = 'Error clearing cache.';
                    msg.className = 'text-sm mt-2 font-medium text-red-600';
                }
            }
            setTimeout(() => { msg.textContent = ''; }, 4000);
        });
    }

    function init() {
        Amber.registerChartPlugins();
        mergeCustomPlans();
        const versionLabel = `Amber Compare & Export v${Amber.APP_VERSION}`;
        document.title = versionLabel;

        configElements.configHeader = $('configHeader');
        configElements.toggleConfigBtn = $('toggleConfigBtn');
        configElements.configContent = $('configContent');
        configElements.configDetails = $('configDetails');
        configElements.configChevron = $('configChevron');

        updateConfigVisibility(localStorage.getItem('configHidden') === 'true', false);
        configElements.configHeader.addEventListener('click', () => {
            const collapsible = configElements.configDetails || configElements.configContent;
            const hidden = !collapsible.classList.contains('hidden');
            updateConfigVisibility(hidden);
            localStorage.setItem('configHidden', hidden);
        });

        const storedKey = Amber.getApiKey();
        $('apiKey').value = storedKey.key;
        $('rememberApiKey').checked = storedKey.remember;

        const yesterday = Amber.formatForInput(Amber.localYesterday());
        $('startDate').setAttribute('max', yesterday);
        $('endDate').setAttribute('max', yesterday);
        const savedStart = localStorage.getItem('startDate');
        const savedEnd = localStorage.getItem('endDate');
        if (savedStart && savedEnd) {
            $('startDate').value = savedStart;
            $('endDate').value = savedEnd > yesterday ? yesterday : savedEnd;
        } else {
            const range = defaultDateRange();
            $('startDate').value = range.start;
            $('endDate').value = range.end;
        }

        Object.keys(state.templates).forEach((stateCode) => {
            const option = document.createElement('option');
            option.value = stateCode;
            option.textContent = stateCode;
            $('stateSelector').appendChild(option);
        });
        loadAllSettings();
        clearRetiredStatsStorage();
        if (!$('tou_peak_windows_container').children.length) addTouWindow('peak');
        if (!$('tou_shoulder_windows_container').children.length) addTouWindow('shoulder');
        setRatesDetailsOpen(localStorage.getItem('ratesDetailsOpen') === 'true', false);

        $('ratesDetailsToggle').addEventListener('click', (e) => {
            e.preventDefault();
            setRatesDetailsOpen($('ratesDetails').classList.contains('hidden'));
        });
        $('amberBillFile').addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) handleAmberBillFile(file);
        });
        $('stateSelector').addEventListener('change', (e) => {
            updatePlanSelector(e.target.value);
            $('planSelector').value = '';
            saveAllSettings();
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
        document.querySelectorAll('#configContent input, #configContent select').forEach((el) => {
            if (el.id !== 'stateSelector' && el.id !== 'planSelector' && el.id !== 'planName' && el.id !== 'apiKey') {
                el.addEventListener('input', saveAllSettings);
            }
        });
        $('rateTypeSelector').addEventListener('change', () => {
            const selectedType = document.querySelector('input[name="rateType"]:checked').value;
            $('flatRateSection').classList.toggle('hidden', selectedType !== 'flat');
            $('touRateSection').classList.toggle('hidden', selectedType !== 'tou');
            saveAllSettings();
        });
        $('datePresets').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-preset]');
            if (!btn) return;
            applyDatePreset(btn.getAttribute('data-preset'));
        });
        $('fetchData').addEventListener('click', fetchAndCompare);
        $('siteSelector').addEventListener('change', () => {
            state.cachedChannelData = null;
            state.lastFetchTimestamp = null;
            updatePlanSelector(currentStateCode());
            saveAllSettings();
        });
        $('rememberApiKey').addEventListener('change', () => {
            const key = $('apiKey').value.trim();
            if (key) Amber.setApiKey(key, $('rememberApiKey').checked);
            else if (!$('rememberApiKey').checked) Amber.clearApiKey();
        });
        $('gstToggle').addEventListener('change', () => {
            if (state.lastResultDataPayload) {
                displayResults(
                    state.lastResultDataPayload.channelTotals,
                    state.lastResultDataPayload.startDateStr,
                    state.lastResultDataPayload.endDateStr,
                    state.lastResultDataPayload.numDays,
                    state.lastResultDataPayload.demandTariffInfo,
                    state.lastResultDataPayload.otherDemandTariffInfo,
                    true
                );
            }
        });

        const csvMenu = $('csvDropdownMenu');
        $('downloadCsvButton').addEventListener('click', (event) => {
            event.stopPropagation();
            if (!$('downloadCsvButton').disabled) csvMenu.classList.toggle('hidden');
        });
        window.addEventListener('click', (event) => {
            if (!csvMenu.contains(event.target) && !$('downloadCsvButton').contains(event.target)) csvMenu.classList.add('hidden');
            if (!$('settingsMenu').contains(event.target) && !$('settingsBtn').contains(event.target)) {
                $('settingsMenu').classList.add('hidden');
                $('settingsBtn').setAttribute('aria-expanded', 'false');
            }
        });
        $('downloadFullIntervalCsv').addEventListener('click', (e) => {
            e.preventDefault();
            if (!state.cachedChannelData) return;
            Amber.generateFullIntervalCsv(state.cachedChannelData, state.lastFetchedStartDate, state.lastFetchedEndDate);
            csvMenu.classList.add('hidden');
        });
        $('downloadDailySummaryCsv').addEventListener('click', (e) => {
            e.preventDefault();
            Amber.generateDailySummariesCsv(state.dailySummaries, {
                amberRates: readAmberRates(),
                otherDailyCents: parseFloat($('dailyConnectionRate').value) || 0,
                startDate: state.lastFetchedStartDate,
                endDate: state.lastFetchedEndDate
            });
            csvMenu.classList.add('hidden');
        });
        $('downloadResultsTableCsv').addEventListener('click', (e) => {
            e.preventDefault();
            const table = document.querySelector('#results-table-container table');
            if (!table) return;
            Amber.generateResultsTableCsv(table, state.lastFetchedStartDate, state.lastFetchedEndDate);
            csvMenu.classList.add('hidden');
        });

        buildSettingsMenu();
        $('settingsBtn').addEventListener('click', (event) => {
            event.stopPropagation();
            const open = $('settingsMenu').classList.toggle('hidden');
            $('settingsBtn').setAttribute('aria-expanded', open ? 'false' : 'true');
        });

        async function tryLoadSites(key) {
            if (!key || key.length < 8) return;
            if (state.sites.length && state.sitesApiKey === key) return;
            try {
                const sites = await Amber.fetchSites(key);
                populateSites(sites);
                state.sitesApiKey = key;
            } catch (err) {
                /* ignore until Compare */
            }
        }
        function resetSitesIfKeyChanged(key) {
            if (state.sitesApiKey && key !== state.sitesApiKey) {
                Amber.clearSitesCache();
                state.sites = [];
                state.sitesApiKey = null;
                $('siteSelectorRow').classList.add('hidden');
            }
        }
        let siteFetchTimer = null;
        $('apiKey').addEventListener('input', () => {
            resetSitesIfKeyChanged($('apiKey').value.trim());
        });
        $('apiKey').addEventListener('blur', () => {
            const key = $('apiKey').value.trim();
            Amber.setApiKey(key, $('rememberApiKey').checked);
            resetSitesIfKeyChanged(key);
            clearTimeout(siteFetchTimer);
            siteFetchTimer = setTimeout(() => tryLoadSites(key), 200);
        });
        if (storedKey.key) tryLoadSites(storedKey.key);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    Amber._appState = state;
    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
