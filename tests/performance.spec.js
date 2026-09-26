const { test, expect } = require('@playwright/test');

async function seedKey(page) {
    await page.addInitScript(() => {
        // Keep retry back-off short in tests.
        window.Amber = window.Amber || {};
        window.Amber.RETRY_DELAYS_MS = [50, 50, 50];
        function obfuscate(str) {
            const key = 'amber-compare-export-secure-key';
            return btoa(str.split('').map((char, i) =>
                String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
            ).join(''));
        }
        localStorage.setItem('amberApiKey', obfuscate('fake-api-key'));
        localStorage.setItem('rememberApiKey', 'true');
    });
}

function usageForRange(startDateStr, endDateStr) {
    const start = new Date(startDateStr + 'T00:00:00Z');
    const end = new Date(endDateStr + 'T00:00:00Z');
    const data = [];
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        data.push({
            type: 'Usage',
            nemTime: `${dateStr}T23:59:59+10:00`,
            date: dateStr,
            kwh: 1.0,
            channelIdentifier: 'E1',
            quality: 'billable',
            perKwh: 20,
            renewable: 50,
            spotPerKwh: 15,
            descriptor: 'neutral',
            duration: 30,
            startTime: `${dateStr}T13:00:00Z`,
            endTime: `${dateStr}T13:30:00Z`,
            channelType: 'general'
        });
    }
    return data;
}

