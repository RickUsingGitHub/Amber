(function (root) {
    const Amber = root.Amber = root.Amber || {};

    const DB_NAME = 'AmberDataCacheDB';
    const STORE_NAME = 'dailyUsage';
    const DB_VERSION = 1;
    const OBFUSCATION_KEY = 'amber-compare-export-secure-key';

    Amber.DB_NAME = DB_NAME;

    Amber.escapeHTML = function (str) {
        if (str == null) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    };

    Amber.obfuscate = function (str) {
        if (!str) return str;
        return btoa(str.split('').map((char, i) =>
            String.fromCharCode(char.charCodeAt(0) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length))
        ).join(''));
    };

    Amber.deobfuscate = function (str) {
        if (!str) return str;
        try {
            const decoded = atob(str);
            return decoded.split('').map((char, i) =>
                String.fromCharCode(char.charCodeAt(0) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length))
            ).join('');
        } catch (e) {
            return str;
        }
    };

    Amber.openDb = function () {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.error);
                reject(event.target.error);
            };
        });
    };

    Amber.setUsageData = function (db, id, data) {
        return Amber.setUsageDataMany(db, [{ id, data }]);
    };

    Amber.setUsageDataMany = function (db, entries) {
        return new Promise((resolve, reject) => {
            if (!entries || !entries.length) {
                resolve();
                return;
            }
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            entries.forEach((entry) => store.put({ id: entry.id, data: entry.data }));
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error || transaction.error);
        });
    };

    Amber.loadSiteCacheDates = function (db, siteId, dateStrs) {
        return new Promise((resolve, reject) => {
            const byDate = {};
            const dates = [];
            if (!siteId || !dateStrs || !dateStrs.length) {
                resolve({ byDate, dates });
                return;
            }
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            let pending = dateStrs.length;
            let settled = false;
            const done = (err) => {
                if (settled) return;
                settled = true;
                if (err) reject(err);
                else resolve({ byDate, dates });
            };
            dateStrs.forEach((dateStr) => {
                const request = store.get(`${siteId}_${dateStr}`);
                request.onsuccess = () => {
                    if (request.result && request.result.data) {
                        byDate[dateStr] = request.result.data;
                        dates.push(dateStr);
                    }
                    pending -= 1;
                    if (pending === 0) done();
                };
                request.onerror = () => done(request.error);
            });
            transaction.onerror = (event) => done(event.target.error || transaction.error);
        });
    };

    /**
     * A day is final (safe to cache and reuse) when it has no estimated intervals
     * and at least one channel covers the full 24 hours (NEM time has no DST).
     */
    Amber.isCompleteDay = function (items) {
        if (!items || !items.length) return false;
        const minutesByChannel = {};
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (Amber.isEstimatedQuality && Amber.isEstimatedQuality(item.quality)) return false;
            const ch = item.channelIdentifier || '?';
            minutesByChannel[ch] = (minutesByChannel[ch] || 0) + (parseFloat(item.duration) || 30);
        }
        return Object.keys(minutesByChannel).some((ch) => minutesByChannel[ch] >= 1440);
    };

    /** Days with no data this old are remembered as empty (e.g. before the account started). */
    Amber.EMPTY_DAY_CACHE_AGE_DAYS = 14;

    Amber.emptyDayCutoff = function () {
        const d = Amber.localYesterday();
        d.setDate(d.getDate() - (Amber.EMPTY_DAY_CACHE_AGE_DAYS - 1));
        return Amber.formatForInput(d);
    };

    /** Whether a cached day can be used instead of fetching it again. */
    Amber.cachedDayUsable = function (items, dateStr, emptyCutoff) {
        if (!items) return false;
        if (items.length === 0) return dateStr < emptyCutoff;
        return Amber.isCompleteDay(items);
    };

    Amber.loadAllSiteCache = function (db, siteId) {
        return new Promise((resolve, reject) => {
            if (!siteId) {
                resolve({ byDate: {}, dates: [] });
                return;
            }
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = (event) => {
                const prefix = `${siteId}_`;
                const byDate = {};
                const dates = [];
                (event.target.result || []).forEach((rec) => {
                    if (rec && typeof rec.id === 'string' && rec.id.startsWith(prefix)) {
                        const dateStr = rec.id.substring(prefix.length);
                        byDate[dateStr] = rec.data;
                        dates.push(dateStr);
                    }
                });
                resolve({ byDate, dates });
            };
            request.onerror = (event) => reject(event.target.error);
        });
    };

    Amber.deleteDatabase = function () {
        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(DB_NAME);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error || new Error('Could not delete database'));
            request.onblocked = () => reject(new Error('blocked'));
        });
    };

    Amber.getApiKey = function () {
        const fromLocal = Amber.deobfuscate(localStorage.getItem('amberApiKey'));
        if (fromLocal) return { key: fromLocal, remember: true };
        const fromSession = Amber.deobfuscate(sessionStorage.getItem('amberApiKey'));
        if (fromSession) return { key: fromSession, remember: false };
        return { key: '', remember: true };
    };

    Amber.setApiKey = function (key, remember) {
        const stored = Amber.obfuscate(key);
        if (remember) {
            localStorage.setItem('amberApiKey', stored);
            sessionStorage.removeItem('amberApiKey');
        } else {
            sessionStorage.setItem('amberApiKey', stored);
            localStorage.removeItem('amberApiKey');
        }
    };

    Amber.clearApiKey = function () {
        localStorage.removeItem('amberApiKey');
        sessionStorage.removeItem('amberApiKey');
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
