(function (root) {
    const Amber = root.Amber = root.Amber || {};

    Amber.API_URL = 'https://api.amber.com.au/v1';
    Amber.FETCH_CHUNK_DAYS = 30;
    Amber.FETCH_CONCURRENCY = 3;
    Amber.FETCH_TIMEOUT_MS = 25000;
    Amber.FETCH_SITES_TIMEOUT_MS = 10000;
    Amber.CACHE_FRESH_MS = 60 * 60 * 1000;
    Amber.CACHE_BOUNDARY_DAYS = 3;
    Amber.APP_VERSION = '1.05';
    Amber.TEMPLATES_AS_AT = '2026-07-01';
    // All editable rates (plans, custom, Amber fixed charges) are GST-inclusive,
    // matching Energy Made Easy, DMO/VDO, retailer fact sheets and Amber perKwh.
    Amber.RATES_ARE_GST_INCLUSIVE = true;

    Amber.DEFAULT_AMBER_CONNECTION_CENTS = 109.894;
    Amber.DEFAULT_AMBER_SUBSCRIPTION_CENTS = 82.203;
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

    Amber.NETWORK_PLAN_HINTS = {
        'AusNet': '2026-27 VDO (AusNet Services)',
        'AusNet Services': '2026-27 VDO (AusNet Services)',
        'CitiPower': '2026-27 VDO (CitiPower)',
        'Citipower': '2026-27 VDO (CitiPower)',
        'Jemena': '2026-27 VDO (Jemena)',
        'Powercor': '2026-27 VDO (Powercor)',
        'United Energy': '2026-27 VDO (United Energy)',
        'Ausgrid': '2026-27 DMO (Ausgrid)',
        'Endeavour': '2026-27 DMO (Endeavour)',
        'Essential Energy': '2026-27 DMO (Essential Energy)',
        'Essential': '2026-27 DMO (Essential Energy)',
        'Energex': '2026-27 DMO (Energex)'
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
