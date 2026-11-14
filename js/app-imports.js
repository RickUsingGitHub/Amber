(function (root) {
    const Amber = root.Amber = root.Amber || {};
    const app = Amber.app;
    const state = app.state;
    const $ = app.$;

    /*
     * Sites and imports: the site picker (Amber's sites plus households imported here), the Amber
     * usage CSV import, and the NEM12 path for households that aren't on Amber (the parsing and
     * the Amber price estimate are in import.js and estimate.js). An imported household is a
     * "local" site kept in localStorage `localSites`, with its readings in the cache.
     */

    // ---------- Sites: Amber's, and households imported here ----------

    const LOCAL_SITES_KEY = 'localSites';

    function loadLocalSites() {
        try {
            const list = JSON.parse(localStorage.getItem(LOCAL_SITES_KEY) || '[]');
            return Array.isArray(list) ? list.filter((s) => s && s.id && s.local) : [];
        } catch (e) {
            return [];
        }
    }

    function saveLocalSites(list) {
        try { localStorage.setItem(LOCAL_SITES_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
    }

    function populateSites(sites) {
        state.sites = (sites || []).filter((s) => !s.local).concat(loadLocalSites());
        const select = $('siteSelector');
        const row = $('siteSelectorRow');
        select.innerHTML = '';
        if (!state.sites.length) {
            row.classList.add('hidden');
            syncSiteMode();
            renderLocalSites();
            if (state.ready) app.syncConnectedUi();
            return;
        }
        row.classList.remove('hidden');
        const saved = localStorage.getItem('selectedSiteId');
        state.sites.forEach((site) => {
            const option = document.createElement('option');
            option.value = site.id;
            const nmi = site.nmi ? `NMI ${site.nmi}` : site.id;
            const network = site.network ? ` · ${site.network}` : '';
            const status = site.local ? ' (not on Amber: estimate)' : (site.status && site.status !== 'active' ? ` (${site.status})` : '');
            option.textContent = `${nmi}${network}${status}`;
            select.appendChild(option);
        });
        const match = state.sites.find((s) => s.id === saved) || state.sites.find((s) => s.status === 'active') || state.sites[0];
        select.value = match.id;
        state.currentSiteId = match.id;
        syncSiteMode();
        app.updatePlanSelector(app.currentStateCode());
        renderLocalSites();
        if (state.ready) app.syncConnectedUi();
    }

    /** Amber charges and state follow the selected site: an estimated household shows its own. */
    function syncSiteMode() {
        const site = app.selectedSite();
        const local = !!(site && site.local);
        const note = $('amberChargesLocalNote');
        if (local) {
            const r = site.amberRates || {};
            state.localChargesShown = true;
            $('amberConnectionRate').value = r.connectionCents;
            $('amberSubscriptionRate').value = r.subscriptionCents;
            $('amberDemandRate').value = r.demandCents || 0;
            ['amberConnectionRatePrev', 'amberSubscriptionRatePrev', 'amberDemandRatePrev'].forEach((id) => { $(id).value = ''; });
            app.AMBER_CHARGE_FIELDS.forEach((id) => { $(id).disabled = true; });
            const e = site.estimate || {};
            const seasonal = r.demandByMonth ? ' Demand varies by month (the figure shown is the yearly average).' : '';
            note.textContent = `NMI ${site.nmi} isn't on Amber: these are Amber's estimated charges for ${site.network} tariff ${e.tariffCode} (network, metering and Amber's subscription), used for every day.${seasonal} Choose an Amber site to edit your own.`;
            note.classList.remove('hidden');
            if (e.state && $('stateSelector').value !== e.state) {
                $('stateSelector').value = e.state;
            }
        } else {
            if (state.localChargesShown) {
                state.localChargesShown = false;
                app.AMBER_CHARGE_FIELDS.forEach((id) => { $(id).disabled = false; });
                app.loadAmberChargeFields();
            }
            note.classList.add('hidden');
            // An Amber site in another state than the one showing (a new user starts on NSW), where
            // that state has no plans for the site's network: show the site's own state instead.
            // A state the user picked by hand for this site is left alone.
            const home = app.siteNetworkState(site);
            const shown = $('stateSelector').value;
            if (home && home !== shown && state.templates[home] && !state.stateChosenByHand && !app.visiblePlanNames(shown).length) {
                $('stateSelector').value = home;
                localStorage.setItem('selectedState', home);
            }
        }
    }

    function renderLocalSites() {
        const box = $('localSitesList');
        if (!box) return;
        const list = loadLocalSites();
        if (!list.length) { box.innerHTML = ''; return; }
        const current = app.selectedSite();
        box.innerHTML = `<div class="font-medium text-gray-800 mb-1">Households imported here</div><ul class="space-y-1">${list.map((s) => {
            const e = s.estimate || {};
            const active = current && current.id === s.id;
            return `<li class="flex flex-wrap items-center gap-2"><span>NMI ${Amber.escapeHTML(s.nmi)} · ${Amber.escapeHTML(s.network)} ${Amber.escapeHTML(e.tariffCode || '')} · ${app.fmtDate(s.firstDay)} – ${app.fmtDate(s.lastDay)}</span>
                ${active ? '<span class="text-xs text-green-700">(selected)</span>' : `<button type="button" data-local-use="${Amber.escapeHTML(s.id)}" class="text-xs text-indigo-600 hover:underline">Use</button>`}
                <button type="button" data-local-remove="${Amber.escapeHTML(s.id)}" class="text-xs text-red-700 hover:underline">Remove</button></li>`;
        }).join('')}</ul>`;
        box.querySelectorAll('[data-local-use]').forEach((btn) => btn.addEventListener('click', () => {
            $('siteSelector').value = btn.getAttribute('data-local-use');
            $('siteSelector').dispatchEvent(new Event('change'));
        }));
        box.querySelectorAll('[data-local-remove]').forEach((btn) => btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-local-remove');
            const wasSelected = $('siteSelector').value === id;
            saveLocalSites(loadLocalSites().filter((s) => s.id !== id));
            populateSites(state.sites);
            if (wasSelected) {
                state.cachedChannelData = null;
                state.lastFetchTimestamp = null;
                state.monthly = null;
                state.batteryShift = null;
            }
            try { await Amber.deleteSiteCache(await Amber.openDb(), id); } catch (err) { console.error(err); }
        }));
    }

    // ---------- Amber usage CSV import ----------

    function setUsageImportStatus(message, isError) {
        const el = $('usageImportStatus');
        el.classList.toggle('hidden', !message);
        el.classList.toggle('text-red-700', !!isError);
        el.classList.toggle('text-green-700', !!message && !isError);
        el.textContent = message || '';
    }

    function setUsageImportProgress(fraction) {
        const wrap = $('usageImportProgress');
        wrap.classList.toggle('hidden', fraction == null);
        $('usageImportBar').style.width = `${Math.round((fraction || 0) * 100)}%`;
    }

    async function siteForImport() {
        const key = $('apiKey').value.trim();
        if (!key) throw new Error('Add your Amber API key first, so the data can be matched to your site.');
        if (!state.sites.some((s) => !s.local) || state.sitesApiKey !== key) {
            const sites = await Amber.fetchSites(key);
            populateSites(sites);
            state.sitesApiKey = key;
        }
        const site = app.selectedSite();
        if (!site) throw new Error('No sites found for this API key.');
        if (site.local) throw new Error('The selected site is a household imported from NEM12. Choose your Amber site above, then import again.');
        return site;
    }

    async function updateCacheSummary() {
        const el = $('usageCacheSummary');
        const site = app.selectedSite();
        if (!el || !site || !root.indexedDB) return;
        try {
            const db = await Amber.openDb();
            const cache = await Amber.loadAllSiteCache(db, site.id);
            const days = cache.dates.filter((d) => cache.byDate[d] && cache.byDate[d].length).sort();
            const imported = days.filter((d) => cache.byDate[d].some((i) => i.source === 'csv')).length;
            el.textContent = days.length
                ? `Cached for this site: ${days.length} day${days.length === 1 ? '' : 's'} (${app.fmtDate(days[0])} – ${app.fmtDate(days[days.length - 1])})${imported ? `, ${imported} from imports` : ''}.`
                : '';
        } catch (err) {
            console.error(err);
        }
    }

    async function handleUsageCsvFile(file) {
        if (!file) return;
        if (state.fetching) {
            setUsageImportStatus('Wait for the Compare in progress to finish, then import again.', true);
            return;
        }
        setUsageImportStatus('Reading the file…', false);
        setUsageImportProgress(0);
        try {
            const site = await siteForImport();
            const text = await file.text();
            await Amber.sleep(0);
            const parsed = Amber.parseAmberUsageCsv(text);
            if (!parsed.ok) throw new Error(parsed.error);
            setUsageImportStatus(`Read ${parsed.rows.toLocaleString('en-AU')} intervals over ${parsed.days.length} days. Saving…`, false);
            await Amber.sleep(0);
            const db = await Amber.openDb();
            const cached = await Amber.loadSiteCacheDates(db, site.id, parsed.days);
            // The last week is left to the API, which may still revise it.
            const recentCutoff = Amber.addDays(Amber.formatForInput(Amber.localYesterday()), -6);
            const timeZone = Amber.STATE_TIMEZONES[app.currentStateCode()] || 'Australia/Sydney';
            // A tariff without a known demand window: learn it from the days Amber's API flagged.
            const learnFrom = Amber.demandWindowForSite(site) ? null : (await Amber.loadAllSiteCache(db, site.id)).byDate;
            const plan = Amber.planUsageImport(parsed, site, cached.byDate, { recentCutoff, timeZone, learnFrom });
            await Amber.writeUsageImport(db, plan.write, (f) => setUsageImportProgress(f));
            setUsageImportProgress(null);

            const written = plan.write.map((e) => e.date);
            const notes = [];
            if (written.length) notes.push(`Imported ${written.length} day${written.length === 1 ? '' : 's'} of ${parsed.intervalMinutes}-minute data (${app.fmtDate(written[0])} – ${app.fmtDate(written[written.length - 1])}).`);
            else notes.push('No new days to import.');
            if (plan.kept) notes.push(plan.kept === 1 ? '1 day already cached from Amber\'s API was kept.' : `${plan.kept} days already cached from Amber's API were kept.`);
            if (plan.recent) notes.push(plan.recent === 1 ? 'The last day is left for Amber\'s API.' : `The last ${plan.recent} days are left for Amber's API.`);
            if (plan.partial) notes.push(plan.partial === 1 ? '1 part day was skipped.' : `${plan.partial} part days were skipped.`);
            if (parsed.backup) notes.push('Original interval times, quality and demand flags restored from the backup.');
            else if (plan.demandRule && plan.demandRule.learned) notes.push(`Demand window for ${plan.demandRule.tariff}, learned from the days Amber's API flagged: ${Amber.describeDemandWindow(plan.demandRule)}.`);
            else if (plan.demandRule) notes.push(`Demand window flagged for ${plan.demandRule.tariff}: ${Amber.describeDemandWindow(plan.demandRule)}.`);
            else notes.push('No demand window is known for this site\'s tariff (and none is flagged in the days cached from Amber\'s API), so imported days carry no demand charge.');
            notes.push(...plan.notes);
            setUsageImportStatus(notes.join(' '), false);
            updateCacheSummary();

            // Compare the whole months now available.
            const span = Amber.wholeMonthSpan(written.concat(parsed.days.filter((d) => cached.byDate[d] && !written.includes(d) && d < recentCutoff)).sort());
            state.cachedChannelData = null;
            state.lastFetchTimestamp = null;
            state.monthly = null;
            state.batteryShift = null;
            if (span) {
                $('startDate').value = span.start;
                $('endDate').value = span.end;
                app.selectTab('compare');
                app.fetchAndCompare();
            }
        } catch (err) {
            console.error(err);
            setUsageImportProgress(null);
            setUsageImportStatus(err && err.message ? err.message : 'Could not import that file.', true);
        } finally {
            const input = $('usageCsvFile');
            if (input) input.value = '';
        }
    }

    // ---------- NEM12 import: households that aren't on Amber ----------

    const ROLE_LABELS = { general: 'General use', controlledLoad: 'Controlled load', feedIn: 'Feed-in (export)', ignore: 'Leave out' };

    function setNem12Status(message, isError) {
        const el = $('nem12Status');
        el.classList.toggle('hidden', !message);
        el.classList.toggle('text-red-700', !!isError);
        el.classList.toggle('text-gray-700', !isError);
        el.textContent = message || '';
    }

    function fillSelect(select, options, value) {
        select.innerHTML = '';
        options.forEach((o) => {
            const opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.label;
            select.appendChild(opt);
        });
        if (options.some((o) => o.value === value)) select.value = value;
    }

    function nem12Selection() {
        const p = state.nem12;
        const net = Amber.NETWORKS[$('nem12Network').value];
        return {
            networkKey: $('nem12Network').value,
            tariffCode: $('nem12Tariff').value,
            exportCode: $('nem12ExportRow').classList.contains('hidden') ? '' : $('nem12Export').value,
            clCode: $('nem12Controlled').value,
            greenPower: $('nem12GreenPower').checked,
            roles: p ? p.roles : {},
            net
        };
    }

    function renderNem12Options(keepTariff) {
        const p = state.nem12;
        const box = $('nem12Options');
        if (!p) { box.classList.add('hidden'); return; }
        box.classList.remove('hidden');
        const nmiKeys = Object.keys(p.parsed.nmis);
        const nmiRow = $('nem12NmiRow');
        const nmiSel = $('nem12Nmi');
        if (nmiRow && nmiSel) {
            nmiRow.classList.toggle('hidden', nmiKeys.length <= 1);
            if (nmiKeys.length > 1) {
                fillSelect(nmiSel, nmiKeys.map((k) => ({
                    value: k,
                    label: `${k} (${p.parsed.nmis[k].days.length} days)`
                })), p.parsed.nmi);
            }
        }
        const nmiData = p.parsed.nmis[p.parsed.nmi];
        // Every interval length in the file (a meter can switch from 30- to 5-minute readings).
        const lens = Array.from(new Set([].concat(...Object.values(nmiData.channels).map((c) =>
            Object.values(c.days).map((values) => 1440 / values.length))))).sort((a, b) => a - b);
        const others = nmiKeys.length - 1;
        const gaps = (nmiData.incompleteDays || []).length;
        $('nem12Summary').textContent = `NMI ${nmiData.nmi}: ${nmiData.days.length} days (${app.fmtDate(nmiData.firstDay)} – ${app.fmtDate(nmiData.lastDay)}) of ${lens.join('/')}-minute data.`
            + (gaps ? ` ${gaps} day${gaps === 1 ? '' : 's'} with missing readings left out.` : '')
            + (others ? ` ${others} other NMI${others === 1 ? '' : 's'} in the file (switch above).` : '');
        fillSelect($('nem12Network'), [{ value: '', label: 'Choose the network…' }].concat(
            Object.keys(Amber.NETWORKS).map((k) => ({ value: k, label: `${Amber.NETWORKS[k].name} (${Amber.NETWORKS[k].state})` }))), p.networkKey || '');
        const net = Amber.NETWORKS[$('nem12Network').value];
        const tariffSel = $('nem12Tariff');
        const prevTariff = keepTariff ? tariffSel.value : null;
        fillSelect(tariffSel, net ? Object.keys(net.tariffs).map((code) => ({ value: code, label: `${code}: ${net.tariffs[code].name}${code === net.defaultTariff ? ' (default)' : ''}` })) : [], prevTariff || (net && net.defaultTariff));
        tariffSel.disabled = !net;
        const tariff = net && net.tariffs[tariffSel.value];
        const hasFeedIn = Object.values(p.roles).includes('feedIn');
        const hasCl = Object.values(p.roles).includes('controlledLoad');
        const exportOptions = net ? [{ value: '', label: 'None (feed-in at the wholesale price)' }].concat(
            Object.keys(net.exportTariffs || {}).map((code) => ({ value: code, label: `${code}: ${net.exportTariffs[code].name}` }))) : [];
        fillSelect($('nem12Export'), exportOptions, net ? (net.defaultExport || '') : '');
        $('nem12ExportRow').classList.toggle('hidden', !net || !hasFeedIn || !!(tariff && tariff.export) || exportOptions.length < 2);
        // A controlled load that also runs in the day is on the second (longer-hours) tariff.
        const clCodes = net ? Object.keys(net.controlled || {}) : [];
        const clChannel = Object.values(nmiData.channels).find((c) => p.roles[c.suffix] === 'controlledLoad');
        const clGuess = clChannel && clCodes.length > 1 && Amber.nem12DaytimeShare(clChannel) > 0.1 ? clCodes[1] : (net && net.defaultControlled);
        const prevCl = keepTariff ? $('nem12Controlled').value : null;
        fillSelect($('nem12Controlled'), clCodes.map((code) => ({ value: code, label: `${code}: ${net.controlled[code].name}` })), prevCl && clCodes.includes(prevCl) ? prevCl : clGuess);
        $('nem12ControlledRow').classList.toggle('hidden', !net || !hasCl || !!(tariff && tariff.controlled));
        const rows = Object.values(nmiData.channels).map((c) => {
            const opts = Object.keys(ROLE_LABELS).map((r) => `<option value="${r}"${p.roles[c.suffix] === r ? ' selected' : ''}>${ROLE_LABELS[r]}</option>`).join('');
            return `<label class="inline-flex items-center gap-2 mr-4 mb-1">${Amber.escapeHTML(c.suffix)} (${Math.round(c.kwh).toLocaleString('en-AU')} kWh) <select data-nem12-role="${Amber.escapeHTML(c.suffix)}" class="border border-gray-300 rounded px-1 py-0.5 text-xs">${opts}</select></label>`;
        });
        $('nem12Channels').innerHTML = `<div class="mb-1 font-medium text-gray-700"><span data-help="nem12Channels" data-help-label="What each meter channel is">What each meter channel is</span></div>${rows.join('')}`;
        document.querySelectorAll('[data-nem12-role]').forEach((sel) => {
            sel.addEventListener('change', () => {
                p.roles[sel.getAttribute('data-nem12-role')] = sel.value;
                renderNem12Options(true);
            });
        });
        $('nem12Build').disabled = !net;
    }

    async function handleNem12File(file) {
        if (!file) return;
        setNem12Status('Reading the file…', false);
        try {
            const text = await file.text();
            await Amber.sleep(0);
            const parsed = Amber.parseNem12(text);
            if (!parsed.ok) throw new Error(parsed.error);
            const nmiData = parsed.nmis[parsed.nmi];
            state.nem12 = { parsed, roles: Amber.guessNem12Roles(nmiData), networkKey: Amber.networkForNmi(nmiData.nmi) || '' };
            renderNem12Options();
            setNem12Status(state.nem12.networkKey
                ? 'Check the network tariff (it is on their bill, or ask the network), then choose Estimate Amber and compare.'
                : 'Choose the electricity network and tariff, then Estimate Amber and compare.', false);
        } catch (err) {
            console.error(err);
            state.nem12 = null;
            renderNem12Options();
            setNem12Status(err && err.message ? err.message : 'Could not read that file.', true);
        } finally {
            $('nem12File').value = '';
        }
    }

    async function buildNem12Estimate() {
        const p = state.nem12;
        if (!p) return;
        if (state.fetching) {
            setNem12Status('Wait for the Compare in progress to finish, then try again.', true);
            return;
        }
        const sel = nem12Selection();
        if (!sel.net) { setNem12Status('Choose the electricity network first.', true); return; }
        const nmiData = p.parsed.nmis[p.parsed.nmi];
        $('nem12Build').disabled = true;
        try {
            setNem12Status('Loading wholesale prices…', false);
            const months = Amber.priceMonthsFor(nmiData.firstDay, Amber.addDays(nmiData.lastDay, 1));
            let prices;
            try {
                prices = await Amber.loadRegionPrices(sel.net.region, months);
            } catch (err) {
                throw new Error('Could not load wholesale prices. Open the app from its web address rather than as a file.');
            }
            setNem12Status('Pricing every interval…', false);
            await Amber.sleep(0);
            const est = Amber.estimateAmberUsage(nmiData, Object.assign({}, sel, { prices }));
            const dates = Object.keys(est.days).sort();
            if (!Object.keys(prices).length) throw new Error('Could not load wholesale prices for these dates. If the app was opened as a file, open it from its web address instead.');
            if (!dates.length) throw new Error('There are no wholesale prices for these dates yet, so nothing could be estimated.');
            const site = Amber.estimateSite(nmiData, sel);
            site.firstDay = dates[0];
            site.lastDay = dates[dates.length - 1];
            site.capCreditCents = est.summary.capCreditCents;

            const db = await Amber.openDb();
            await Amber.deleteSiteCache(db, site.id);
            await Amber.writeUsageImport(db, dates.map((d) => ({ id: `${site.id}_${d}`, data: est.days[d], date: d })));
            const list = loadLocalSites().filter((s) => s.id !== site.id);
            list.push(site);
            saveLocalSites(list);
            localStorage.setItem('selectedSiteId', site.id);
            populateSites(state.sites);
            $('siteSelector').value = site.id;
            syncSiteMode();
            app.updatePlanSelector(app.currentStateCode());
            state.cachedChannelData = null;
            state.lastFetchTimestamp = null;
            state.monthly = null;
            state.batteryShift = null;
            state.batteryDetect = null;

            const notes = [`Estimated Amber's prices for ${dates.length} days (${app.fmtDate(dates[0])} – ${app.fmtDate(dates[dates.length - 1])}) on ${sel.net.name} ${sel.tariffCode}.`];
            if (est.missingPrice.length) notes.push(`${est.missingPrice.length} day${est.missingPrice.length === 1 ? ' has' : 's have'} no wholesale prices yet and ${est.missingPrice.length === 1 ? 'was' : 'were'} left out.`);
            if (est.summary.capCreditCents > 0) notes.push(`Amber's quarterly wholesale price cap took ${Amber.money((est.summary.capCreditCents / 100))} off.`);
            notes.push('Choose their current plan on the Compare tab.');
            setNem12Status(notes.join(' '), false);

            const span = Amber.wholeMonthSpan(dates);
            $('startDate').value = span ? span.start : dates[0];
            $('endDate').value = span ? span.end : dates[dates.length - 1];
            app.selectTab('compare');
            app.fetchAndCompare();
        } catch (err) {
            console.error(err);
            setNem12Status(err && err.message ? err.message : 'Could not estimate Amber for that file.', true);
        } finally {
            $('nem12Build').disabled = false;
        }
    }

    // ---------- Wiring ----------

    /** Wire up the site picker and the Start tab's imports (Amber CSV, NEM12). */
    function setupImports() {
        $('usageCsvFile').addEventListener('change', (e) => handleUsageCsvFile(e.target.files[0]));
        $('siteSelector').addEventListener('change', () => {
            state.cachedChannelData = null;
            state.monthly = null;
            state.lastFetchTimestamp = null;
            state.batteryShift = null;
            state.billData = null;
            state.stateChosenByHand = false;
            syncSiteMode();
            app.updatePlanSelector(app.currentStateCode());
            app.saveAllSettings();
            renderLocalSites();
        });
        $('nem12File').addEventListener('change', (e) => handleNem12File(e.target.files && e.target.files[0]));
        const nmiSel = $('nem12Nmi');
        if (nmiSel) {
            nmiSel.addEventListener('change', () => {
                if (!state.nem12 || !state.nem12.parsed.nmis[nmiSel.value]) return;
                state.nem12.parsed.nmi = nmiSel.value;
                const nmiData = state.nem12.parsed.nmis[nmiSel.value];
                state.nem12.roles = Amber.guessNem12Roles(nmiData);
                state.nem12.networkKey = Amber.networkForNmi(nmiData.nmi) || '';
                renderNem12Options();
            });
        }
        $('nem12Network').addEventListener('change', () => {
            if (state.nem12) state.nem12.networkKey = $('nem12Network').value;
            renderNem12Options();
        });
        $('nem12Tariff').addEventListener('change', () => renderNem12Options(true));
        $('nem12Build').addEventListener('click', buildNem12Estimate);
    }

    // What the other app-*.js files use from this one.
    Object.assign(app, {
        loadLocalSites, saveLocalSites, populateSites, updateCacheSummary, setupImports
    });

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
