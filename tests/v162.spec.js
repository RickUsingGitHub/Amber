const { test, expect } = require('@playwright/test');

const pad = (n) => String(n).padStart(2, '0');
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().substring(0, 10);

// Whole days of half-hourly readings for an Ausgrid home with solar. Even months send out far
// more than the free midday allowance (6.83 kWh a day); odd months stay well under it.
function usageFor(start, end) {
    const out = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
        const sunny = parseInt(d.substring(5, 7), 10) % 2 === 0;
        for (let i = 1; i <= 48; i++) {
            const h = Math.floor(i / 2);
            const endDate = h === 24 ? addDays(d, 1) : d;
            const nemTime = `${endDate}T${pad(h % 24)}:${pad((i % 2) * 30)}:00+10:00`;
            out.push({ type: 'Usage', nemTime, date: d, kwh: 0.3, perKwh: 25, duration: 30, channelIdentifier: 'E1', channelType: 'general', quality: 'billable' });
            out.push({ type: 'Usage', nemTime, date: d, kwh: i >= 21 && i <= 30 ? (sunny ? 3 : 0.2) : 0, perKwh: -4, duration: 30, channelIdentifier: 'B1', channelType: 'feedIn', quality: 'billable' });
        }
    }
    return out;
}

async function amberCustomer(page) {
    const calls = { usage: 0 };
    await page.addInitScript(() => {
        const key = 'amber-compare-export-secure-key';
        const ob = (s) => btoa(s.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join(''));
        window.Amber = Object.assign(window.Amber || {}, { AUTO_COMPARE: false });
        if (!localStorage.getItem('amberApiKey')) localStorage.setItem('amberApiKey', ob('fake-api-key'));
    });
    await page.route('**/sites', (route) => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{
            id: 'site123', nmi: '4102000000', network: 'Ausgrid', status: 'active',
            channels: [{ identifier: 'E1', type: 'general', tariff: 'EA116' }, { identifier: 'B1', type: 'feedIn', tariff: 'EA029' }]
        }])
    }));
    await page.route('**/usage*', (route) => {
        calls.usage += 1;
        const url = new URL(route.request().url());
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(usageFor(url.searchParams.get('startDate'), url.searchParams.get('endDate'))) });
    });
    return calls;
}

const compared = (page) => page.waitForFunction(() => document.querySelector('#fetchData').textContent === 'Compare costs'
    && !document.querySelector('#resultsSection').classList.contains('hidden')
    && !!document.querySelector('#monthlyTable table'), null, { timeout: 60000 });

test('a built-in plan\'s saved prices are refreshed when its published prices change', async ({ page }) => {
    await amberCustomer(page);
    await page.goto('/');
    await expect(page.locator('#planSelector option')).not.toHaveCount(1);
    const plan = await page.evaluate(() => Object.keys(window.Amber.supplierTemplates.NSW).find((name) => /Ausgrid/.test(name) && window.Amber.supplierTemplates.NSW[name].rateType === 'flat'));
    const published = await page.evaluate((name) => String(window.Amber.supplierTemplates.NSW[name].flat), plan);
    await page.selectOption('#planSelector', plan);
    await page.click('#ratesDetailsToggle');
    await expect(page.locator('#otherSupplierRate')).toHaveValue(published);

    // A price the user changes is theirs: it's still there after a reload.
    await page.fill('#otherSupplierRate', '31.5');
    await page.reload();
    await expect(page.locator('#planSelector')).toHaveValue(plan);
    await expect(page.locator('#otherSupplierRate')).toHaveValue('31.5');

    // The same saved form under a plan whose published prices have changed since (as after an
    // update to the app, or a form saved before v1.62): the plan's current prices replace it.
    for (const signature of ['an older version of this plan', null]) {
        await page.evaluate((sig) => {
            localStorage.setItem('flatRate', '12.34');
            if (sig) localStorage.setItem('selectedPlanSig', sig); else localStorage.removeItem('selectedPlanSig');
        }, signature);
        await page.reload();
        await expect(page.locator('#planSelector')).toHaveValue(plan);
        await expect(page.locator('#otherSupplierRate')).toHaveValue(published);
        expect(await page.evaluate(() => localStorage.getItem('flatRate'))).toBe(published);
    }

    // The site and Amber's own charges were left alone.
    expect(await page.evaluate(() => localStorage.getItem('selectedSiteId'))).toBe('site123');
});

