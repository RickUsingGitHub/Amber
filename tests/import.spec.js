const { test, expect } = require('@playwright/test');

const pad = (n) => String(n).padStart(2, '0');
const HEADER = 'Start Time,End Time,NEM Time,NEM Day,Channel Type,Channel Identifier,Price,Usage,Cost';

// A generated Amber usage export: 5-minute rows, NEM days, AEDT/AEST local times.
function exportCsv(fromDay, toDay) {
    const lines = [HEADER];
    const fmt = (ms) => new Date(ms).toISOString().substring(0, 19).replace('T', ' ');
    for (let d = fromDay; d <= toDay; d = new Date(Date.parse(d + 'T00:00:00Z') + 86400000).toISOString().substring(0, 10)) {
        const month = parseInt(d.substring(5, 7), 10);
        const offset = month >= 10 || month <= 3 ? 1 : 0; // close enough for a test file
        const base = Date.parse(`${d}T00:00:00Z`);
        for (let i = 0; i < 288; i++) {
            const nemEnd = base + (i + 1) * 300000;
            const ls = base + i * 300000 + offset * 3600000 + 1000;
            const le = nemEnd + offset * 3600000;
            const hour = Math.floor(i / 12);
            const g = hour >= 17 && hour < 20 ? 0.2 : 0.05;
            const e = hour >= 10 && hour < 14 ? 0.15 : 0;
            lines.push([fmt(ls), fmt(le), fmt(nemEnd), d, 'general', 'E5', 25, g, (25 * g).toFixed(6)].join(','));
            lines.push([fmt(ls), fmt(le), fmt(nemEnd), d, 'feedIn', 'B5', -5, e, (-5 * e).toFixed(6)].join(','));
        }
    }
    return lines.join('\n') + '\n';
}

test('importing a usage export fills the cache and compares its whole months', async ({ page }) => {
    await page.addInitScript(() => {
        const key = 'amber-compare-export-secure-key';
        const ob = (str) => btoa(str.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join(''));
        window.Amber = Object.assign(window.Amber || {}, { AUTO_COMPARE: false });
        localStorage.setItem('amberApiKey', ob('fake-api-key'));
    });
    await page.route('**/sites', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'site1', nmi: '4102000000', network: 'Ausgrid', status: 'active', channels: [
        { identifier: 'E1', type: 'general', tariff: 'EA116' }, { identifier: 'B1', type: 'feedIn', tariff: 'EA029' }] }]) }));
    const usageCalls = [];
    await page.route('**/usage*', (r) => {
        const u = new URL(r.request().url());
        usageCalls.push(u.searchParams.get('startDate'));
        return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.click('#tab-setup');
    await expect(page.locator('#usageImportSection')).toBeVisible();

    await page.setInputFiles('#usageCsvFile', { name: 'AM000000_usage_data.csv', mimeType: 'text/csv', buffer: Buffer.from(exportCsv('2025-05-30', '2025-07-02')) });
    const status = page.locator('#usageImportStatus');
    await expect(status).toContainText('Imported 34 days of 5-minute data');
    await expect(status).toContainText('E5 (general) imported as E1');
    await expect(status).toContainText('Demand window flagged for EA116');
    await expect(page.locator('#usageCacheSummary')).toContainText('34 days');

    // Compares the whole month it covers, straight from the cache.
    await expect(page.locator('#tab-compare')).toHaveAttribute('aria-selected', 'true');
    await page.waitForSelector('#resultsSection:not(.hidden)');
    await expect(page.locator('#startDate')).toHaveValue('2025-06-01');
    await expect(page.locator('#endDate')).toHaveValue('2025-06-30');
    expect(usageCalls).toEqual([]);
    const monthCells = page.locator('#monthlyTable tbody tr td:first-child');
    await expect(monthCells).toHaveText([/Jun(e)? 2025/, 'Total']);
    // 30 days × (36 × 0.2 + 252 × 0.05) kWh = 594 kWh imported; demand from 3–9 pm local in June.
    await expect(page.locator('#monthlyTable tbody tr:first-child td:nth-child(3)')).toHaveText('594.0');
    await expect(page.locator('#monthlyTable tbody tr:first-child td:nth-child(7)')).not.toHaveText('$0.00');

    // Importing the same file again replaces the imported days rather than skipping them.
    await page.click('#tab-setup');
    await page.setInputFiles('#usageCsvFile', { name: 'again.csv', mimeType: 'text/csv', buffer: Buffer.from(exportCsv('2025-05-30', '2025-07-02')) });
    await expect(status).toContainText('Imported 34 days');

    // A file that isn't an export is explained.
    await page.click('#tab-setup');
    await page.setInputFiles('#usageCsvFile', { name: 'other.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') });
    await expect(status).toContainText("doesn't look like an Amber usage export");
    expect(errors).toEqual([]);
});

