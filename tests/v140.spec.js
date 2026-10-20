const { test, expect } = require('@playwright/test');

function pad(n) { return String(n).padStart(2, '0'); }
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().substring(0, 10);

// Solar-only day: evening use, midday exports, nothing exported after dark.
function solarDay(dateStr) {
    const out = [];
    for (let i = 1; i <= 48; i++) {
        const h = Math.floor(i / 2);
        const m = (i % 2) * 30;
        const end = h === 24 ? addDays(dateStr, 1) : dateStr;
        const nemTime = `${end}T${pad(h % 24)}:${pad(m)}:00+10:00`;
        const evening = h >= 17 && h < 21;
        const midday = h >= 10 && h < 15;
        out.push({ type: 'Usage', nemTime, date: dateStr, kwh: evening ? 1.5 : 0.3, channelIdentifier: 'E1', quality: 'billable', perKwh: evening ? 40 : 20, duration: 30, channelType: 'general' });
        out.push({ type: 'Usage', nemTime, date: dateStr, kwh: midday ? 1.5 : 0, channelIdentifier: 'B1', quality: 'billable', perKwh: -3, duration: 30, channelType: 'feedIn' });
    }
    return out;
}

async function setup(page, extraInit) {
    await page.addInitScript((extra) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        const key = 'amber-compare-export-secure-key';
        const ob = (str) => btoa(str.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join(''));
        window.Amber = Object.assign(window.Amber || {}, { AUTO_COMPARE: false });
        localStorage.setItem('amberApiKey', ob('fake-api-key'));
        Object.keys(extra || {}).forEach((k) => localStorage.setItem(k, extra[k]));
    }, extraInit || {});
    await page.addInitScript(() => { window.Amber = Object.assign(window.Amber || {}, { AUTO_COMPARE: false }); });
    await page.route('**/sites', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'site1', nmi: '4102000000', network: 'Ausgrid', status: 'active',
            channels: [{ identifier: 'E1', type: 'general', tariff: 'EA116' }, { identifier: 'B1', type: 'feedIn', tariff: 'EA029' }] }])
    }));
    await page.route('**/usage*', (route) => {
        const url = new URL(route.request().url());
        let data = [];
        for (let d = url.searchParams.get('startDate'); d <= url.searchParams.get('endDate'); d = addDays(d, 1)) data = data.concat(solarDay(d));
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto('/');
}

test('charges before 1 July use last year\'s rates, and old saved rates move there', async ({ page }) => {
    // Saved before v1.40: one set, at the 2025-26 values.
    await setup(page, { amberConnectionRate: '116.787', amberSubscriptionRate: '82.181', amberDemandRate: '42.345' });
    await page.click('#tab-setup');
    await expect(page.locator('#amberConnectionRate')).toHaveValue('125.367');
    await expect(page.locator('#amberDemandRate')).toHaveValue('43.431');
    await expect(page.locator('#amberConnectionRatePrev')).toHaveValue('116.787');
    await expect(page.locator('#amberDemandRatePrev')).toHaveValue('42.345');

    await page.fill('#startDate', '2026-06-29');
    await page.fill('#endDate', '2026-07-02');
    await page.click('#fetchData');
    await page.waitForSelector('#resultsSection:not(.hidden)');
    // 2 days at 116.787 + 2 days at 125.367 c/day.
    const row = page.locator('#results-table-container tr', { hasText: 'Daily Connection' });
    await expect(row).toContainText('$4.84');
});

test('a bill for a period before 1 July fills last year\'s charges', async ({ page }) => {
    await setup(page);
    await page.click('#tab-setup');
    const bill = `Billing Period: 30 days (01/06/2026 - 30/06/2026)
Network - Daily 01 Jun - 30 Jun 30 0.6660 $19.98
Metering Charge 01 Jun - 30 Jun 30 0.3957 $11.87
Daily Supply Totals (excl GST): $31.85
Network - Peak Demand 01 Jun - 30 Jun 10.26 kW 11.5486 $/kW/Day $118.46
Demand Totals (excl GST): $118.46
Amber Monthly Subscription 01 Jun - 30 Jun 30 0.7471 $22.41
Amber Fee Totals (excl GST): $22.41
`;
    await page.setInputFiles('#amberBillFile', { name: 'june.txt', mimeType: 'text/plain', buffer: Buffer.from(bill) });
    await expect(page.locator('#amberBillStatus')).toContainText('last year');
    await expect(page.locator('#amberConnectionRatePrev')).toHaveValue('116.787');
    await expect(page.locator('#amberConnectionRate')).toHaveValue('125.367');
});

test('solar-only data: the re-scheduling estimate assumes no battery until one is entered', async ({ page }) => {
    await setup(page);
    await page.fill('#startDate', '2025-11-01');
    await page.fill('#endDate', '2025-11-30');
    await page.click('#fetchData');
    await page.waitForSelector('#batteryShiftSection:not(.hidden)');
    const note = page.locator('#shiftBatteryNote');
    await expect(note).toContainText('assumes no battery');
    await expect(page.locator('#batteryShiftTable')).toContainText('Shift 20 kWh/day');
    const before = await page.locator('#batteryShiftTable').innerText();

    await page.fill('#shiftBatteryKwh', '13.5');
    await page.locator('#shiftBatteryKwh').dispatchEvent('change');
    await expect(note).toContainText('Battery 13.5 kWh');
    await expect.poll(() => page.locator('#batteryShiftTable').innerText()).not.toBe(before);

    // The size is remembered.
    await page.reload();
    await expect(page.locator('#shiftBatteryKwh')).toHaveValue('13.5');
});
