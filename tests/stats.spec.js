const { test, expect } = require('@playwright/test');

function pad(n) { return String(n).padStart(2, '0'); }

// Full days of 30-minute Amber data: 0.3 kWh per half hour overnight, spikes at 18:00.
function amberDay(dateStr) {
    const out = [];
    for (let i = 1; i <= 48; i++) {
        const h = Math.floor((i * 30) / 60);
        const m = (i * 30) % 60;
        const endDate = h === 24 ? new Date(Date.parse(dateStr + 'T00:00:00Z') + 86400000).toISOString().substring(0, 10) : dateStr;
        const nemTime = `${endDate}T${pad(h % 24)}:${pad(m)}:00+10:00`;
        const day = h >= 8 && h < 17;
        out.push({ type: 'Usage', nemTime, date: dateStr, kwh: day ? 0 : 0.3, channelIdentifier: 'E1', quality: 'billable', perKwh: i === 36 ? 90 : 25, duration: 30, channelType: 'general' });
        out.push({ type: 'Usage', nemTime, date: dateStr, kwh: day ? 1.5 : 0, channelIdentifier: 'B1', quality: 'billable', perKwh: -6, duration: 30, channelType: 'feedIn' });
    }
    return out;
}

function teslaDay(dateStr) {
    let csv = 'Date time,Home (kW),Solar (kW),Powerwall (kW),Grid (kW),Energy Remaining (%)\n';
    for (let i = 0; i < 288; i++) {
        const h = Math.floor(i / 12);
        const kw = h === 19 ? 2.5 : 0.45;
        csv += `${dateStr}T${pad(h)}:${pad((i % 12) * 5)}:00+10:00,${kw},0,${kw},0,50\n`;
    }
    return csv;
}

test.describe('Overnight & Backup Reserve', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            const key = 'amber-compare-export-secure-key';
            const ob = (str) => btoa(str.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join(''));
            localStorage.setItem('amberApiKey', ob('fake-api-key'));
        });
        await page.route('**/sites', (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{
                id: 'site123', nmi: '4102000000', network: 'Ausgrid', status: 'active',
                channels: [{ identifier: 'E1', type: 'general', tariff: 'EA116' }, { identifier: 'B1', type: 'feedIn', tariff: 'EA029' }]
            }])
        }));
        await page.route('**/usage*', (route) => {
            const url = new URL(route.request().url());
            const start = url.searchParams.get('startDate');
            const end = url.searchParams.get('endDate');
            let data = [];
            for (let d = start; d <= end; d = new Date(Date.parse(d + 'T00:00:00Z') + 86400000).toISOString().substring(0, 10)) {
                data = data.concat(amberDay(d));
            }
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
        });
        await page.goto('/');
    });

    test('Amber-only stats, then Tesla upload', async ({ page }) => {
        await page.fill('#startDate', '2025-07-01');
        await page.fill('#endDate', '2025-07-07');
        await page.click('#fetchData');
        await page.waitForSelector('#nightStatsSection:not(.hidden)');

        await expect(page.locator('#nsNote')).toContainText('grid import');
        await expect(page.locator('#nsBody')).toContainText('Suggested backup reserve');
        await expect(page.locator('#nsBody')).toContainText('Longest night');
        await expect(page.locator('#moreStatsSection')).toBeVisible();
        await expect(page.locator('#moreStatsTable')).toContainText('Average import price');

        const files = ['2025-07-01', '2025-07-02', '2025-07-03'].map((d) => ({
            name: `tesla-${d}.csv`, mimeType: 'text/csv', buffer: Buffer.from(teslaDay(d))
        }));
        await page.setInputFiles('#nsTeslaFiles', files);
        await expect(page.locator('#nsTeslaStatus')).toContainText('Added 3 file(s)');
        await expect(page.locator('input[name="nightSource"][value="tesla"]')).toBeChecked();
        await expect(page.locator('#nsNote')).toBeHidden();
        await expect(page.locator('#nsBody')).toContainText('2 nights');

        await page.fill('#nsBatteryKwh', '27');
        await page.dispatchEvent('#nsBatteryKwh', 'change');
        await expect(page.locator('#nsBody')).toContainText('of 27.0 kWh');

        await page.waitForTimeout(1500);
        await page.locator('#nightStatsSection').screenshot({ path: 'test-results/night-stats.png' });
        await page.locator('#moreStatsSection').screenshot({ path: 'test-results/more-stats.png' });

        await page.reload();
        await page.fill('#startDate', '2025-07-01');
        await page.fill('#endDate', '2025-07-07');
        await page.click('#fetchData');
        await page.waitForSelector('#nightStatsSection:not(.hidden)');
        await expect(page.locator('#nsTeslaStatus')).toContainText('Loaded 864 readings');
    });
});
