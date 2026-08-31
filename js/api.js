(function (root) {
    const Amber = root.Amber = root.Amber || {};

    Amber.sleep = function (ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    };

    Amber.mapPool = async function (items, limit, fn) {
        const results = new Array(items.length);
        let next = 0;
        async function worker() {
            while (next < items.length) {
                const index = next++;
                results[index] = await fn(items[index], index);
            }
        }
        const n = Math.min(limit, items.length);
        const workers = [];
        for (let i = 0; i < n; i++) workers.push(worker());
        await Promise.all(workers);
        return results;
    };

    Amber.parseErrorDetail = async function (response, fallbackText) {
        const text = fallbackText != null ? fallbackText : await response.text();
        try {
            const json = JSON.parse(text);
            return json.message || json.error || text;
        } catch (e) {
            return text || `${response.status} ${response.statusText}`;
        }
    };

    Amber.fetchWithRetry = async function (url, options, retries) {
        const maxAttempts = (retries != null ? retries : 4);
        let lastError = null;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const response = await fetch(url, options);
            if (response.status === 429 || response.status === 503) {
                const retryAfter = response.headers.get('Retry-After');
                const reset = response.headers.get('RateLimit-Reset');
                let waitMs = Math.min(1000 * Math.pow(2, attempt), 8000);
                if (retryAfter) {
                    const asInt = parseInt(retryAfter, 10);
                    waitMs = Number.isFinite(asInt) ? asInt * 1000 : waitMs;
                } else if (reset) {
                    const asInt = parseInt(reset, 10);
                    if (Number.isFinite(asInt)) waitMs = Math.max(waitMs, asInt * 1000);
                }
                lastError = new Error(`Rate limited (${response.status})`);
                await Amber.sleep(waitMs);
                continue;
            }
            return response;
        }
        throw lastError || new Error('Request failed after retries');
    };

    Amber.authHeaders = function (apiKey) {
        return { Authorization: `Bearer ${apiKey}`, accept: 'application/json' };
    };

    Amber.fetchSites = async function (apiKey) {
        const response = await Amber.fetchWithRetry(`${Amber.API_URL}/sites`, {
            headers: Amber.authHeaders(apiKey)
        });
        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                throw new Error('Authentication failed. Your API Key appears to be invalid. Please check and try again.');
            }
            const detail = await Amber.parseErrorDetail(response);
            throw new Error(`Failed to fetch sites. ${detail}`);
        }
        const sites = await response.json();
        if (!sites || !sites.length) throw new Error('No sites found for this API key.');
        return sites;
    };

    Amber.buildFetchRanges = function (datesToFetch, maxDays) {
        const chunkDays = maxDays || Amber.FETCH_CHUNK_DAYS;
        const fetchRanges = [];
        if (!datesToFetch.length) return fetchRanges;

        let rangeStart = datesToFetch[0];
        let rangeEnd = datesToFetch[0];
        const getDaysBetween = (start, end) =>
            (new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / (1000 * 3600 * 24) + 1;

        for (let i = 1; i < datesToFetch.length; i++) {
            const nextDay = new Date(rangeEnd + 'T00:00:00');
            nextDay.setDate(nextDay.getDate() + 1);
            if (datesToFetch[i] === Amber.formatForInput(nextDay) && getDaysBetween(rangeStart, datesToFetch[i]) <= chunkDays) {
                rangeEnd = datesToFetch[i];
            } else {
                fetchRanges.push({ start: rangeStart, end: rangeEnd });
                rangeStart = datesToFetch[i];
                rangeEnd = datesToFetch[i];
            }
        }
        fetchRanges.push({ start: rangeStart, end: rangeEnd });
        return fetchRanges;
    };

    Amber.fetchUsageRange = async function (apiKey, siteId, range) {
        const usageUrl = `${Amber.API_URL}/sites/${siteId}/usage?startDate=${range.start}&endDate=${range.end}`;
        const response = await Amber.fetchWithRetry(usageUrl, { headers: Amber.authHeaders(apiKey) });
        const responseText = await response.text();
        if (!response.ok) {
            const detail = await Amber.parseErrorDetail(response, responseText);
            throw new Error(`Failed to fetch usage for ${range.start} to ${range.end}. Status: ${response.status}. Message: ${detail}`);
        }
        const apiResponseData = JSON.parse(responseText);
        return apiResponseData.filter((item) => {
            const usageDateStr = Amber.usageDateStr(item);
            return usageDateStr >= range.start && usageDateStr <= range.end;
        });
    };

    Amber.eachDateInclusive = function (startDate, endDate, fn) {
        const current = new Date(startDate.getTime());
        while (current <= endDate) {
            fn(Amber.formatForInput(current), new Date(current.getTime()));
            current.setDate(current.getDate() + 1);
        }
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
