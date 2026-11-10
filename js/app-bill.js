(function (root) {
    const Amber = root.Amber = root.Amber || {};
    const app = Amber.app;
    const state = app.state;
    const $ = app.$;

    /*
     * An Amber bill: reading the file (bill.js does the parsing; pdf.js is loaded on demand),
     * filling Amber's fixed charges on the Start tab from it, and the Bill? tab, which checks each
     * bill line against the meter readings for the bill's own dates. The last bill checked is kept
     * in localStorage `amberBillCheck`.
     */

    const BILL_CHECK_KEY = 'amberBillCheck';

    // ---------- Reading a bill ----------

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
        const billOk = !!(parsed && parsed.check && parsed.check.ok);
        if (billOk) {
            state.billCheck = parsed.check;
            state.billData = null;
            try { localStorage.setItem(BILL_CHECK_KEY, JSON.stringify(parsed.check)); } catch (e) { /* ignore */ }
            renderBillCheck();
        }
        // Show the check and load the bill period's meter data straight away (its own load: the
        // dates at the top and the Compare results stay as they are).
        const showBill = () => {
            if (!billOk) return;
            if (state.activeTab !== 'bill') app.selectTab('bill');
            else ensureBillLoaded();
        };
        if (!parsed || !parsed.ok) {
            setAmberBillStatus('Could not find daily connection, subscription or demand rates in that file. You can type them from the charges page.', true);
            showBill();
            return;
        }
        // A bill for a period before 1 July carries last financial year's charges.
        const earlier = !!(parsed.check && parsed.check.end && parsed.check.end < Amber.AMBER_RATES_CHANGE_DATE);
        $('amberChargesDetails').open = true;
        const suffix = earlier ? 'Prev' : '';
        if (parsed.connectionCents != null) $('amberConnectionRate' + suffix).value = parsed.connectionCents.toFixed(3);
        if (parsed.subscriptionCents != null) $('amberSubscriptionRate' + suffix).value = parsed.subscriptionCents.toFixed(3);
        if (parsed.demandCents != null) $('amberDemandRate' + suffix).value = parsed.demandCents.toFixed(3);
        app.saveAllSettings();
        const gstNote = parsed.exGst ? ' The bill shows prices without GST, so 10% was added.' : '';
        const billNote = billOk ? ' The bill is checked on the Bill? tab.' : '';
        const yearNote = earlier ? ' The bill is from before 1 July 2026, so these went into last year\'s charges.' : '';
        setAmberBillStatus(`Prefilled from your bill (including GST): ${parsed.found.join(', ')}.${yearNote}${gstNote} Change any box that looks wrong.${billNote}`, false);
        if (state.cachedChannelData && state.lastFetchedStartDate && !state.fetching) app.recalculateAndShow(true);
        showBill();
    }

    async function handleAmberBillFile(file) {
        if (!file) return;
        const current = app.selectedSite();
        if (current && current.local) {
            setAmberBillStatus('The selected site is a household imported from NEM12. Choose your Amber site above, then load the bill.', true);
            ['amberBillFile', 'billCheckFile'].forEach((id) => { const input = $(id); if (input) input.value = ''; });
            return;
        }
        setAmberBillStatus('Reading bill…', false);
        state.billCheckError = null;
        try {
            const text = await Amber.readBillFile(file, loadPdfJs);
            const parsed = Amber.parseAmberBillText(text, file.name);
            if (!parsed.check || !parsed.check.ok) {
                state.billCheckError = { name: file.name, check: parsed.check || {}, text: Amber.normalizeBillText(text) };
                renderBillCheck();
            }
            applyAmberBillRates(parsed);
        } catch (err) {
            setAmberBillStatus(err && err.message ? err.message : 'Could not read that file.', true);
            state.billCheckError = { name: file.name, message: err && err.message ? err.message : 'Could not read that file.' };
            renderBillCheck();
        } finally {
            ['amberBillFile', 'billCheckFile'].forEach((id) => { const input = $(id); if (input) input.value = ''; });
        }
    }

    // ---------- The Bill? tab ----------

    function billPeriodFinished(bill) {
        return !!(bill && bill.ok && bill.end <= Amber.formatForInput(Amber.localYesterday()));
    }

    function billPeriodLoaded(bill) {
        const site = app.selectedSite();
        return !!(bill && state.cachedChannelData && state.lastFetchedStartDate && !(site && site.local)
            && state.lastFetchedStartDate <= bill.start && state.lastFetchedEndDate >= bill.end);
    }

    const billKey = (bill) => (bill ? `${bill.start}|${bill.end}` : '');

    /** The readings to check a bill against: the results on show if they cover it, else its own. */
    function billChannelData(bill) {
        if (billPeriodLoaded(bill)) return state.cachedChannelData;
        const own = state.billData;
        return own && own.key === billKey(bill) && own.channelData ? own.channelData : null;
    }

    /**
     * Load the saved bill's period for the bill check, unless the results on show already cover
     * it. This is the bill check's own load: the dates at the top and the Compare results are left
     * as they are. Opening the tab doesn't retry a bill period that already failed to load.
     */
    async function ensureBillLoaded(opts) {
        const bill = state.billCheck;
        const key = billKey(bill);
        const fromTab = !!(opts && opts.fromTab);
        const own = state.billData && state.billData.key === key ? state.billData : null;
        const apiKey = $('apiKey').value.trim();
        if (!billPeriodFinished(bill) || billChannelData(bill) || !apiKey || (own && (own.loading || (fromTab && own.error)))) {
            renderBillCheck();
            return;
        }
        state.billData = { key, loading: true };
        renderBillCheck();
        let result;
        try {
            if (!state.sites.some((site) => !site.local) || state.sitesApiKey !== apiKey) {
                app.populateSites(await Amber.fetchSites(apiKey));
                state.sitesApiKey = apiKey;
            }
            const site = app.selectedSite();
            if (!site || site.local) throw new Error('The selected site is a household imported from NEM12. Choose your Amber site on the Start tab to check this bill.');
            const loaded = await app.loadReadings(site, apiKey, bill.start, bill.end);
            if (!loaded.items.length) throw new Error(loaded.chunkErrors.length ? app.failedChunksMessage(loaded.failedRanges, loaded.chunkErrors) : 'Amber has no meter data for these dates.');
            const channelData = {};
            (site.channels || []).forEach((c) => { channelData[c.identifier] = Amber.emptyChannel(c); });
            Amber.processUsageData(loaded.items, channelData, true);
            Object.values(channelData).forEach((c) => c.usageData.sort((x, y) => x.nemTime.localeCompare(y.nemTime)));
            result = { key, siteId: site.id, channelData, warning: loaded.chunkErrors.length ? app.failedChunksMessage(loaded.failedRanges, loaded.chunkErrors) : '' };
        } catch (err) {
            console.error(err);
            result = { key, error: err && err.message ? err.message : 'Something went wrong.' };
        }
        // A different bill (or none) since this started: its result isn't wanted any more.
        if (!state.billData || state.billData.key !== key || billKey(state.billCheck) !== key) return;
        state.billData = result;
        renderBillCheck();
    }

    function renderBillCheck() {
        const bill = state.billCheck;
        const body = $('billCheckBody');
        $('billCheckClear').classList.toggle('hidden', !bill && !state.billCheckError);
        if (state.billCheckError) {
            const e = state.billCheckError;
            $('billCheckPeriod').textContent = '';
            const found = (e.check && e.check.found) || [];
            const missing = e.check && !e.check.start ? 'the billing period dates' : 'enough bill lines';
            body.innerHTML = `<div class="p-3 rounded-md bg-amber-50 text-amber-800 text-sm">
                <p class="font-medium">Couldn't check ${Amber.escapeHTML(e.name || 'that bill')}.</p>
                <p>${e.message ? Amber.escapeHTML(e.message) : `Couldn't find ${missing}. Found: ${found.length ? Amber.escapeHTML(found.join(', ')) : 'nothing recognisable'}.`}</p>
            </div>
            ${e.text ? `<details class="mt-3 text-xs text-gray-600"><summary class="cursor-pointer">Show the text read from the bill</summary>
                <p class="mt-2">This stays in your browser. Copying the charges part to the developer helps fix the reader.</p>
                <pre class="mt-2 p-2 bg-gray-50 border rounded whitespace-pre-wrap break-words max-h-80 overflow-auto">${Amber.escapeHTML(e.text.substring(0, 6000))}</pre></details>` : ''}`;
            return;
        }
        if (!bill || !bill.ok) {
            $('billCheckPeriod').textContent = '';
            body.innerHTML = '<p class="text-sm text-gray-600">Choose an Amber bill (the PDF Amber emails you) to check each line against your meter readings for the same dates. It\'s read here in your browser, and it also fills in Amber\'s fixed charges on the Start tab.</p>';
            return;
        }
        const days = Amber.inclusiveDayCount(bill.start, bill.end);
        $('billCheckPeriod').textContent = `Bill period: ${app.fmtDate(bill.start)} to ${app.fmtDate(bill.end)} (${days} days${bill.periodFromFileName ? ', from the file name' : ''}). Bill charges are shown without GST, and so are the figures from your meter readings.`;
        const data = billChannelData(bill);
        const own = state.billData && state.billData.key === billKey(bill) ? state.billData : null;
        if (!data) {
            let msg;
            if (!billPeriodFinished(bill)) {
                msg = 'The bill period hasn\'t finished yet, so there is no complete meter data to check against.';
            } else if (!$('apiKey').value.trim()) {
                msg = 'Add your Amber API key on the <button type="button" data-go-start class="text-indigo-600 hover:underline font-medium">Start</button> tab to check this bill against your meter data.';
            } else if (own && own.loading) {
                msg = 'Fetching your meter data for the bill period…';
            } else if (own && own.error) {
                msg = `Couldn't load meter data for the bill period. ${Amber.escapeHTML(own.error)} <button type="button" data-bill-reload class="text-indigo-600 hover:underline font-medium">Try again</button>`;
            } else {
                msg = 'Your meter data for the bill period isn\'t loaded yet. <button type="button" data-bill-reload class="text-indigo-600 hover:underline font-medium">Load it and check the bill</button>';
            }
            body.innerHTML = `<p class="text-sm text-gray-600">${msg}</p>`;
            const reload = body.querySelector('[data-bill-reload]');
            if (reload) reload.addEventListener('click', () => ensureBillLoaded());
            return;
        }
        // A bill is one settlement of the export allowance, whatever calendar months it covers.
        const totals = Amber.periodTotals(data, bill.start, bill.end, { site: app.selectedSite(), state: app.currentStateCode(), amberRates: app.readAmberRates(), billPeriod: true });
        const rows = Amber.compareBill(bill, totals);
        const fmtVal = (v, unit) => (unit === '$' ? `${Amber.money(v)}` : `${v.toFixed(unit === 'kW' || Math.abs(v) < 10 ? 2 : 1)} ${unit}`);
        const fmtDiff = (v, unit) => {
            if (Math.abs(v) < (unit === '$' ? 0.005 : 0.05)) return '—';
            return (v > 0 ? '+' : '−') + fmtVal(Math.abs(v), unit);
        };
        let html = `<table class="min-w-full divide-y divide-gray-200 text-sm"><thead class="bg-gray-50"><tr>
            <th class="px-2 sm:px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Line</th>
            <th class="px-2 sm:px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Bill</th>
            <th class="px-2 sm:px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Meter data</th>
            <th class="px-2 sm:px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Difference</th>
            <th class="px-2 sm:px-3 py-2"></th></tr></thead><tbody class="divide-y divide-gray-200">`;
        rows.forEach((r) => {
            html += `<tr class="${r.ok ? '' : 'bg-amber-50'}">
                <td class="px-2 sm:px-3 py-2 text-gray-900">${Amber.escapeHTML(r.label)}</td>
                <td class="px-2 sm:px-3 py-2 text-right whitespace-nowrap">${fmtVal(r.bill, r.unit)}</td>
                <td class="px-2 sm:px-3 py-2 text-right whitespace-nowrap">${fmtVal(r.meter, r.unit)}</td>
                <td class="px-2 sm:px-3 py-2 text-right whitespace-nowrap ${r.ok ? 'text-gray-600' : 'text-amber-800 font-semibold'}">${fmtDiff(r.diff, r.unit)}</td>
                <td class="px-2 sm:px-3 py-2 text-center">${r.ok ? '<span class="text-green-700" aria-label="matches">✓</span>' : '<span class="text-amber-700" aria-label="check">⚠</span>'}</td>
            </tr>`;
        });
        html = app.scrollBox(html + '</tbody></table>');

        const notes = [];
        const bad = rows.filter((r) => !r.ok).map((r) => r.key);
        if (!rows.length) notes.push('No matching lines were found on this bill.');
        if (bad.includes('demandCost') && !bad.includes('demandKw') && totals.demandDays && totals.demandDays !== days) {
            notes.push(`Peak demand matches but the charge doesn't: the bill charges demand for all ${days} days, while Amber's data marks only ${totals.demandDays} days as demand days.`);
        }
        if (totals.dataDays < days) notes.push(`Meter data is missing for ${days - totals.dataDays} day(s) of the bill period.`);
        const estimated = new Set();
        Object.values(data).forEach((c) => (c.usageData || []).forEach((item) => {
            const d = Amber.usageDateStr(item);
            if (d >= bill.start && d <= bill.end && Amber.isEstimatedQuality(item.quality)) estimated.add(d);
        }));
        const est = estimated.size;
        if (own && own.warning && data === own.channelData) notes.push(own.warning);
        if (est) notes.push(`${est} day(s) still have estimated meter data, which can differ from what was billed.`);
        if (bill.otherCost) notes.push(`The charges total includes ${Amber.money(bill.otherCost)} of other charges from the bill (e.g. a card payment fee) that aren't in meter data.`);
        if (bill.voucherCredit) notes.push(`Vouchers & concessions of ${Amber.money(bill.voucherCredit)} (without GST) are credited on the bill but aren't part of this check.`);
        if (bill.feedInKwh == null) notes.push('Feed-in credits weren\'t found on the bill, so they aren\'t compared.');
        const reward = rows.find((r) => r.key === 'exportRewardKwh');
        if (reward) {
            notes.push(reward.ok
                ? 'Export reward kWh match your 4–9 pm exports: they are part of total exports (not extra), and the reward is already included in Amber\'s feed-in prices.'
                : 'Export reward kWh don\'t match your 4–9 pm exports, so the reward window may be different.');
        }
        notes.push('Supply, subscription and demand use the rates in the Amber charges fields (prefilled from this bill).');
        html += `<ul class="text-xs text-gray-600 mt-3 space-y-1 list-disc pl-5">${notes.map((n) => `<li>${Amber.escapeHTML(n)}</li>`).join('')}</ul>`;
        body.innerHTML = html;
        app.syncScrollHints();
    }

    function setupBillCheck() {
        try {
            const saved = JSON.parse(localStorage.getItem(BILL_CHECK_KEY) || 'null');
            if (saved && saved.ok) state.billCheck = saved;
        } catch (e) { /* ignore */ }
        $('billCheckFile').addEventListener('change', (e) => handleAmberBillFile(e.target.files[0]));
        // The same bill can be loaded from the Start tab, under Amber's fixed charges.
        $('amberBillFile').addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) handleAmberBillFile(file);
        });
        $('billCheckClear').addEventListener('click', () => {
            state.billCheck = null;
            state.billCheckError = null;
            state.billData = null;
            try { localStorage.removeItem(BILL_CHECK_KEY); } catch (e) { /* ignore */ }
            renderBillCheck();
        });
        renderBillCheck();
    }

    // What the other app-*.js files use from this one.
    Object.assign(app, {
        ensureBillLoaded, renderBillCheck, setupBillCheck
    });

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
