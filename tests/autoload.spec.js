const { test, expect } = require('@playwright/test');

function pad(n) { return String(n).padStart(2, '0'); }
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().substring(0, 10);

function amberDay(dateStr) {
    const out = [];
    for (let i = 1; i <= 48; i++) {
        const h = Math.floor(i / 2);
        const m = (i % 2) * 30;
        const end = h === 24 ? addDays(dateStr, 1) : dateStr;
        out.push({ type: 'Usage', nemTime: `${end}T${pad(h % 24)}:${pad(m)}:00+10:00`, date: dateStr, kwh: 0.5, channelIdentifier: 'E1', quality: 'billable', perKwh: 20, duration: 30, channelType: 'general' });
    }
    return out;
}

async function mockAmber(page, usageRequests) {
    await page.route('**/sites', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'site1', nmi: '4102000000', network: 'Ausgrid', status: 'active', channels: [{ identifier: 'E1', type: 'general', tariff: 'EA116' }] }])
    }));
    await page.route('**/usage*', (route) => {
        const url = new URL(route.request().url());
        const start = url.searchParams.get('startDate');
        const end = url.searchParams.get('endDate');
        usageRequests.push([start, end]);
        let data = [];
        for (let d = start; d <= end; d = addDays(d, 1)) data = data.concat(amberDay(d));
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
}

test('with a saved key, opens on this month and compares', async ({ page }) => {
    await page.addInitScript(() => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        const key = 'amber-compare-export-secure-key';
        const ob = (str) => btoa(str.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join(''));
        localStorage.setItem('amberApiKey', ob('fake-api-key'));
        // An older range from last time is replaced by this month.
        localStorage.setItem('startDate', '2025-01-01');
        localStorage.setItem('endDate', '2025-01-31');
    });
    const usageRequests = [];
    await mockAmber(page, usageRequests);
    await page.goto('/');

    const yesterday = await page.evaluate(() => window.Amber.formatForInput(window.Amber.localYesterday()));
    const first = yesterday.substring(0, 8) + '01';
    await expect(page.locator('#startDate')).toHaveValue(first);
    await expect(page.locator('#endDate')).toHaveValue(yesterday);
    await page.waitForSelector('#resultsSection:not(.hidden)');
    await expect(page.locator('#tab-compare')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#results-table-container')).toContainText('Total');

    const fetched = usageRequests.map((r) => r[0]).sort();
    expect(fetched[0]).toBe(first);
    expect(usageRequests.every(([s, e]) => s >= first && e <= yesterday)).toBe(true);

    // A manual Compare still uses whatever dates are chosen afterwards.
    const before = usageRequests.length;
    await page.fill('#startDate', '2025-03-03');
    await page.fill('#endDate', '2025-03-04');
    await page.click('#fetchData');
    await expect(page.locator('#resultsDisclaimer')).not.toHaveText('');
    await expect.poll(() => usageRequests.slice(before).some(([s]) => s === '2025-03-03')).toBe(true);
});

test('without a key, nothing loads and Setup opens', async ({ page }) => {
    const usageRequests = [];
    await mockAmber(page, usageRequests);
    await page.goto('/');
    await expect(page.locator('#tab-setup')).toHaveAttribute('aria-selected', 'true');
    await page.waitForTimeout(500);
    expect(usageRequests).toEqual([]);
    await expect(page.locator('#resultsSection')).toHaveClass(/hidden/);
});
