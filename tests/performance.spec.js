
const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Amber Fetch Performance Optimization', () => {
    test.beforeEach(async ({ page }) => {
        // Mock Amber API /sites
        await page.route('**/sites', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([{
                    id: 'site123',
                    channels: [{ identifier: 'E1', type: 'general' }]
                }])
            });
        });

        // Mock Amber API /usage
        await page.route('**/usage*', async (route) => {
            const url = new URL(route.request().url());
            const startDateStr = url.searchParams.get('startDate');
            const endDateStr = url.searchParams.get('endDate');

            const start = new Date(startDateStr);
            const end = new Date(endDateStr);
            const data = [];

            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0];
                data.push({
                    nemTime: `${dateStr}T23:59:59+10:00`,
                    kwh: 1.0,
                    channelIdentifier: 'E1',
                    type: 'usage',
                    quality: 'actual',
                    perKwh: 20,
                    renewable: 50,
                    spotPerKwh: 15,
                    descriptor: 'green'
                });
            }

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(data)
            });
        });

        // Mock external CSS/JS to speed up tests
        await page.route('**/*.css', route => route.fulfill({ body: '' }));
        // But we need Tailwind and Chart.js? Actually the app uses CDN.
        // Let's not mock everything, but maybe just slow things.

        await page.goto(`file://${path.resolve(__dirname, '../index.html')}`);

        // Setup API key in localStorage
        await page.evaluate(() => {
            function obfuscate(str) {
                const key = 42;
                const xored = str.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ key)).join('');
                return btoa(xored);
            }
            localStorage.setItem('amberApiKey', obfuscate('fake-api-key'));
        });
        await page.reload();
    });

    test('should fetch multiple ranges in parallel and aggregate data', async ({ page }) => {
        await page.fill('#startDate', '2025-01-01');
        await page.fill('#endDate', '2025-01-15');

        const requestedUrls = [];
        page.on('request', request => {
            if (request.url().includes('/usage')) {
                requestedUrls.push(request.url());
            }
        });

        await page.click('#fetchDataBtn');

        // Wait for results
        await page.waitForSelector('#resultsSection:not(.hidden)', { timeout: 15000 });

        // Verify multiple chunks were requested (15 days / 7 days = ~3 chunks)
        // Actually: 1-7, 8-14, 15-15 -> 3 chunks
        expect(requestedUrls.length).toBe(3);

        // Verify progress message updated
        const message = await page.textContent('#messageEl');
        expect(message).toContain('chunks');

        // Verify data aggregation (15 days, 1 kWh each = 15 kWh)
        const usageValue = await page.locator('td:has-text("E1") + td + td').textContent();
        expect(usageValue.trim()).toBe('15.0');
    });

    test('should handle fetch errors gracefully', async ({ page }) => {
        await page.route('**/usage*startDate=2025-01-08*', async (route) => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'Internal Server Error' })
            });
        });

        await page.fill('#startDate', '2025-01-01');
        await page.fill('#endDate', '2025-01-15');

        await page.click('#fetchDataBtn');

        // Wait for error message
        await page.waitForSelector('#messageEl');
        const message = await page.textContent('#messageEl');
        expect(message).toContain('Error');
        expect(message).toContain('Internal Server Error');

        // Verify button is re-enabled
        const btnEnabled = await page.isEnabled('#fetchDataBtn');
        expect(btnEnabled).toBe(true);
    });
});
