const { test, expect } = require('@playwright/test');

const pad = (n) => String(n).padStart(2, '0');
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().substring(0, 10);

// Whole days of half-hourly readings for an Ausgrid home with solar and a demand tariff: enough
// use for a year's totals to run into the thousands of dollars.
function usageFor(start, end) {
    const out = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
        for (let i = 1; i <= 48; i++) {
            const h = Math.floor(i / 2);
            const endDate = h === 24 ? addDays(d, 1) : d;
            const nemTime = `${endDate}T${pad(h % 24)}:${pad((i % 2) * 30)}:00+10:00`;
            const evening = i > 34 && i <= 42;
            out.push({ type: 'Usage', nemTime, date: d, kwh: evening ? 0.9 : 0.3, perKwh: evening ? 45 : 22, duration: 30, channelIdentifier: 'E1', channelType: 'general', quality: 'billable', tariffInformation: { demandWindow: evening } });
            out.push({ type: 'Usage', nemTime, date: d, kwh: i >= 21 && i <= 30 ? 1.2 : 0, perKwh: -4, duration: 30, channelIdentifier: 'B1', channelType: 'feedIn', quality: 'billable' });
        }
    }
    return out;
}

async function amberCustomer(page) {
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
        const url = new URL(route.request().url());
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(usageFor(url.searchParams.get('startDate'), url.searchParams.get('endDate'))) });
    });
}

const compared = (page) => page.waitForFunction(() => document.querySelector('#fetchData').textContent === 'Compare costs'
    && !document.querySelector('#resultsSection').classList.contains('hidden')
    && !!document.querySelector('#monthlyTable table'), null, { timeout: 60000 });

// A year compared against a built-in plan with a long name, as most people will have.
async function compareAYear(page) {
    await amberCustomer(page);
    await page.goto('/');
    await expect(page.locator('#planSelector option')).not.toHaveCount(1);
    const plan = await page.evaluate(() => Object.keys(window.Amber.supplierTemplates.NSW).filter((name) => /Ausgrid/.test(name)).sort((a, b) => b.length - a.length)[0]);
    await page.selectOption('#planSelector', plan);
    await page.click('[data-preset="12m"]');
    await compared(page);
    return plan;
}

const boxes = (page) => page.evaluate(() => Array.from(document.querySelectorAll('[data-scroll-box]')).filter((b) => b.clientWidth > 0).map((b) => ({
    in: (b.closest('[id]') || {}).id, hidden: b.scrollWidth - b.clientWidth, hint: !b.nextElementSibling.classList.contains('hidden')
})));

// Whether an element is wholly on screen from left to right (so it needs no sideways scrolling).
const fitsAcross = (locator) => locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.left >= -0.5 && r.right <= window.innerWidth + 0.5;
});

test('on a computer every Compare and Free? table fits its card, with nothing to scroll for', async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await compareAYear(page);
    const compare = await boxes(page);
    expect(compare.map((b) => b.in)).toEqual(['results-table-container', 'allPlansTable', 'monthlyTable']);
    compare.forEach((b) => { expect(b.hidden, b.in).toBeLessThanOrEqual(1); expect(b.hint, b.in).toBe(false); });
    // All eleven month-by-month columns are on screen, the last one included.
    await expect(page.locator('#monthlyTable thead th')).toHaveCount(11);
    expect(await fitsAcross(page.locator('#monthlyTable tbody tr:first-child td:last-child'))).toBe(true);

    await page.click('#tab-free');
    await expect(page.locator('#batteryShiftMonthly table')).toBeVisible({ timeout: 30000 });
    const free = await boxes(page);
    expect(free.length).toBe(2);
    free.forEach((b) => { expect(b.hidden, b.in).toBeLessThanOrEqual(1); expect(b.hint, b.in).toBe(false); });

    // A narrower window brings back the scrolling, and the note that says so.
    await page.click('#tab-compare');
    await page.setViewportSize({ width: 700, height: 900 });
    await expect(page.locator('#monthlyTable [data-scroll-hint]')).toBeVisible();
    await expect(page.locator('#monthlyTable [data-scroll-hint]')).toContainText('Scroll the table sideways');
});