test('Amber\'s total is the same in the answer and month by month when the export allowance is used up', async ({ page }) => {
    test.setTimeout(90000);
    await amberCustomer(page);
    await page.goto('/');
    await page.click('[data-preset="3m"]');
    await compared(page);
    await expect(page.locator('#results-table-container')).toContainText('Network export charge');
    const totals = await page.evaluate(() => {
        const cells = (row) => Array.from(row.querySelectorAll('td')).map((td) => td.textContent.trim());
        const answer = cells(Array.from(document.querySelectorAll('#results-table-container tbody tr')).pop());
        const months = cells(Array.from(document.querySelectorAll('#monthlyTable tbody tr')).pop());
        return { answer: answer[1], months: months[8], monthsLabel: months[0], rows: document.querySelectorAll('#monthlyTable tbody tr').length };
    });
    expect(totals.rows).toBe(4);
    expect(totals.monthsLabel).toBe('Total');
    expect(totals.answer).toMatch(/^\$\d+\.\d\d$/);
    expect(totals.months).toBe(totals.answer);
});

test('clearing saved meter readings works after a Compare and says so on any tab', async ({ page }) => {
    test.setTimeout(90000);
    const calls = await amberCustomer(page);
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('/');
    await page.click('[data-preset="lastMonth"]');
    await compared(page);
    const first = calls.usage;
    expect(first).toBeGreaterThan(0);
    await page.click('#fetchData');
    await compared(page);
    expect(calls.usage).toBe(first); // every day came from the saved readings

    // From the Compare tab: the readings go, the results go with them, and a note says so.
    await page.click('#settingsBtn');
    await page.click('#clearCacheBtn');
    await expect(page.locator('#cacheMessage')).toBeVisible();
    await expect(page.locator('#cacheMessage')).toHaveText('Saved meter readings cleared.');
    await expect(page.locator('#settingsMenu')).toBeHidden();
    await expect(page.locator('#resultsSection')).toBeHidden();
    await expect(page.locator('#downloadCsvButton')).toBeDisabled();
    await expect(page.locator('#panel-compare [data-results-placeholder]').first()).toBeVisible();

    // Nothing is left saved, so the same dates download again.
    await page.click('#fetchData');
    await compared(page);
    expect(calls.usage).toBe(first * 2);
});

test('clearing saved meter readings removes households imported from NEM12', async ({ page }) => {
    test.setTimeout(90000);
    page.on('dialog', (dialog) => dialog.accept());
    await page.route('**/api.amber.com.au/**', (route) => route.abort());
    const rows = [];
    for (let d = '2026-05-01'; d <= '2026-06-30'; d = addDays(d, 1)) {
        const ymd = d.replace(/-/g, '');
        rows.push(`300,${ymd},${Array.from({ length: 48 }, (_, i) => (i >= 34 && i < 42 ? 1.2 : 0.3)).join(',')},A,,,${ymd}235959,`);
    }
    const file = ['100,NEM12,202607010000,MDP,RETAILER', '200,4102123456,E1,E1,E1,N1,M1,kWh,30,', ...rows, '900'].join('\n');
    await page.goto('/');
    await page.setInputFiles('#nem12File', { name: 'meter.csv', mimeType: 'text/csv', buffer: Buffer.from(file) });
    await expect(page.locator('#nem12Summary')).toContainText('NMI 4102123456: 61 days');
    await page.click('#nem12Build');
    await page.waitForSelector('#resultsSection:not(.hidden)', { timeout: 30000 });
    await page.click('#tab-setup');
    await expect(page.locator('#localSitesList')).toContainText('NMI 4102123456');

    await page.click('#settingsBtn');
    await page.click('#clearCacheBtn');
    await expect(page.locator('#cacheMessage')).toHaveText('Saved meter readings cleared.');
    await expect(page.locator('#localSitesList')).toBeEmpty();
    await expect(page.locator('#welcomeCard')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('localSites'))).toBe('[]');
    await page.reload();
    await expect(page.locator('#welcomeCard')).toBeVisible();
    await expect(page.locator('#siteSelectorRow')).toBeHidden();
});

test('the settings menu has no maintainer tools, whatever the address says', async ({ page }) => {
    await amberCustomer(page);
    await page.goto('/?name=Rick&fakeControlledLoad=1');
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsMenu [role="menuitem"]')).toHaveCount(2);
    await expect(page.locator('#clearCacheBtn')).toBeVisible();
    await expect(page.locator('#clearCustomPlansBtn')).toBeVisible();
});
