const { test, expect } = require('@playwright/test');

const pad = (n) => String(n).padStart(2, '0');
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().substring(0, 10);

// Two whole months of 30-minute NEM12 data (NEM time): evening use, midday exports.
function nem12(nmi, from, to) {
    const general = [];
    const exports = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
        const ymd = d.replace(/-/g, '');
        const g = Array.from({ length: 48 }, (_, i) => (i >= 34 && i < 42 ? 1.2 : 0.3));
        const b = Array.from({ length: 48 }, (_, i) => (i >= 20 && i < 30 ? 0.8 : 0));
        general.push(`300,${ymd},${g.join(',')},A,,,${ymd}235959,`);
        exports.push(`300,${ymd},${b.join(',')},A,,,${ymd}235959,`);
    }
    return ['100,NEM12,202607010000,MDP,RETAILER',
        `200,${nmi},E1B1,E1,E1,N1,M1,kWh,30,`, ...general,
        `200,${nmi},E1B1,B1,B1,N2,M1,kWh,30,`, ...exports,
        '900'].join('\n');
}

test('a household not on Amber: NEM12 import estimates Amber and compares, with no API key', async ({ page }) => {
    const apiCalls = [];
    await page.route('**/api.amber.com.au/**', (route) => { apiCalls.push(route.request().url()); return route.abort(); });
    await page.goto('/');
    await expect(page.locator('#tab-setup')).toHaveAttribute('aria-selected', 'true');

    await page.setInputFiles('#nem12File', { name: 'meter.csv', mimeType: 'text/csv', buffer: Buffer.from(nem12('4102123456', '2026-05-01', '2026-06-30')) });
    await expect(page.locator('#nem12Summary')).toContainText('NMI 4102123456: 61 days');
    await expect(page.locator('#nem12Network')).toHaveValue('ausgrid');
    await expect(page.locator('#nem12Tariff')).toHaveValue('EA025');
    await page.selectOption('#nem12Tariff', 'EA116');
    await expect(page.locator('#nem12Export')).toHaveValue('EA029');

    await page.click('#nem12Build');
    await expect(page.locator('#tab-compare')).toHaveAttribute('aria-selected', 'true');
    await page.waitForSelector('#resultsSection:not(.hidden)');
    await expect(page.locator('#estimateBanner')).toContainText("NMI 4102123456 isn't on Amber");
    await expect(page.locator('#startDate')).toHaveValue('2026-05-01');
    await expect(page.locator('#endDate')).toHaveValue('2026-06-30');
    await expect(page.locator('#results-table-container')).toContainText('Total');
    await expect(page.locator('#results-table-container')).toContainText('demand charge');
    await expect(page.locator('#siteSelector option:checked')).toContainText('not on Amber');

    // Setup shows the estimated Amber charges, read-only.
    await page.click('#tab-setup');
    await expect(page.locator('#amberChargesLocalNote')).toContainText('EA116');
    await expect(page.locator('#amberConnectionRate')).toBeDisabled();
    await expect(page.locator('#amberConnectionRate')).toHaveValue('120.956');
    await expect(page.locator('#localSitesList')).toContainText('NMI 4102123456');

    // It is remembered: a reload opens straight on Compare for that household.
    await page.reload();
    await expect(page.locator('#tab-compare')).toHaveAttribute('aria-selected', 'true');
    await page.waitForSelector('#resultsSection:not(.hidden)');
    await expect(page.locator('#estimateBanner')).not.toHaveClass(/hidden/);

    // Removing it leaves no sites.
    await page.click('#tab-setup');
    await page.click('[data-local-remove="nem12-4102123456"]');
    await expect(page.locator('#localSitesList')).toHaveText('');
    await expect(page.locator('#siteSelectorRow')).toHaveClass(/hidden/);
    expect(apiCalls).toEqual([]);
});