test('on a phone the answer shows both prices without swiping', async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 375, height: 740 });
    await compareAYear(page);
    const answer = (await boxes(page)).find((b) => b.in === 'results-table-container');
    expect(answer.hidden).toBeLessThanOrEqual(1);
    expect(answer.hint).toBe(false);
    // "When" and "kWh" step aside and are shown under "What" instead.
    await expect(page.locator('#results-table-container thead th').nth(1)).toBeHidden();
    await expect(page.locator('#results-table-container thead th').nth(2)).toBeHidden();
    await expect(page.locator('#results-table-container tbody tr:first-child [data-compact-only]')).toBeVisible();
    await expect(page.locator('#results-table-container tbody tr:first-child [data-compact-only]')).toContainText('kWh');
    const total = page.locator('#results-table-container tbody tr:last-child');
    await expect(total.locator('td').nth(3)).toHaveText(/^\$[\d,]+\.\d\d$/);
    expect(await fitsAcross(total.locator('td').nth(3))).toBe(true);
    expect(await fitsAcross(total.locator('td').nth(4))).toBe(true);
    // Every plan fits too; the long month table scrolls inside its card, says so, and keeps the month in view.
    expect((await boxes(page)).find((b) => b.in === 'allPlansTable').hidden).toBeLessThanOrEqual(1);
    const months = (await boxes(page)).find((b) => b.in === 'monthlyTable');
    expect(months.hidden).toBeGreaterThan(100);
    expect(months.hint).toBe(true);
    await page.locator('#monthlyTable [data-scroll-box]').evaluate((box) => { box.scrollLeft = box.scrollWidth; });
    expect(await fitsAcross(page.locator('#monthlyTable tbody tr:first-child td:first-child'))).toBe(true);
    expect(await fitsAcross(page.locator('#monthlyTable tbody tr:first-child td:last-child'))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('money, dates and rates read the same way everywhere', async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1280, height: 900 });
    const plan = await compareAYear(page);
    // Thousands are separated, in the answer, every plan and month by month.
    const total = await page.locator('#results-table-container tbody tr:last-child td').nth(3).textContent();
    expect(total.trim()).toMatch(/^\$\d,\d{3}\.\d\d$/);
    await expect(page.locator('#monthlyTable tbody tr:last-child td').nth(8)).toHaveText(total.trim());
    expect(await page.locator('#allPlansTable tbody tr:first-child td').nth(1).textContent()).toMatch(/^\$\d,\d{3}\.\d\d$/);
    expect(await page.locator('#planSelector option:checked').textContent()).toMatch(/\(\$[\d,]+\.\d\d (cheaper|more)\)|no difference/);
    // A plan's rate sits under its amount as "27.11 c/kWh"; dates are written out.
    await expect(page.locator('#results-table-container tbody tr:first-child td').nth(4)).toContainText(/\d c\/kWh$/);
    await expect(page.locator('#resultsDisclaimer')).toContainText(/as at \d{1,2} \w+ 20\d\d,/);
    await expect(page.locator('#results-table-container')).not.toContainText(/\d{4}-\d{2}-\d{2}/);
    await page.click('#tab-check');
    expect(await page.locator('#daySelector option').first().textContent()).toMatch(/^\w{3} \d{1,2} \w+ 20\d\d$/);
    expect(await page.locator('#daySelector option').first().getAttribute('value')).toMatch(/^20\d\d-\d\d-\d\d$/);

    // The table download has the same figures, without the "?" buttons or the phone-only lines.
    await page.click('#tab-compare');
    await page.click('#downloadCsvButton');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadResultsTableCsv')]);
    const csv = require('fs').readFileSync(await download.path(), 'utf8').split('\n');
    expect(csv[0]).toBe(`"What","When","kWh","Amber","${plan}"`);
    expect(csv[1]).toMatch(/^"Power bought E1","[^"]+","[\d,]+\.\d","\$[\d,]+\.\d\d","\$[\d,]+\.\d\d [\d.]+ c\/kWh"$/);
    expect(csv[csv.length - 1]).toBe(`"Total","","","${total.trim()}","${(await page.locator('#results-table-container tbody tr:last-child td').nth(4).textContent()).trim()}"`);
});
