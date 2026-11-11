(function (root) {
    const Amber = root.Amber = root.Amber || {};

    /*
     * What every part of the page controller shares. The controller (everything in the UI except
     * the Solar+? tab) is split over the app-*.js files and app.js; they all work on one `state`
     * object and call each other through Amber.app, which this file creates:
     *   app-core.js       this file: state, saved JSON, the selected site and state, Amber's fixed charges, messages
     *   app-plan-form.js  the plan form on Compare, saved settings and custom plans
     *   app-results.js    the answer, every plan, month by month, and the Usage tab
     *   app-imports.js    the site picker, Amber CSV and NEM12 imports, imported households
     *   app-bill.js       reading an Amber bill and the Bill? tab
     *   app-free.js       the Free? tab
     *   app-settings.js   the settings menu
     *   app.js            tabs, the Start tab, the dates bar, fetchAndCompare and init (loaded last)
     * Amber.app is internal to these files. Calls across files go through it at call time
     * (app.renderBillCheck()), so only this file has to load before the others. Other modules use
     * Amber.appApi (set in app.js) and tests read Amber._appState. See docs/ARCHITECTURE.md.
     */

    // Everything the page remembers while it is open. Exposed as Amber._appState for tests.
    const state = {
        templates: Amber.cloneTemplates(),
        originalTemplates: Amber.cloneTemplates(),
        cachedChannelData: null,
        cachedAllChannelData: null,
        monthly: null,
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
        batteryShift: null,
        shiftPlan: null,
        shiftBudget: null,
        fetching: false,
        activeTab: null,
        resultsTab: 'compare',
        ready: false,
        // The bill check's own readings: { key, loading } | { key, error } | { key, siteId, channelData, warning }.
        billData: null
    };

    function $(id) {
        return document.getElementById(id);
    }

    /** JSON saved in the browser, or the fallback when it is missing, damaged or the wrong kind of thing. */
    function storedJson(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key));
            if (value == null || typeof value !== 'object' || Array.isArray(value) !== Array.isArray(fallback)) return fallback;
            return value;
        } catch (e) {
            return fallback;
        }
    }

    function gstInclusive() {
        const toggle = $('gstToggle');
        return !toggle || toggle.checked;
    }

    // ---------- The selected site and state ----------

    function currentStateCode() {
        return $('stateSelector').value;
    }

    function selectedSite() {
        const id = $('siteSelector').value;
        return state.sites.find((s) => s.id === id) || state.sites[0] || null;
    }

    function currentSiteNetwork() {
        const site = selectedSite();
        return site && site.network ? site.network : '';
    }

    /** The state a site's network is in (Ausgrid → NSW), or null when the network isn't known. */
    function siteNetworkState(site) {
        const net = site && Amber.NETWORKS && Amber.NETWORKS[Amber.canonicalNetwork(site.network)];
        return net ? net.state : null;
    }

    // ---------- Amber's fixed charges (Start tab) ----------

    const AMBER_CHARGE_FIELDS = ['amberConnectionRate', 'amberSubscriptionRate', 'amberDemandRate', 'amberConnectionRatePrev', 'amberSubscriptionRatePrev', 'amberDemandRatePrev'];

    /** Fill Setup's Amber charges from storage (the Amber account's own charges). */
    function loadAmberChargeFields() {
        let storedConn = localStorage.getItem('amberConnectionRate');
        const storedSub = localStorage.getItem('amberSubscriptionRate');
        let storedDemand = localStorage.getItem('amberDemandRate');
        const storedPrev = ['amberConnectionRatePrev', 'amberSubscriptionRatePrev', 'amberDemandRatePrev'].map((id) => localStorage.getItem(id));
        // Before v1.40 there was one set of charges; the old defaults (and bills that matched them)
        // were 2025-26 charges, so they move to last year and this year starts from the new defaults.
        if (storedPrev.every((v) => v == null)) {
            const was = (v, d) => v != null && Math.abs(parseFloat(v) - d) < 0.0005;
            if (was(storedConn, Amber.PREVIOUS_AMBER_CONNECTION_CENTS) || was(storedDemand, Amber.PREVIOUS_AMBER_DEMAND_CENTS)) {
                storedPrev[0] = storedConn;
                storedPrev[1] = storedSub;
                storedPrev[2] = storedDemand;
                storedConn = null;
                storedDemand = null;
            }
        }
        $('amberConnectionRate').value = (!storedConn || storedConn === '109.894')
            ? Amber.DEFAULT_AMBER_CONNECTION_CENTS
            : storedConn;
        $('amberSubscriptionRate').value = (!storedSub || storedSub === '82.203')
            ? Amber.DEFAULT_AMBER_SUBSCRIPTION_CENTS
            : storedSub;
        $('amberDemandRate').value = storedDemand || Amber.DEFAULT_AMBER_DEMAND_CENTS;
        $('amberConnectionRatePrev').value = storedPrev[0] != null && storedPrev[0] !== '' ? storedPrev[0] : Amber.PREVIOUS_AMBER_CONNECTION_CENTS;
        $('amberSubscriptionRatePrev').value = storedPrev[1] != null && storedPrev[1] !== '' ? storedPrev[1] : Amber.PREVIOUS_AMBER_SUBSCRIPTION_CENTS;
        $('amberDemandRatePrev').value = storedPrev[2] != null && storedPrev[2] !== '' ? storedPrev[2] : Amber.PREVIOUS_AMBER_DEMAND_CENTS;

    }

    function readAmberRates() {
        const site = selectedSite();
        if (site && site.local && site.amberRates) return Object.assign({}, site.amberRates);
        const prev = (id) => {
            const v = parseFloat($(id).value);
            return Number.isFinite(v) && v > 0 ? v : null;
        };
        return {
            connectionCents: parseFloat($('amberConnectionRate').value) || Amber.DEFAULT_AMBER_CONNECTION_CENTS,
            subscriptionCents: parseFloat($('amberSubscriptionRate').value) || Amber.DEFAULT_AMBER_SUBSCRIPTION_CENTS,
            demandCents: parseFloat($('amberDemandRate').value) || Amber.DEFAULT_AMBER_DEMAND_CENTS,
            // Days before 1 July use last financial year's charges (blank = same as now).
            earlier: {
                until: Amber.AMBER_RATES_CHANGE_DATE,
                connectionCents: prev('amberConnectionRatePrev'),
                subscriptionCents: prev('amberSubscriptionRatePrev'),
                demandCents: prev('amberDemandRatePrev')
            }
        };
    }

    // ---------- Dates and messages ----------

    function fmtDate(iso) {
        return Amber.formatDate(iso);
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

    // ---------- Tables that can scroll sideways ----------

    /**
     * A table in its own sideways-scrolling box, so only the table moves (not the card's heading),
     * with a note under it that shows only while part of the table is off-screen.
     */
    function scrollBox(tableHtml) {
        return `<div data-scroll-box class="group overflow-x-auto">${tableHtml}</div><p data-scroll-hint class="hidden mt-1 text-xs text-gray-500">Scroll the table sideways to see every column →</p>`;
    }

    /**
     * Show each table's "scroll sideways" note only while part of the table is off-screen. A table
     * that doesn't fit is first marked data-tight, which lets cells that allow it wrap
     * (group-data-[tight]: classes); the note shows only if it is still too wide after that.
     */
    function syncScrollHints() {
        document.querySelectorAll('[data-scroll-box]').forEach((box) => {
            const hint = box.nextElementSibling;
            if (!hint || !hint.hasAttribute('data-scroll-hint')) return;
            box.removeAttribute('data-tight');
            if (box.scrollWidth > box.clientWidth + 1) box.setAttribute('data-tight', '');
            hint.classList.toggle('hidden', box.scrollWidth <= box.clientWidth + 1);
        });
    }

    Amber.scrollBox = scrollBox;
    Amber.syncScrollHints = syncScrollHints;

    Amber._appState = state;

    // The app's shared internals: `state`, and the functions and constants one app-*.js file uses
    // from another. Each later file adds its own with Object.assign(app, { … }).
    Amber.app = {
        state, $, storedJson, gstInclusive, currentStateCode, selectedSite, currentSiteNetwork,
        siteNetworkState, AMBER_CHARGE_FIELDS, loadAmberChargeFields, readAmberRates, fmtDate,
        showMessage, hideMessage, scrollBox, syncScrollHints
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