test('NEM12 import rejects other files and asks for the network when the NMI is unknown', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#nem12File', { name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Usage\n2026-01-01,1\n') });
    await expect(page.locator('#nem12Status')).toContainText("doesn't look like a NEM12 file");
    await page.setInputFiles('#nem12File', { name: 'm.csv', mimeType: 'text/csv', buffer: Buffer.from(nem12('9999000000', '2026-05-01', '2026-05-03')) });
    await expect(page.locator('#nem12Network')).toHaveValue('');
    await expect(page.locator('#nem12Build')).toBeDisabled();
    await page.selectOption('#nem12Network', 'powercor');
    await expect(page.locator('#nem12Tariff')).toHaveValue('PRSTOU');
    await expect(page.locator('#nem12Build')).toBeEnabled();
});

test('switching between an Amber site and an imported household swaps the Amber charges', async ({ page }) => {
    await page.addInitScript(() => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        const key = 'amber-compare-export-secure-key';
        const ob = (str) => btoa(str.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join(''));
        window.Amber = Object.assign(window.Amber || {}, { AUTO_COMPARE: false });
        localStorage.setItem('amberApiKey', ob('fake-api-key'));
        localStorage.setItem('amberConnectionRate', '130.5');
    });
    await page.addInitScript(() => { window.Amber = Object.assign(window.Amber || {}, { AUTO_COMPARE: false }); });
    await page.route('**/sites', (route) => route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 'amber1', nmi: '4102999999', network: 'Ausgrid', status: 'active', channels: [{ identifier: 'E1', type: 'general', tariff: 'EA116' }] }]) }));
    await page.goto('/');
    await page.click('#tab-setup');
    await expect(page.locator('#siteSelector option')).toHaveCount(1);
    await page.setInputFiles('#nem12File', { name: 'm.csv', mimeType: 'text/csv', buffer: Buffer.from(nem12('6203123456', '2026-05-01', '2026-05-31')) });
    await expect(page.locator('#nem12Network')).toHaveValue('powercor');
    await page.click('#nem12Build');
    await page.waitForSelector('#resultsSection:not(.hidden)');
    await expect(page.locator('#stateSelector')).toHaveValue('VIC');
    await page.click('#tab-setup');
    await expect(page.locator('#siteSelector option')).toHaveCount(2);
    await expect(page.locator('#amberConnectionRate')).toBeDisabled();

    await page.selectOption('#siteSelector', 'amber1');
    await expect(page.locator('#amberConnectionRate')).toBeEnabled();
    await expect(page.locator('#amberConnectionRate')).toHaveValue('130.5');
    await expect(page.locator('#amberChargesLocalNote')).toHaveClass(/hidden/);
});

test('header-less NEM12 (data rows only) with a daytime hot-water circuit', async ({ page }) => {
    await page.goto('/');
    const lines = [];
    for (const [suffix, fn] of [['E1', (i) => 0.03], ['E3', (i) => (i >= 180 && i < 192) || (i >= 240 && i < 252) ? 0.4 : 0]]) {
        lines.push(`200,4102382010,E1E3,${suffix},${suffix},${suffix},M1,kWh,5, `);
        for (let d = '2026-05-01'; d <= '2026-05-31'; d = addDays(d, 1)) {
            lines.push(`300,${d.replace(/-/g, '')},${Array.from({ length: 288 }, (_, i) => fn(i).toFixed(7)).join(',')} , ,20260602000000,`);
        }
    }
    await page.setInputFiles('#nem12File', { name: 'GranmasElec.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n')) });
    await expect(page.locator('#nem12Summary')).toContainText('NMI 4102382010: 31 days');
    await expect(page.locator('select[data-nem12-role="E3"]')).toHaveValue('controlledLoad');
    await expect(page.locator('#nem12ControlledRow')).toBeVisible();
    await expect(page.locator('#nem12Controlled')).toHaveValue('EA040');
    await expect(page.locator('#nem12ExportRow')).toBeHidden();
    await page.click('#nem12Build');
    await page.waitForSelector('#resultsSection:not(.hidden)');
    await expect(page.locator('#results-table-container')).toContainText('Hot water (controlled load)');
});