test.describe('Amber fetch and UI', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/sites', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([{
                    id: 'site123',
                    nmi: '4102000000',
                    network: 'Ausgrid',
                    status: 'active',
                    channels: [{ identifier: 'E1', type: 'general', tariff: 'A100' }]
                }])
            });
        });

        await page.route('**/usage*', async (route) => {
            const url = new URL(route.request().url());
            const startDateStr = url.searchParams.get('startDate');
            const endDateStr = url.searchParams.get('endDate');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(usageForRange(startDateStr, endDateStr))
            });
        });

        await seedKey(page);
        await page.goto('/');
        await page.locator('#apiKey').waitFor();
    });

    test('should fetch a 15-day range as 7-day chunks', async ({ page }) => {
        await page.fill('#startDate', '2025-01-01');
        await page.fill('#endDate', '2025-01-15');

        const requestedUrls = [];
        page.on('request', (request) => {
            if (request.url().includes('/usage')) requestedUrls.push(request.url());
        });

        await page.click('#fetchData');
        await page.waitForSelector('#resultsSection:not(.hidden)', { timeout: 15000 });

        expect(requestedUrls.length).toBe(3);
        const usageValue = await page.locator('td:has-text("E1") + td + td').textContent();
        expect(usageValue.trim()).toBe('15.0');
    });

    test('should fetch a 21-day range as three 7-day chunks', async ({ page }) => {
        await page.fill('#startDate', '2025-01-01');
        await page.fill('#endDate', '2025-01-21');

        const requestedUrls = [];
        page.on('request', (request) => {
            if (request.url().includes('/usage')) requestedUrls.push(request.url());
        });

        await page.click('#fetchData');
        await page.waitForSelector('#resultsSection:not(.hidden)', { timeout: 15000 });

        expect(requestedUrls.length).toBe(3);
    });

    test('should keep successful chunks when one range fails', async ({ page }) => {
        await page.route('**/usage*startDate=2025-01-15*', async (route) => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'Internal Server Error' })
            });
        });

        await page.fill('#startDate', '2025-01-01');
        await page.fill('#endDate', '2025-02-14');
        await page.click('#fetchData');

        await page.waitForSelector('#resultsSection:not(.hidden)', { timeout: 15000 });
        const message = await page.textContent('#message');
        expect(message).toMatch(/failed|Error|Some days/i);
        await expect(page.locator('#fetchData')).toBeEnabled();
        const usageValue = await page.locator('td:has-text("E1") + td + td').textContent();
        expect(Number(usageValue.trim())).toBeGreaterThan(0);
        expect(Number(usageValue.trim())).toBeLessThan(45);
    });

    test('retries "Failed to fetch" and recovers', async ({ page }) => {
        let failures = 0;
        await page.route('**/usage*startDate=2025-01-15*', async (route) => {
            if (failures < 2) {
                failures++;
                await route.abort('failed');
                return;
            }
            await route.fallback();
        });
        await page.fill('#startDate', '2025-01-01');
        await page.fill('#endDate', '2025-02-14');
        await page.click('#fetchData');
        await page.waitForSelector('#resultsSection:not(.hidden)', { timeout: 15000 });
        expect(failures).toBe(2);
        await expect(page.locator('#message')).not.toContainText("Couldn't load");
    });

    test('persistent "Failed to fetch" names the missing days and the rate limit', async ({ page }) => {
        await page.route('**/usage*startDate=2025-01-15*', (route) => route.abort('failed'));
        await page.fill('#startDate', '2025-01-01');
        await page.fill('#endDate', '2025-02-14');
        await page.click('#fetchData');
        await page.waitForSelector('#resultsSection:not(.hidden)', { timeout: 15000 });
        const message = await page.textContent('#message');
        expect(message).toContain("Couldn't load 7 day(s): 15 Jan–21 Jan");
        expect(message).toContain('50 requests per 5 minutes');
    });

    test('Compare reuses prefetched sites instead of calling /sites again', async ({ page }) => {
        await expect(page.locator('#siteSelectorRow')).toBeVisible({ timeout: 5000 });
        let sitesCalls = 0;
        page.on('request', (request) => {
            const path = new URL(request.url()).pathname;
            if (path.endsWith('/sites')) sitesCalls += 1;
        });
        await page.fill('#startDate', '2025-01-10');
        await page.fill('#endDate', '2025-01-10');
        await page.click('#fetchData');
        await page.waitForSelector('#resultsSection:not(.hidden)', { timeout: 15000 });
        expect(sitesCalls).toBe(0);
    });

    test('hung sites request times out instead of hanging', { timeout: 25000 }, async ({ page }) => {
        await page.unroute('**/sites');
        await page.route('**/sites', async () => {
            await new Promise(() => {});
        });
        await page.reload();
        await page.locator('#apiKey').waitFor();
        await page.fill('#startDate', '2025-01-10');
        await page.fill('#endDate', '2025-01-10');
        await page.click('#fetchData');
        await expect(page.locator('#message')).toContainText(/Timed out/i, { timeout: 20000 });
        await expect(page.locator('#fetchData')).toBeEnabled();
    });

    test('exposes export, date presets, remember-key and site selector', async ({ page }) => {
        await expect(page.locator('#downloadCsvButton')).toHaveText(/Export/);
        await expect(page.locator('[data-preset="7d"]')).toBeVisible();
        await expect(page.locator('#rememberApiKey')).toBeVisible();
        await page.click('#fetchData');
        await page.waitForSelector('#resultsSection:not(.hidden)', { timeout: 15000 });
        await expect(page.locator('#siteSelectorRow')).toBeVisible();
        await expect(page.locator('#allPlansSection')).toBeVisible();
        await expect(page.locator('#resultsDisclaimer')).not.toHaveText('');
    });

    test('date preset Last 7 days fills a week ending yesterday and compares', async ({ page }) => {
        await page.click('[data-preset="7d"]');
        const start = await page.inputValue('#startDate');
        const end = await page.inputValue('#endDate');
        const startDate = new Date(start + 'T00:00:00');
        const endDate = new Date(end + 'T00:00:00');
        expect(Math.round((endDate - startDate) / 86400000)).toBe(6);
        await page.waitForSelector('#resultsSection:not(.hidden)', { timeout: 15000 });
    });

    test('date preset Last 3 months is the previous three calendar months and compares', async ({ page }) => {
        await page.click('[data-preset="3m"]');
        const start = await page.inputValue('#startDate');
        const end = await page.inputValue('#endDate');
        const now = new Date();
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const expectedStart = new Date(yesterday.getFullYear(), yesterday.getMonth() - 3, 1);
        const expectedEnd = new Date(yesterday.getFullYear(), yesterday.getMonth(), 0);
        const pad = (n) => String(n).padStart(2, '0');
        const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        expect(start).toBe(fmt(expectedStart));
        expect(end).toBe(fmt(expectedEnd));
        await page.waitForSelector('#resultsSection:not(.hidden)', { timeout: 15000 });
    });
});
