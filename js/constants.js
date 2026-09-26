(function (root) {
    const Amber = root.Amber = root.Amber || {};

    Amber.API_URL = 'https://api.amber.com.au/v1';
    Amber.FETCH_CHUNK_DAYS = 7;
    Amber.FETCH_CONCURRENCY = 3;
    Amber.FETCH_TIMEOUT_MS = 25000;
    // Waits between retries of a failed Amber request (a test can preset window.Amber.RETRY_DELAYS_MS).
    Amber.RETRY_DELAYS_MS = Amber.RETRY_DELAYS_MS || [2000, 6000, 15000];
    Amber.FETCH_SITES_TIMEOUT_MS = 10000;
    Amber.CACHE_FRESH_MS = 60 * 60 * 1000;
    Amber.APP_VERSION = '1.22';
    Amber.TEMPLATES_AS_AT = '2026-07-01';
    // All editable rates (plans, custom, Amber fixed charges) are GST-inclusive,
    // matching Energy Made Easy, DMO/VDO, retailer fact sheets and Amber perKwh.
    Amber.RATES_ARE_GST_INCLUSIVE = true;

    Amber.DEFAULT_AMBER_CONNECTION_CENTS = 116.787;
    Amber.DEFAULT_AMBER_SUBSCRIPTION_CENTS = 82.181;
    Amber.DEFAULT_AMBER_DEMAND_CENTS = 42.345;

    Amber.STATE_TIMEZONES = {
        ACT: 'Australia/Sydney',
        NSW: 'Australia/Sydney',
        NT: 'Australia/Darwin',
        QLD: 'Australia/Brisbane',
        SA: 'Australia/Adelaide',
        TAS: 'Australia/Hobart',
        VIC: 'Australia/Melbourne',
        WA: 'Australia/Perth'
    };

    Amber.WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

    Amber.canonicalNetwork = function (raw) {
        const n = String(raw || '').toLowerCase();
        if (/ausgrid/.test(n)) return 'ausgrid';
        if (/endeavour/.test(n)) return 'endeavour';
        if (/essential/.test(n)) return 'essential';
        if (/energex/.test(n)) return 'energex';
        if (/sa power|sapn/.test(n)) return 'sapn';
        if (/citipower/.test(n)) return 'citipower';
        if (/jemena/.test(n)) return 'jemena';
        if (/powercor/.test(n)) return 'powercor';
        if (/united energy/.test(n)) return 'united energy';
        if (/ausnet/.test(n)) return 'ausnet';
        if (/evoenergy/.test(n)) return 'evoenergy';
        return null;
    };

    Amber.planNetworkKey = function (planName, plan) {
        if (plan && plan.network) return Amber.canonicalNetwork(plan.network);
        return Amber.canonicalNetwork(planName);
    };

    Amber.planMatchesNetwork = function (planName, plan, siteNetwork) {
        const needed = Amber.planNetworkKey(planName, plan);
        if (!needed) return true;
        const site = Amber.canonicalNetwork(siteNetwork);
        if (!site) return true;
        return needed === site;
    };

    Amber.planListLabel = function (planName, siteNetwork) {
        const siteKey = Amber.canonicalNetwork(siteNetwork);
        if (!siteKey || !planName) return planName;
        return String(planName).replace(/\(([^)]*)\)/g, (full, inner) => {
            const parts = inner.split(',').map((s) => s.trim()).filter(Boolean);
            const kept = parts.filter((part) => Amber.canonicalNetwork(part) !== siteKey);
            if (kept.length === parts.length) return full;
            if (!kept.length) return '';
            return '(' + kept.join(', ') + ')';
        }).replace(/\s{2,}/g, ' ').trim();
    };

    Amber.hintPlanForNetwork = function (siteNetwork) {
        if (!siteNetwork) return null;
        if (Amber.NETWORK_PLAN_HINTS[siteNetwork]) return Amber.NETWORK_PLAN_HINTS[siteNetwork];
        const key = Amber.canonicalNetwork(siteNetwork);
        if (!key) return null;
        const names = Object.keys(Amber.NETWORK_PLAN_HINTS);
        for (let i = 0; i < names.length; i++) {
            if (Amber.canonicalNetwork(names[i]) === key) return Amber.NETWORK_PLAN_HINTS[names[i]];
        }
        return null;
    };

    Amber.NETWORK_PLAN_HINTS = {
        'AusNet': '2026-27 VDO (AusNet Services, Flat)',
        'AusNet Services': '2026-27 VDO (AusNet Services, Flat)',
        'CitiPower': '2026-27 VDO (CitiPower, Flat)',
        'Citipower': '2026-27 VDO (CitiPower, Flat)',
        'Jemena': '2026-27 VDO (Jemena, Flat)',
        'Powercor': '2026-27 VDO (Powercor, Flat)',
        'United Energy': '2026-27 VDO (United Energy, Flat)',
        'Ausgrid': '2026-27 DMO (Ausgrid, Flat)',
        'Endeavour': '2026-27 DMO (Endeavour, Flat)',
        'Essential Energy': '2026-27 DMO (Essential Energy, Flat)',
        'Essential': '2026-27 DMO (Essential Energy, Flat)',
        'Energex': '2026-27 DMO (Energex, Flat)',
        'SA Power Networks': '2026-27 DMO (SA Power Networks, Flat)',
        'SAPN': '2026-27 DMO (SA Power Networks, Flat)'
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
