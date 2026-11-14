(function (root) {
    const CACHE_NAME = 'amber-compare-v1.66';
    const APP_SHELL = [
        './',
        'index.html',
        'manifest.json',
        'favicon.ico',
        'css/app.css?v=1.66',
        'chart.umd.min.js',
        'chartjs-plugin-zoom.min.js'
    ];

    if (!root || typeof root.addEventListener !== 'function') return;

    root.addEventListener('install', (event) => {
        if (!event || typeof event.waitUntil !== 'function') return;
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
        );
    });

    root.addEventListener('activate', (event) => {
        if (!event || typeof event.waitUntil !== 'function') return;
        event.waitUntil(
            caches.keys().then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            )).catch(() => {})
        );
    });

    root.addEventListener('fetch', (event) => {
        const req = event && event.request;
        if (!req || req.method !== 'GET') return;
        const url = new URL(req.url);
        if (url.origin !== root.location.origin) return;
        event.respondWith(
            fetch(req).then((res) => {
                if (res && res.ok) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
                }
                return res;
            }).catch(() => caches.match(req))
        );
    });
})(typeof self !== 'undefined' ? self : globalThis);
