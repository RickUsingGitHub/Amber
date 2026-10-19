const { test, expect } = require('@playwright/test');

function pad(n) { return String(n).padStart(2, '0'); }

// Full days of 30-minute Amber data: evening use (EV/house), midday solar exports, a battery export at 9pm.
function amberDay(dateStr) {
    const out = [];
    for (let i = 1; i <= 48; i++) {
        const h = Math.floor((i * 30) / 60);
        const m = (i * 30) % 60;
        const endDate = h === 24 ? new Date(Date.parse(dateStr + 'T00:00:00Z') + 86400000).toISOString().substring(0, 10) : dateStr;
        const nemTime = `${endDate}T${pad(h % 24)}:${pad(m)}:00+10:00`;
        const midday = h >= 9 && h < 14;
        const evening = h >= 17 && h < 20;
        out.push({ type: 'Usage', nemTime, date: dateStr, kwh: evening ? 2 : (midday ? 0.2 : 0.4), channelIdentifier: 'E1', quality: 'billable', perKwh: evening ? 45 : 18, duration: 30, channelType: 'general' });
        out.push({ type: 'Usage', nemTime, date: dateStr, kwh: midday ? 1.2 : (h === 20 ? 3 : 0), channelIdentifier: 'B1', quality: 'billable', perKwh: h === 20 ? -30 : -2, duration: 30, channelType: 'feedIn' });
    }
    return out;
}

test.describe('Battery re-scheduling estimate', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            const key = 'amber-compare-export-secure-key';
            const ob = (str) => btoa(str.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join(''));
            window.Amber = Object.assign(window.Amber || {}, { AUTO_COMPARE: false });
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

    test('ranks free-window plans as metered and re-scheduled', async ({ page }) => {
        await page.fill('#startDate', '2025-11-01');
        await page.fill('#endDate', '2025-11-30');
        await page.click('#fetchData');
        await page.waitForSelector('#batteryShiftSection:not(.hidden)');
        const table = page.locator('#batteryShiftTable');
        await expect(table).toContainText('CovaU SolarMax');
        await expect(table).toContainText('GloBird Four4Free');
        await expect(table).toContainText('OVO The Free 4 Plan');
        await expect(table).toContainText('Solar Sharer Offer');
        await expect(table).toContainText('Shift 20 kWh/day');
        await expect(table).toContainText('1 whole month');
        await expect(page.locator('#batteryShiftMonthly')).toContainText('Total');

        await page.selectOption('#shiftBudgetSelect', '30');
        await expect(page.locator('#shiftBudgetSelect')).toHaveValue('30');
        await page.selectOption('#shiftPlanSelect', 'Solar Sharer Offer (Ausgrid, TOU)');
        await expect(page.locator('#batteryShiftMonthly')).toContainText('Nov 2025');

        await page.fill('#shiftBudgets', '5, 15');
        await page.locator('#shiftBudgets').dispatchEvent('change');
        await expect(table).toContainText('Shift 15 kWh/day');
        await expect(table).not.toContainText('Shift 20 kWh/day');
    });

    test('free window, EV rate and capped feed-in survive the plan form', async ({ page }) => {
        await page.selectOption('#stateSelector', 'NSW');
        await page.selectOption('#planSelector', 'CovaU SolarMax (Ausgrid, TOU)');
        if (await page.locator('#ratesDetails').isHidden()) await page.click('#ratesDetailsToggle');
        await expect(page.locator('#tou_free_cap')).toHaveValue('50');
        await expect(page.locator('#tou_free_windows_container .tou-start')).toHaveValue('11:00');
        await expect(page.locator('#tou_superOffpeak_rate')).toHaveValue('16.5');
        await expect(page.locator('#feedInWindowsContainer .tou-cap')).toHaveValue('30');
        await expect(page.locator('#feedInWindowsContainer .tou-over-rate')).toHaveValue('5');

        await page.selectOption('#planSelector', 'Solar Sharer Offer (Ausgrid, TOU)');
        await expect(page.locator('#tou_free_cap')).toHaveValue('24');
        await expect(page.locator('#tou_peak_windows_container')).toContainText('Months: Jan, Feb, Mar, Jun, Jul, Aug, Nov, Dec');

        // A plan without a free window clears it.
        await page.selectOption('#planSelector', '2026-27 DMO (Ausgrid, TOU)');
        await expect(page.locator('#tou_free_windows_container .tou-window')).toHaveCount(0);
        await expect(page.locator('#tou_free_cap')).toHaveValue('');
    });
});
