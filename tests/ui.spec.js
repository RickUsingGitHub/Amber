const { test, expect } = require('@playwright/test');

test.describe('Amber UI flows', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            function obfuscate(str) {
                const key = 'amber-compare-export-secure-key';
                return btoa(str.split('').map((char, i) =>
                    String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
                ).join(''));
            }
            localStorage.setItem('amberApiKey', obfuscate('fake-api-key'));
        });
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
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([{
                    type: 'Usage',
                    nemTime: `${startDateStr}T12:00:00+10:00`,
                    date: startDateStr,
                    kwh: 2.5,
                    channelIdentifier: 'E1',
                    quality: 'billable',
                    perKwh: 25,
                    renewables: 40,
                    spotPerKwh: 20,
                    duration: 30,
                    channelType: 'general'
                }])
            });
        });
        await page.goto('/');
    });

    test('rates panel, TOU, GST, export menu and calendar click', async ({ page }) => {
        await page.click('#ratesDetailsToggle');
        await expect(page.locator('#ratesDetails')).toBeVisible();
        await expect(page.locator('#ratesGstNote')).toContainText(/inc GST/i);
        await expect(page.locator('#amberRatesGstNote')).toContainText(/inc GST/i);
        await expect(page.locator('#gstLabel')).toHaveText(/inc GST/i);
        await page.check('input[name="rateType"][value="tou"]');
        await expect(page.locator('#touRateSection')).toBeVisible();
        await expect(page.locator('#flatRateSection')).toBeHidden();

        await page.fill('#startDate', '2025-01-10');
        await page.fill('#endDate', '2025-01-10');
        await page.click('#fetchData');
        await page.waitForSelector('#resultsSection:not(.hidden)');

        await expect(page.locator('#averageGraphContainer')).toBeVisible();
        await expect(page.locator('#dailyGraphSection')).toBeVisible();
        await expect(page.locator('#calendarSection')).toBeVisible();

        await page.click('#gstToggle', { force: true });
        await expect(page.locator('#resultsSection')).toBeVisible();
        await expect(page.locator('#results-table-container table')).toBeVisible();

        await page.click('#downloadCsvButton');
        await expect(page.locator('#csvDropdownMenu')).toBeVisible();
        await expect(page.locator('#downloadFullIntervalCsv')).toBeVisible();

        const day = page.locator('.calendar-day.has-data').first();
        await expect(day).toBeVisible();
        await day.click();
        await expect(page.locator('#dailyGraphSection')).toBeVisible();
    });

    test('mobile viewport keeps compare and presets usable', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.locator('#fetchData')).toBeVisible();
        await expect(page.locator('[data-preset="lastMonth"]')).toBeVisible();
        await page.click('#settingsBtn');
        await expect(page.locator('#settingsMenu')).toBeVisible();
        await expect(page.locator('#clearCacheBtn')).toBeVisible();
    });

    test('hidden configuration still shows dates and Compare', async ({ page }) => {
        await page.click('#toggleConfigBtn');
        await expect(page.locator('#configDetails')).toBeHidden();
        await expect(page.locator('#apiKey')).toBeHidden();
        await expect(page.locator('#startDate')).toBeVisible();
        await expect(page.locator('#endDate')).toBeVisible();
        await expect(page.locator('label[for="startDate"]')).toHaveText('Start');
        await expect(page.locator('label[for="endDate"]')).toHaveText('End');
        await expect(page.locator('#fetchData')).toBeVisible();
        await expect(page.locator('[data-preset="7d"]')).toBeVisible();
        await expect(page.locator('#planSelector')).toBeVisible();
    });
});
