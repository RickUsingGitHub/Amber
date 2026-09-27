const { test, expect } = require('@playwright/test');

function pad(n) { return String(n).padStart(2, '0'); }
function addDays(d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().substring(0, 10); }

// 0.5 kWh every half hour at 22c inc GST, one 2 kW demand peak on 10 Jul 2025.
function amberDay(date) {
    const out = [];
    for (let i = 1; i <= 48; i++) {
        const h = Math.floor(i / 2);
        const nemTime = i === 48 ? `${addDays(date, 1)}T00:00:00+10:00` : `${date}T${pad(h)}:${i % 2 ? '30' : '00'}:00+10:00`;
        const kwh = date === '2025-07-10' && i === 36 ? 1 : (date === '2025-07-10' && i === 35 ? 0 : 0.5);
        out.push({ type: 'Usage', nemTime, date, kwh, perKwh: 22, duration: 30, channelIdentifier: 'E1', quality: 'billable', channelType: 'general', tariffInformation: { demandWindow: h >= 15 && h < 21 } });
    }
    return out;
}

const BILL = `Billing Period: 31 days (01/07/2025 - 31/07/2025)
Usage 744.00 kWh 0.2000 $/kWh $148.80
Network Daily Supply Charges 31 days 1.1397 $/Day $35.33
Network Demand Charges $24.48
Amber Monthly Subscription $23.16
GST - 10% $23.18
CHARGES TOTAL $254.95
Network - Peak Demand 01 Jul - 31 Jul 2.00 kW 12.2397 $/kW/Day $24.48
Network - Daily 01 Jul - 31 Jul 31 0.7103 $22.02
Metering Charge 01 Jul - 31 Jul 31 0.4294 $13.31
Daily Supply Totals (excl GST): $35.33
Amber Monthly Subscription 01 Jul - 31 Jul 31 0.7471 $23.16
Amber Fee Totals (excl GST): $23.16
`;

test('bill check and monthly breakdown', async ({ page }) => {
    await page.addInitScript(() => {
        const key = 'amber-compare-export-secure-key';
        const ob = (s) => btoa(s.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join(''));
        localStorage.setItem('amberApiKey', ob('fake'));
    });
    await page.route('**/sites', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 's', nmi: '1', network: 'Ausgrid', channels: [{ identifier: 'E1', type: 'general' }] }]) }));
    await page.route('**/usage*', (r) => {
        const u = new URL(r.request().url());
        let out = [];
        for (let d = u.searchParams.get('startDate'); d <= u.searchParams.get('endDate'); d = addDays(d, 1)) out = out.concat(amberDay(d));
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');

    await page.click('#ratesDetailsToggle');
    await page.setInputFiles('#amberBillFile', { name: 'bill.txt', mimeType: 'text/plain', buffer: Buffer.from(BILL) });
    await expect(page.locator('#billCheckSection')).toBeVisible();
    await expect(page.locator('#billCheckPeriod')).toContainText(/1 July? 2025 to 31 July? 2025 \(31 days\)/);
    await page.click('#billCheckLoad');
    await page.waitForSelector('#billCheckBody table');
    const rows = page.locator('#billCheckBody tbody tr');
    await expect(rows).toHaveCount(8);
    await expect(page.locator('#billCheckBody [aria-label="matches"]')).toHaveCount(8);
    await expect(page.locator('#billCheckLoad')).toBeHidden();
    await page.locator('#billCheckSection').screenshot({ path: 'test-results/bill-check.png' });

    // Monthly table total matches the Results table
    await expect(page.locator('#monthlySection')).toBeVisible();
    const monthlyTotal = await page.locator('#monthlyTable tbody tr:last-child td:nth-child(9)').textContent();
    const resultsTotal = await page.locator('#results-table-container tr:has-text("Total") td:nth-child(2)').last().textContent();
    expect(monthlyTotal.trim()).toBe(resultsTotal.trim());

    // Survives a reload
    await page.reload();
    await expect(page.locator('#billCheckSection')).toBeVisible();
    await expect(page.locator('#billCheckLoad')).toBeVisible();
    expect(errors).toEqual([]);
});
