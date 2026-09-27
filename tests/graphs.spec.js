const { test, expect } = require('@playwright/test');
function pad(n) { return String(n).padStart(2, '0'); }

// One summer day of 30-minute data: steady 1 kW, with 4 kW in the NEM 17:00–17:30 interval
// (18:00–18:30 local daylight time).
function summerDay() {
    const out = [];
    for (let i = 1; i <= 48; i++) {
        const h = Math.floor(i / 2);
        const m = (i % 2) * 30;
        const nemTime = i === 48 ? '2026-01-16T00:00:00+10:00' : `2026-01-15T${pad(h)}:${pad(m)}:00+10:00`;
        out.push({ nemTime, date: '2026-01-15', kwh: i === 35 ? 2 : 0.5, perKwh: 30, duration: 30, channelIdentifier: 'E1', quality: 'billable', channelType: 'general' });
    }
    return out;
}

test('graphs use local time and the real interval length', async ({ page }) => {
    await page.addInitScript(() => {
        const key = 'amber-compare-export-secure-key';
        const ob = (s) => btoa(s.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join(''));
        localStorage.setItem('amberApiKey', ob('fake'));
    });
    await page.route('**/sites', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 's', nmi: '1', network: 'Ausgrid', channels: [{ identifier: 'E1', type: 'general' }] }]) }));
    await page.route('**/usage*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(summerDay()) }));
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.fill('#startDate', '2026-01-15');
    await page.fill('#endDate', '2026-01-15');
    await page.click('#fetchData');
    await page.waitForSelector('#dailyGraphSection:not(.hidden)');
    const r = await page.evaluate(() => {
        const pick = (chart) => chart.data.datasets.find((x) => /^Usage/.test(x.label) || /Average Usage/.test(x.label));
        const daily = pick(Chart.getChart('dailyChart'));
        const avg = pick(Chart.getChart('usagePriceChart'));
        const dLabels = Chart.getChart('dailyChart').data.labels;
        const aLabels = Chart.getChart('usagePriceChart').data.labels;
        const argmax = (arr) => arr.indexOf(Math.max(...arr.map((v) => v || 0)));
        return {
            dailyPeak: Math.max(...daily.data.map((v) => v || 0)),
            dailyBase: daily.data[dLabels.indexOf('12:00')],
            dailyPeakAt: dLabels[argmax(daily.data)],
            avgPeakAt: aLabels[argmax(avg.data)],
            avgPeak: Math.max(...avg.data)
        };
    });
    expect(errors).toEqual([]);
    expect(r.dailyBase).toBeCloseTo(1, 6);
    expect(r.dailyPeak).toBeCloseTo(4, 6);
    expect(r.dailyPeakAt).toBe('18:00');
    expect(r.avgPeakAt).toBe('18:00');
    expect(r.avgPeak).toBeCloseTo(4, 6);
});
