const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

async function setup(page) {
    await page.addInitScript(() => {
        window.Amber = { AUTO_COMPARE: false };
        const key = 'amber-compare-export-secure-key';
        localStorage.setItem('amberApiKey', btoa([... 'test-key'].map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join('')));
    });
    await page.route('**/sites', (r) => r.fulfill({ json: [{ id: 'site1', nmi: '4102000000', network: 'Ausgrid', channels: [{ identifier: 'E1', type: 'general' }] }] }));
    await page.route('**/usage*', (r) => {
        const rows = [];
        for (const date of ['2026-06-01', '2026-06-03']) for (let i = 1; i <= 48; i++) {
            rows.push({ type: 'Usage', date, channelIdentifier: 'E1', channelType: 'general', quality: 'billable', duration: 30, kwh: 0.5, perKwh: 30,
                nemTime: new Date(Date.parse(date + 'T00:00:00Z') + i * 1800000).toISOString().substring(0, 19) + '+10:00' });
        }
        return r.fulfill({ json: rows });
    });
    await page.goto('/');
}

test('missing dates stay unavailable and the incomplete warning survives recalculation', async ({ page }) => {
    await setup(page);
    await page.fill('#startDate', '2026-06-01');
    await page.fill('#endDate', '2026-06-03');
    await page.click('#fetchData');
    const results = page.locator('#results-table-container');
    await expect(results).toContainText('1 of 3 days have no readings');
    await expect(results).toContainText('savings are provisional');
    await page.click('#gstToggle', { force: true });
    await expect(results).toContainText('1 of 3 days have no readings');
    await page.click('#tab-check');
    await expect(page.locator('[aria-label="2026-06-02: no readings"]')).toBeVisible();
    await expect(page.locator('.has-data[data-date="2026-06-02"]')).toHaveCount(0);
});

test('downloaded interval CSV restores into a fresh browser cache', async ({ page, browser }) => {
    await setup(page);
    await page.fill('#startDate', '2026-06-01');
    await page.fill('#endDate', '2026-06-03');
    await page.click('#fetchData');
    await expect(page.locator('#resultsSection')).toBeVisible();
    await page.click('#downloadCsvButton');
    const downloading = page.waitForEvent('download');
    await page.click('#downloadFullIntervalCsv');
    const download = await downloading;
    const buffer = await fs.readFile(await download.path());
    expect(buffer.toString()).toContain('Amber Compare CSV Version');
    expect(buffer.toString()).toContain('2026-06-04 00:00:00');
    const fresh = await browser.newContext();
    try {
        const restored = await fresh.newPage();
        await setup(restored);
        await restored.click('#tab-setup');
        await restored.setInputFiles('#usageCsvFile', { name: download.suggestedFilename(), mimeType: 'text/csv', buffer });
        await expect(restored.locator('#usageImportStatus')).toContainText('Imported 2 days');
        await expect(restored.locator('#usageImportStatus')).toContainText('restored from the backup');
        const rows = await restored.evaluate(async () => {
            const db = await Amber.openDb();
            const cache = await Amber.loadAllSiteCache(db, 'site1');
            db.close();
            return cache.byDate;
        });
        expect(Object.keys(rows).sort()).toEqual(['2026-06-01', '2026-06-03']);
        expect(rows['2026-06-03']).toHaveLength(48);
        expect(rows['2026-06-03'][47].nemTime).toBe('2026-06-04T00:00:00+10:00');
    } finally { await fresh.close(); }
});
