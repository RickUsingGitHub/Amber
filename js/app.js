(function (root) {
    const Amber = root.Amber = root.Amber || {};
    const app = Amber.app;
    const state = app.state;
    const $ = app.$;

    /*
     * The page controller's top level, loaded last: tabs, the Start tab's welcome and account
     * fields, the dates bar and Download menu, the Compare run itself (fetchAndCompare reads the
     * cache, fetches what is missing, prices it and hands the result to app-results.js), and
     * init(), which starts the page. The rest of the controller is in the app-*.js files (listed
     * in app-core.js); they share `state` and call each other through Amber.app. Amber.appApi is
     * what planner-ui.js may use. See docs/ARCHITECTURE.md.
     */

    // ---------- Tabs ----------

    const TABS = ['setup', 'compare', 'check', 'bill', 'free', 'plan'];
    const ACTIVE_TAB_KEY = 'activeTab';

    function selectTab(name, opts) {
        const tab = TABS.indexOf(name) === -1 ? 'compare' : name;
        TABS.forEach((t) => {
            const on = t === tab;
            const button = $(`tab-${t}`);
            button.setAttribute('aria-selected', on ? 'true' : 'false');
            button.tabIndex = on ? 0 : -1;
            $(`panel-${t}`).classList.toggle('hidden', !on);
        });
        state.activeTab = tab;
        if (tab !== 'setup') state.resultsTab = tab;
        // On a narrow phone with a wide font the tab bar scrolls: keep the chosen tab in view.
        const list = $('mainTabs');
        if (list.scrollWidth > list.clientWidth + 1) {
            const b = $(`tab-${tab}`);
            list.scrollLeft = Math.max(0, Math.min(b.offsetLeft - (list.clientWidth - b.offsetWidth) / 2, list.scrollWidth - list.clientWidth));
        }
        try { localStorage.setItem(ACTIVE_TAB_KEY, tab); } catch (e) { /* ignore */ }
        if (opts && opts.focus) $(`tab-${tab}`).focus();
        // Charts drawn while their tab was hidden have no size until resized.
        [state.usageChart, state.dailyUsageChart].forEach((chart) => {
            if (chart) chart.resize();
        });
        app.syncScrollHints();
        if (tab === 'bill' && state.ready) app.ensureBillLoaded({ fromTab: true });
        // The planner uses its own 12 months, so the dates bar and download tools step aside.
        if (tab === 'plan') {
            $('configSection').classList.add('hidden');
            $('resultTools').classList.add('hidden');
            if (Amber.plannerUi) Amber.plannerUi.show();
        } else if (state.planTabShown) {
            syncConnectedUi();
        }
        state.planTabShown = tab === 'plan';
    }

    function initialTab() {
        let localSelected = false;
        try { localSelected = app.loadLocalSites().some((x) => x.id === localStorage.getItem('selectedSiteId')); } catch (e) { /* ignore */ }
        if (!$('apiKey').value.trim() && !localSelected) return 'setup';
        let saved = null;
        try { saved = localStorage.getItem(ACTIVE_TAB_KEY); } catch (e) { /* ignore */ }
        return TABS.indexOf(saved) !== -1 ? saved : 'compare';
    }

    // Connected = an Amber API key, or a household imported from meter readings.
    function isConnected() {
        return !!$('apiKey').value.trim() || app.loadLocalSites().length > 0;
    }

    /** Show the welcome until there's something to look at; then the dates bar and results tools. */
    function syncConnectedUi() {
        const connected = isConnected();
        $('welcomeCard').classList.toggle('hidden', connected);
        $('connectedCard').classList.toggle('hidden', !connected);
        $('configSection').classList.toggle('hidden', !connected);
        $('resultTools').classList.toggle('hidden', !connected);
        syncResultPlaceholders();
    }

    function syncResultPlaceholders() {
        const hasResults = !$('resultsSection').classList.contains('hidden');
        const connected = isConnected();
        if (!hasResults) $('freePowerEmpty').classList.add('hidden');
        document.querySelectorAll('[data-results-placeholder]').forEach((el) => {
            el.classList.toggle('hidden', hasResults);
            if (hasResults) return;
            el.innerHTML = connected
                ? 'Pick the dates at the top (or a quick pick) and press <strong>Compare costs</strong>. Your results will show here.'
                : 'Nothing to show yet. Start on the <button type="button" data-go-start class="text-indigo-600 font-medium hover:underline">Start</button> tab: connect your Amber account, or import meter readings if you\'re not with Amber yet.';
        });
        document.querySelectorAll('[data-jump-nav]').forEach((nav) => nav.classList.toggle('hidden', !hasResults));
        document.querySelectorAll('[data-jump]').forEach((link) => {
            const target = $(link.getAttribute('data-jump'));
            link.classList.toggle('hidden', !target || target.classList.contains('hidden'));
        });
    }

    function setupStartTab() {
        $('chooseAmber').addEventListener('click', () => {
            const card = $('setupSection');
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setTimeout(() => $('apiKey').focus({ preventScroll: true }), 300);
        });
        $('chooseCurious').addEventListener('click', () => {
            $('nem12Section').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        $('goCompare').addEventListener('click', () => selectTab('compare'));
        document.addEventListener('click', (e) => {
            if (!e.target.closest) return;
            if (e.target.closest('[data-go-start]')) selectTab('setup');
            // Links to another tab from inside a tab (for example Compare to Free?).
            const goTab = e.target.closest('[data-go-tab]');
            if (goTab) {
                selectTab(goTab.getAttribute('data-go-tab'));
                $('mainTabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            // Links to a section inside generated text (the nav buttons have their own handlers).
            const jump = e.target.closest('[data-jump]:not(.jump-link)');
            if (jump && $(jump.getAttribute('data-jump'))) $(jump.getAttribute('data-jump')).scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        const list = $('glossaryList');
        list.innerHTML = (Amber.GLOSSARY || []).map(([term, key]) => `<div><dt class="font-semibold text-gray-900">${Amber.escapeHTML(term)}</dt><dd class="text-gray-600">${Amber.escapeHTML(Amber.helpText(key))}</dd></div>`).join('');
    }

    function setupTabs() {
        const list = $('mainTabs');
        TABS.forEach((t) => {
            $(`tab-${t}`).addEventListener('click', () => selectTab(t));
        });
        list.addEventListener('keydown', (e) => {
            const i = TABS.indexOf(state.activeTab);
            let next = null;
            if (e.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length];
            else if (e.key === 'ArrowLeft') next = TABS[(i + TABS.length - 1) % TABS.length];
            else if (e.key === 'Home') next = TABS[0];
            else if (e.key === 'End') next = TABS[TABS.length - 1];
            if (!next) return;
            e.preventDefault();
            selectTab(next, { focus: true });
        });
        document.querySelectorAll('[data-jump]').forEach((link) => {
            link.addEventListener('click', () => {
                const target = $(link.getAttribute('data-jump'));
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
        if (typeof MutationObserver === 'function') {
            const observer = new MutationObserver(syncResultPlaceholders);
            const watched = ['resultsSection'].concat(Array.from(document.querySelectorAll('[data-jump]')).map((l) => l.getAttribute('data-jump')));
            watched.forEach((id) => {
                if ($(id)) observer.observe($(id), { attributes: true, attributeFilter: ['class'] });
            });
        }
        syncResultPlaceholders();
        selectTab(initialTab());
    }

    // ---------- The Start tab's account fields ----------

    async function tryLoadSites(key) {
        if (!key || key.length < 8) return;
        if (state.sites.length && state.sitesApiKey === key) return;
        try {
            const sites = await Amber.fetchSites(key);
            app.populateSites(sites);
            state.sitesApiKey = key;
            app.updateCacheSummary();
        } catch (err) {
            /* ignore until Compare */
        }
    }

    function resetSitesIfKeyChanged(key) {
        if (state.sitesApiKey && key !== state.sitesApiKey) {
            Amber.clearSitesCache();
            state.sitesApiKey = null;
            state.billData = null;
            app.populateSites([]);
        }
    }

    /** Wire up the API key and Amber's fixed charges on the Start tab. */
    function setupAccount() {
        // Amber's charges change the results straight away.
        app.AMBER_CHARGE_FIELDS.forEach((id) => {
            $(id).addEventListener('change', () => {
                app.saveAllSettings();
                if (state.cachedChannelData && state.lastFetchedStartDate && !state.fetching) recalculateAndShow(true);
                else app.renderBillCheck();
            });
        });
        $('rememberApiKey').addEventListener('change', () => {
            const key = $('apiKey').value.trim();
            if (key) Amber.setApiKey(key, $('rememberApiKey').checked);
            else if (!$('rememberApiKey').checked) Amber.clearApiKey();
        });
        let siteFetchTimer = null;
        $('apiKey').addEventListener('input', () => {
            resetSitesIfKeyChanged($('apiKey').value.trim());
            syncConnectedUi();
        });
        $('apiKey').addEventListener('blur', () => {
            const key = $('apiKey').value.trim();
            Amber.setApiKey(key, $('rememberApiKey').checked);
            resetSitesIfKeyChanged(key);
            clearTimeout(siteFetchTimer);
            siteFetchTimer = setTimeout(() => tryLoadSites(key), 200);
        });
    }

    // ---------- Date quick picks ----------

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
        } else if (name === '12m') {
            const first = new Date(yesterday.getFullYear(), yesterday.getMonth() - 12, 1);
            const last = new Date(yesterday.getFullYear(), yesterday.getMonth(), 0);
            startStr = Amber.formatForInput(first);
            endStr = Amber.formatForInput(last);
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

    // ---------- The dates bar, GST switch and Download menu ----------

    /** Wire up the dates bar, the GST switch and the Download menu (which shares its closing with the settings menu). */
    function setupResultTools() {
        $('datePresets').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-preset]');
            if (!btn) return;
            applyDatePreset(btn.getAttribute('data-preset'));
        });
        $('fetchData').addEventListener('click', fetchAndCompare);
        $('gstToggle').addEventListener('change', () => {
            if (state.lastResultDataPayload) {
                app.displayResults(
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
        // Escape closes whichever menu is open and hands the keyboard back to its button.
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            if (!csvMenu.classList.contains('hidden')) {
                csvMenu.classList.add('hidden');
                $('downloadCsvButton').focus();
            }
            if (!$('settingsMenu').classList.contains('hidden')) {
                app.closeSettingsMenu();
                $('settingsBtn').focus();
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
                amberRates: app.readAmberRates(),
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
        if ($('downloadSummaryCardPng')) {
            $('downloadSummaryCardPng').addEventListener('click', (e) => {
                e.preventDefault();
                const p = state.lastResultDataPayload;
                if (!p) return;
                Amber.generateSummaryCardPng({
                    startDate: p.startDateStr,
                    endDate: p.endDateStr,
                    numDays: p.numDays,
                    planName: p.planName,
                    amberTotal: p.amberTotal,
                    otherTotal: p.otherTotal,
                    importKwh: p.importKwh,
                    exportKwh: p.exportKwh
                });
                csvMenu.classList.add('hidden');
            });
        }
        if ($('copySummaryText')) {
            $('copySummaryText').addEventListener('click', async (e) => {
                e.preventDefault();
                const p = state.lastResultDataPayload;
                if (!p) return;
                const text = Amber.formatShareSummaryText({
                    startDate: p.startDateStr,
                    endDate: p.endDateStr,
                    numDays: p.numDays,
                    planName: p.planName,
                    amberTotal: p.amberTotal,
                    otherTotal: p.otherTotal,
                    importKwh: p.importKwh,
                    exportKwh: p.exportKwh
                });
                csvMenu.classList.add('hidden');
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    try {
                        await navigator.clipboard.writeText(text);
                        app.showMessage('Copied plain-English summary to clipboard.', false);
                        return;
                    } catch { /* fallback to download */ }
                }
                Amber.downloadCSV(text, `amber_summary_${p.startDateStr}_to_${p.endDateStr}.txt`);
            });
        }

        ['whatIfEvKm', 'whatIfEvCharge', 'whatIfHotWater', 'whatIfHotWaterRun'].forEach((id) => {
            const el = $(id);
            if (!el) return;
            el.addEventListener('change', () => {
                if (state.cachedChannelData && state.lastFetchedStartDate && !state.fetching) {
                    state.monthly = null;
                    state.batteryShift = null;
                    recalculateAndShow(false);
                }
            });
        });

        root.addEventListener('resize', app.syncScrollHints);
    }

    // ---------- Compare ----------

    function setFetching(isFetching) {
        state.fetching = isFetching;
        const btn = $('fetchData');
        btn.disabled = isFetching;
        btn.setAttribute('aria-busy', isFetching ? 'true' : 'false');
        btn.textContent = isFetching ? 'Comparing…' : 'Compare costs';
    }

    function readWhatIfOpts() {
        return {
            evKm: $('whatIfEvKm') ? parseFloat($('whatIfEvKm').value) || 0 : 0,
            evCharge: $('whatIfEvCharge') ? $('whatIfEvCharge').value : 'overnight',
            hotWater: $('whatIfHotWater') ? $('whatIfHotWater').value : '',
            hotWaterRun: $('whatIfHotWaterRun') ? $('whatIfHotWaterRun').value : 'solar'
        };
    }

    async function recalculateAndShow(skipGraphs) {
        if (!state.cachedChannelData) return;
        const startDateStr = state.lastFetchedStartDate;
        const endDateStr = state.lastFetchedEndDate;
        const numDays = Amber.inclusiveDayCount(startDateStr, endDateStr);
        const planConfig = app.createPlanObjectFromForm();
        const rates = app.readAmberRates();
        Amber.applyWhatIfLoads(state.cachedChannelData, readWhatIfOpts(), app.currentStateCode());
        Amber.applyAmberFeedInSettlement(state.cachedChannelData, app.selectedSite(), numDays, { from: startDateStr, to: endDateStr });
        Amber.calculateOtherSupplierCosts(state.cachedChannelData, planConfig, app.currentStateCode());
        const otherDemand = Amber.calculateOtherDemandTariff(state.cachedChannelData, startDateStr, endDateStr, planConfig, app.currentStateCode());
        const demandTariffInfo = Amber.calculateDemandTariff(state.cachedChannelData, rates);
        const { summaries, monthlyDemandInfo } = Amber.precalculateDailySummaries(
            state.cachedAllChannelData || state.cachedChannelData, planConfig, rates, app.currentStateCode()
        );
        state.dailySummaries = summaries;
        state.demandInfoForTooltip = monthlyDemandInfo;
        await app.displayResults(state.cachedChannelData, startDateStr, endDateStr, numDays, demandTariffInfo, otherDemand, skipGraphs === true);
    }

    /**
     * A site's readings for from..to (inclusive dates): the saved days from the cache and the rest
     * from Amber, saving the final days that come back. An imported household only ever has its
     * saved days. progress({ processedDays, cachedDays, toFetch, chunks, completedChunks }) is told
     * how it is going. Used by Compare and by the bill check, which loads its own period.
     * Returns { items, cachedDays, localMissing, chunkErrors, failedRanges, cacheWriteFailed }.
     */
    async function loadReadings(site, apiKey, from, to, progress) {
        const tell = progress || (() => {});
        const db = await Amber.openDb();
        const rangeDates = [];
        Amber.eachDateInclusive(new Date(from + 'T00:00:00'), new Date(to + 'T00:00:00'), (dateStr) => {
            rangeDates.push(dateStr);
        });
        const cache = await Amber.loadSiteCacheDates(db, site.id, rangeDates);
        const emptyCutoff = Amber.emptyDayCutoff();

        const items = [];
        const datesToFetch = [];
        let processedDays = 0;
        let cachedDays = 0;
        let localMissing = 0;
        rangeDates.forEach((dateStr) => {
            const cached = cache.byDate[dateStr];
            if (site.local) {
                if (cached && cached.length) {
                    items.push(...cached);
                    cachedDays++;
                } else {
                    localMissing++;
                }
                processedDays++;
                return;
            }
            if (Amber.cachedDayUsable(cached, dateStr, emptyCutoff)) {
                items.push(...cached);
                cachedDays++;
                processedDays++;
            } else {
                datesToFetch.push(dateStr);
            }
        });

        const fetchRanges = Amber.buildFetchRanges(datesToFetch);
        const chunkErrors = [];
        const failedRanges = [];
        let completedChunks = 0;
        const report = () => tell({ processedDays, cachedDays, toFetch: datesToFetch.length, chunks: fetchRanges.length, completedChunks });
        report();
        const cacheWrites = [];
        const chunkResults = await Amber.mapPool(fetchRanges, Amber.FETCH_CONCURRENCY, async (range) => {
            try {
                const data = await Amber.fetchUsageRange(apiKey, site.id, range);
                processedDays += Amber.inclusiveDayCount(range.start, range.end);
                completedChunks++;
                report();

                const dailyData = {};
                data.forEach((item) => {
                    const usageDateStr = Amber.usageDateStr(item);
                    if (!usageDateStr) return;
                    if (!dailyData[usageDateStr]) dailyData[usageDateStr] = [];
                    dailyData[usageDateStr].push(item);
                });
                // Cache final days, and remember old days Amber has no data for.
                for (let d = range.start; d <= range.end; d = Amber.addDays(d, 1)) {
                    const dayItems = dailyData[d] || [];
                    if (Amber.isCompleteDay(dayItems) || (!dayItems.length && d < emptyCutoff)) {
                        cacheWrites.push({ id: `${site.id}_${d}`, data: dayItems });
                    }
                }
                return data;
            } catch (err) {
                chunkErrors.push(err.message);
                failedRanges.push({ range, busy: !!(err.network || err.status === 429) });
                return [];
            }
        });
        // The readings are in hand either way: if the browser can't save them (its storage is
        // full, say), carry on and say they'll download again next time.
        let cacheWriteFailed = false;
        if (cacheWrites.length) {
            try {
                await Amber.setUsageDataMany(db, cacheWrites);
            } catch (err) {
                console.error(err);
                cacheWriteFailed = true;
            }
        }
        chunkResults.forEach((data) => items.push(...data));
        return { items, cachedDays, localMissing, chunkErrors, failedRanges, cacheWriteFailed };
    }

    async function fetchAndCompare() {
        if (state.fetching) return;
        app.saveCustomPlan();
        app.saveAllSettings();

        app.hideResults();

        const apiKey = $('apiKey').value.trim();
        const startDateValue = $('startDate').value;
        const endDateValue = $('endDate').value;
        Amber.setApiKey(apiKey, $('rememberApiKey').checked);
        localStorage.setItem('startDate', startDateValue);
        localStorage.setItem('endDate', endDateValue);

        const chosen = app.selectedSite();
        const localMode = !!(chosen && chosen.local);
        if (!apiKey && !localMode) {
            selectTab('setup');
            $('apiKey').focus();
            app.showMessage('First connect your Amber account (paste your API key below), or import meter readings if you are not with Amber yet.', true);
            return;
        }
        if (!startDateValue || !endDateValue) {
            app.showMessage('Please select a start and end date.', true);
            return;
        }
        if (endDateValue < startDateValue) {
            app.showMessage('End date cannot be before the start date.', true);
            return;
        }
        if (state.activeTab === 'setup') selectTab(state.resultsTab || 'compare');

        const yesterday = Amber.formatForInput(Amber.localYesterday());
        const clampedEnd = endDateValue > yesterday ? yesterday : endDateValue;
        if (clampedEnd !== endDateValue) $('endDate').value = clampedEnd;
        const numDays = Amber.inclusiveDayCount(startDateValue, clampedEnd);

        setFetching(true);
        $('progressBar').style.width = '0%';

        try {
            let sites = state.sites;
            if (localMode) {
                // An estimated household: everything comes from its imported days, never the API.
            } else if (sites.some((s) => !s.local) && state.sitesApiKey === apiKey) {
                app.populateSites(sites);
            } else {
                app.showMessage('Fetching your site details...');
                await Amber.sleep(0);
                sites = await Amber.fetchSites(apiKey);
                app.populateSites(sites);
                state.sitesApiKey = apiKey;
            }
            const site = app.selectedSite();
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
                app.hideMessage();
                await recalculateAndShow(false);
                return;
            }

            state.monthly = null;
            app.showMessage(`Site found: ${site.nmi || site.id}. Preparing to fetch usage data...`);
            await Amber.sleep(0);
            const loaded = await loadReadings(site, apiKey, startDateValue, clampedEnd, (p) => {
                $('progressBar').style.width = `${Math.min(100, (p.processedDays / numDays) * 100)}%`;
                if (!p.chunks) return;
                const note = `${p.cachedDays} of ${numDays} days from cache; fetching ${p.toFetch} day(s) from Amber (${p.completedChunks}/${p.chunks} chunks)...`;
                if (p.completedChunks === 0) app.showMessage(note);
                else $('message').textContent = note;
            });
            const selectedUsageData = loaded.items;
            const { chunkErrors, failedRanges, localMissing, cacheWriteFailed } = loaded;

            if (!selectedUsageData.length) {
                if (localMode) throw new Error(`No imported meter data for NMI ${site.nmi} in these dates. Its data covers ${app.fmtDate(site.firstDay || '')} – ${app.fmtDate(site.lastDay || '')}.`);
                const detail = chunkErrors.length ? chunkErrors.join(' ') : 'No usage returned.';
                throw new Error(detail);
            }

            app.showMessage('Calculating costs...');
            await Amber.sleep(0);
            const channelTotalsSelectedPeriod = {};
            channels.forEach((c) => {
                channelTotalsSelectedPeriod[c.identifier] = Amber.emptyChannel(c);
            });

            Amber.processUsageData(selectedUsageData, channelTotalsSelectedPeriod, true);
            Object.values(channelTotalsSelectedPeriod).forEach((c) => c.usageData.sort((a, b) => a.nemTime.localeCompare(b.nemTime)));
            Amber.applyWhatIfLoads(channelTotalsSelectedPeriod, readWhatIfOpts(), app.currentStateCode());
            Amber.applyAmberFeedInSettlement(channelTotalsSelectedPeriod, site, numDays, { from: startDateValue, to: clampedEnd });

            const planConfig = app.createPlanObjectFromForm();
            const rates = app.readAmberRates();
            Amber.calculateOtherSupplierCosts(channelTotalsSelectedPeriod, planConfig, app.currentStateCode());
            const otherDemandInfo = Amber.calculateOtherDemandTariff(channelTotalsSelectedPeriod, startDateValue, clampedEnd, planConfig, app.currentStateCode());
            const demandTariffInfo = Amber.calculateDemandTariff(channelTotalsSelectedPeriod, rates);
            const { summaries, monthlyDemandInfo } = Amber.precalculateDailySummaries(channelTotalsSelectedPeriod, planConfig, rates, app.currentStateCode());

            state.lastFetchedStartDate = startDateValue;
            state.lastFetchedEndDate = clampedEnd;
            state.lastFetchedSiteId = site.id;
            state.cachedChannelData = channelTotalsSelectedPeriod;
            state.cachedAllChannelData = channelTotalsSelectedPeriod;
            state.lastFetchTimestamp = Date.now();
            state.dailySummaries = summaries;
            state.demandInfoForTooltip = monthlyDemandInfo;

            if (chunkErrors.length) {
                app.showMessage(failedChunksMessage(failedRanges, chunkErrors), true);
            } else if (localMode && localMissing) {
                app.showMessage(`${localMissing} of ${numDays} days have no imported meter data for NMI ${site.nmi}, so this comparison is incomplete. Fixed charges still cover the full selected period.`, true);
            } else if (cacheWriteFailed) {
                app.showMessage('Your results are below, but this browser couldn\'t save the meter readings (its storage may be full), so they will download again next time.', true);
            } else {
                app.hideMessage();
            }

            await app.displayResults(channelTotalsSelectedPeriod, startDateValue, clampedEnd, numDays, demandTariffInfo, otherDemandInfo, false);

            // Month by month loads after the main results so they appear first.
            try {
                await Amber.sleep(0);
                state.monthly = app.loadMonthlyData(channels, selectedUsageData, startDateValue, clampedEnd);
                app.renderMonthly();
            } catch (err) {
                console.error(err);
            }
        } catch (error) {
            console.error(error);
            state.cachedChannelData = null;
            state.monthly = null;
            state.dailySummaries = {};
            app.showMessage(`Error: ${error.message}`, true);
        } finally {
            setFetching(false);
            app.renderBillCheck();
        }
    }

    function failedChunksMessage(failedRanges, chunkErrors) {
        const ranges = failedRanges.map((f) => f.range).sort((a, b) => a.start.localeCompare(b.start));
        const days = ranges.reduce((n, r) => n + Amber.inclusiveDayCount(r.start, r.end), 0);
        const fmtDay = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
        const spans = ranges.map((r) => (r.start === r.end ? fmtDay(r.start) : `${fmtDay(r.start)}–${fmtDay(r.end)}`)).join(', ');
        const reason = failedRanges.some((f) => f.busy)
            ? 'Amber didn\'t respond, usually because of its limit of 50 requests per 5 minutes (shared with anything else using your Amber account).'
            : chunkErrors[0];
        return `Couldn't load ${days} day(s): ${spans}. ${reason} Totals below leave those days out. Loaded days are cached, so click Compare again in a few minutes to fill the gaps.`;
    }

    // ---------- Start-up ----------

    function clearRetiredStatsStorage() {
        // v1.19 kept Tesla uploads and overnight settings here; v1.20 removed that section.
        try {
            localStorage.removeItem('teslaHomeLoad');
            localStorage.removeItem('nightStatsSettings');
        } catch (e) { /* ignore */ }
    }

    function init() {
        Amber.registerChartPlugins();
        app.mergeCustomPlans();
        const versionLabel = `Amber Compare & Export v${Amber.APP_VERSION}`;
        document.title = versionLabel;

        const storedKey = Amber.getApiKey();
        $('apiKey').value = storedKey.key;
        $('rememberApiKey').checked = storedKey.remember;
        try { localStorage.removeItem('configHidden'); } catch (e) { /* retired */ }
        setupTabs();
        setupStartTab();

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
        app.loadAllSettings();
        app.loadShiftSettings();
        clearRetiredStatsStorage();
        app.setupImports();
        app.setupBillCheck();
        app.setupPlanForm();
        app.setupFreeTab();
        setupAccount();
        setupResultTools();
        app.setupSettingsMenu();

        app.populateSites([]);
        syncConnectedUi();
        if (storedKey.key) tryLoadSites(storedKey.key);
        state.ready = true;
        const localSelected = !!(app.selectedSite() && app.selectedSite().local);
        // With a saved key, open on this month's figures (or the saved bill's period on Bill Check).
        if (localSelected && Amber.AUTO_COMPARE) {
            const site = app.selectedSite();
            const days = [];
            for (let d = site.firstDay; d && d <= site.lastDay; d = Amber.addDays(d, 1)) days.push(d);
            const span = Amber.wholeMonthSpan(days);
            if (site.firstDay) {
                $('startDate').value = span ? span.start : site.firstDay;
                $('endDate').value = span ? span.end : site.lastDay;
            }
            fetchAndCompare();
        } else if (storedKey.key && Amber.AUTO_COMPARE) {
            applyDatePreset('thisMonth');
            if (state.activeTab === 'bill') app.ensureBillLoaded({ fromTab: true });
        }
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !navigator.webdriver && /^https?:$/.test(root.location && root.location.protocol || '')) {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        }
    }

    // What the other app-*.js files use from this one.
    Object.assign(app, {
        selectTab, syncConnectedUi, recalculateAndShow, loadReadings, fetchAndCompare,
        failedChunksMessage
    });

    // What the Solar & battery tab (planner-ui.js) reads from the rest of the app.
    Amber.appApi = {
        selectedSite: app.selectedSite,
        currentStateCode: app.currentStateCode,
        readAmberRates: app.readAmberRates,
        templates: () => state.templates,
        selectedPlanName: () => $('planSelector').value,
        selectTab
    };

    // Every file is loaded by now, so everything on Amber.app is in place before init runs.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
