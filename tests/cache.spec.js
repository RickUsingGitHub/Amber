const { test, expect } = require('@playwright/test');

function pad(n) { return String(n).padStart(2, '0'); }
function addDays(d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().substring(0, 10); }

// Amber-like server: no data before ACCOUNT_START, the last two days estimated,
// and yesterday only half-published.
const ACCOUNT_START = '2026-03-10';
function amberDay(dateStr, yesterday) {
    if (dateStr < ACCOUNT_START) return [];
    const estimated = dateStr >= addDays(yesterday, -1);
    const intervals = dateStr === yesterday ? 24 : 48;
    const out = [];
    for (let i = 1; i <= intervals; i++) {
        const h = Math.floor(i / 2);
        const m = (i % 2) * 30;
        const endDate = h === 24 ? addDays(dateStr, 1) : dateStr;
        out.push({
            type: 'Usage', nemTime: `${endDate}T${pad(h % 24)}:${pad(m)}:00+10:00`, date: dateStr,
            kwh: 0.3, channelIdentifier: 'E1', quality: estimated ? 'estimated' : 'billable',
            perKwh: 25, duration: 30, channelType: 'general'
        });
    }
    return out;
}

test('cache reuses final days, remembers empty days and refetches estimates', async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => {
        const key = 'amber-compare-export-secure-key';
        const ob = (s) => btoa(s.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join(''));
        localStorage.setItem('amberApiKey', ob('fake'));
    });
    await page.route('**/sites', (r) => r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 'site123', nmi: '1', network: 'Ausgrid', channels: [{ identifier: 'E1', type: 'general' }] }])
    }));
    let requestedDays = [];
    let yesterday = '';
    await page.route('**/usage*', (r) => {
        const u = new URL(r.request().url());
        const s = u.searchParams.get('startDate');
        const e = u.searchParams.get('endDate');
        let data = [];
        for (let d = s; d <= e; d = addDays(d, 1)) {
            requestedDays.push(d);
            data = data.concat(amberDay(d, yesterday));
        }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto('/');
    yesterday = await page.evaluate(() => {
        const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

    async function run(start) {
        requestedDays = [];
        await page.fill('#startDate', start);
        await page.fill('#endDate', yesterday);
        await page.click('#fetchData');
        await page.waitForFunction(() => document.querySelector('#fetchData').textContent.includes('Compare Costs')
            && !document.querySelector('#resultsSection').classList.contains('hidden'), null, { timeout: 60000 });
        return requestedDays.slice().sort();
    }

    const six = addDays(yesterday, -182);
    const seven = addDays(yesterday, -213);
    const recent = [addDays(yesterday, -1), yesterday];

    await run(six);
    let again = await run(seven);
    expect(again.every((d) => d < six || recent.includes(d))).toBe(true);
    again = await run(six);
    expect(again).toEqual(recent);
    again = await run(seven);
    expect(again).toEqual(recent); // empty pre-account days are remembered

    await page.reload();
    again = await run(six);
    expect(again).toEqual(recent);
});
