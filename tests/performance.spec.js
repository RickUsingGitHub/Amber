const { test, expect } = require('@playwright/test');

async function seedKey(page) {
    await page.addInitScript(() => {
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

    test('should fetch multiple ranges in parallel and aggregate data', async ({ page }) => {
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

    test('should keep successful chunks when one range fails', async ({ page }) => {
        await page.route('**/usage*startDate=2025-01-08*', async (route) => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'Internal Server Error' })
            });
        });

        await page.fill('#startDate', '2025-01-01');
        await page.fill('#endDate', '2025-01-15');
        await page.click('#fetchData');

        await page.waitForSelector('#resultsSection:not(.hidden)', { timeout: 15000 });
        const message = await page.textContent('#message');
        expect(message).toMatch(/failed|Error|Some days/i);
        await expect(page.locator('#fetchData')).toBeEnabled();
        const usageValue = await page.locator('td:has-text("E1") + td + td').textContent();
        expect(Number(usageValue.trim())).toBeGreaterThan(0);
        expect(Number(usageValue.trim())).toBeLessThan(15);
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

    test('date preset Last 7 days fills a week ending yesterday', async ({ page }) => {
        await page.click('[data-preset="7d"]');
        const start = await page.inputValue('#startDate');
        const end = await page.inputValue('#endDate');
        const startDate = new Date(start + 'T00:00:00');
        const endDate = new Date(end + 'T00:00:00');
        expect(Math.round((endDate - startDate) / 86400000)).toBe(6);
    });
});