test('Last 12 months preset picks the previous 12 whole months', async ({ page }) => {
    await page.addInitScript(() => {
        const key = 'amber-compare-export-secure-key';
        const ob = (str) => btoa(str.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join(''));
        window.Amber = Object.assign(window.Amber || {}, { AUTO_COMPARE: false });
        localStorage.setItem('amberApiKey', ob('fake-api-key'));
    });
    await page.route('**/sites', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'site1', nmi: '4102000000', network: 'Ausgrid', status: 'active', channels: [{ identifier: 'E1', type: 'general', tariff: 'EA116' }] }]) }));
    await page.route('**/usage*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await page.goto('/');
    await page.click('[data-preset="12m"]');
    const expected = await page.evaluate(() => {
        const y = window.Amber.localYesterday();
        const first = new Date(y.getFullYear(), y.getMonth() - 12, 1);
        const last = new Date(y.getFullYear(), y.getMonth(), 0);
        return [window.Amber.formatForInput(first), window.Amber.formatForInput(last)];
    });
    await expect(page.locator('#startDate')).toHaveValue(expected[0]);
    await expect(page.locator('#endDate')).toHaveValue(expected[1]);
    expect(expected[0].endsWith('-01')).toBe(true);
});

test('Last 12 months lists each month once, even with the same month a year earlier cached', async ({ page }) => {
    test.setTimeout(120000);
    const nextDay = (d) => new Date(Date.parse(d + 'T00:00:00Z') + 86400000).toISOString().substring(0, 10);
    // 0.5 kWh every half hour: a complete day of meter data.
    const meterDay = (date) => Array.from({ length: 48 }, (_, k) => {
        const i = k + 1;
        const nemTime = i === 48 ? `${nextDay(date)}T00:00:00+10:00` : `${date}T${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}:00+10:00`;
        return { type: 'Usage', nemTime, date, kwh: 0.5, perKwh: 22, duration: 30, channelIdentifier: 'E1', quality: 'billable', channelType: 'general' };
    });
    await page.addInitScript(() => {
        const key = 'amber-compare-export-secure-key';
        const ob = (str) => btoa(str.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join(''));
        window.Amber = Object.assign(window.Amber || {}, { AUTO_COMPARE: false });
        localStorage.setItem('amberApiKey', ob('fake-api-key'));
    });
    await page.route('**/sites', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'site1', nmi: '4102000000', network: 'Ausgrid', status: 'active', channels: [{ identifier: 'E1', type: 'general', tariff: 'EA116' }] }]) }));
    await page.route('**/usage*', (r) => {
        const u = new URL(r.request().url());
        let out = [];
        for (let d = u.searchParams.get('startDate'); d <= u.searchParams.get('endDate'); d = nextDay(d)) out = out.concat(meterDay(d));
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
    });
    await page.goto('/');

    // From the page's own clock: the preset's 12 month labels, and the month 13 months back,
    // which is the same calendar month as the preset's last one (e.g. October twice).
    const { labels, olderLabel, olderStart, olderEnd } = await page.evaluate(() => {
        const y = window.Amber.localYesterday();
        const fmt = window.Amber.formatForInput;
        const label = (d) => d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
        const firsts = [];
        for (let k = 12; k >= 1; k--) firsts.push(new Date(y.getFullYear(), y.getMonth() - k, 1));
        const older = new Date(y.getFullYear(), y.getMonth() - 13, 1);
        return {
            labels: firsts.map(label),
            olderLabel: label(older),
            olderStart: fmt(older),
            olderEnd: fmt(new Date(y.getFullYear(), y.getMonth() - 12, 0))
        };
    });
    const monthCells = page.locator('#monthlyTable tbody tr td:first-child');

    // Cache the older month first.
    await page.fill('#startDate', olderStart);
    await page.fill('#endDate', olderEnd);
    await page.click('#fetchData');
    await expect(monthCells).toHaveText([olderLabel, 'Total'], { timeout: 30000 });

    // Last 12 months shows exactly its 12 months; the cached older month stays out.
    await page.click('[data-preset="12m"]');
    await expect(monthCells).toHaveText(labels.concat(['Total']), { timeout: 90000 });
});
