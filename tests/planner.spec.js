const { test, expect } = require('@playwright/test');

const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().substring(0, 10);

// A year of 30-minute NEM12 readings for a household with no solar: a morning and a big evening.
function nem12Year(nmi, from, to) {
    const general = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
        const ymd = d.replace(/-/g, '');
        const month = parseInt(d.substring(5, 7), 10);
        const winter = month >= 6 && month <= 8 ? 1.4 : 1;
        const g = Array.from({ length: 48 }, (_, i) => {
            const base = i >= 34 && i < 44 ? 1.3 : i >= 13 && i < 17 ? 0.7 : 0.25;
            return (base * winter).toFixed(3);
        });
        general.push(`300,${ymd},${g.join(',')},A,,,${ymd}235959,`);
    }
    return ['100,NEM12,202611010000,MDP,RETAILER',
        `200,${nmi},E1,E1,E1,N1,M1,kWh,30,`, ...general,
        '900'].join('\n');
}

// The same kind of home with panels and a battery: it charges in the morning, spills solar after
// midday, covers the evening until about 10pm, and sells after dark one day a week.
function nem12Battery(nmi, from, to) {
    const general = [];
    const exports = [];
    let day = 0;
    for (let d = from; d <= to; d = addDays(d, 1), day++) {
        const ymd = d.replace(/-/g, '');
        const g = Array.from({ length: 48 }, (_, i) => (i < 14 || i >= 44 ? 0.3 : i < 18 ? 0.6 : 0).toFixed(3));
        const b = Array.from({ length: 48 }, (_, i) => (i >= 18 && i < 24 ? 0.2 : i >= 24 && i < 30 ? 1.5 : i === 41 && day % 7 === 0 ? 1.5 : 0).toFixed(3));
        general.push(`300,${ymd},${g.join(',')},A,,,${ymd}235959,`);
        exports.push(`300,${ymd},${b.join(',')},A,,,${ymd}235959,`);
    }
    return ['100,NEM12,202611010000,MDP,RETAILER',
        `200,${nmi},E1B1,E1,E1,N1,M1,kWh,30,`, ...general,
        `200,${nmi},E1B1,B1,B1,N2,M1,kWh,30,`, ...exports,
        '900'].join('\n');
}

// Under "Companies and plans to consider": untick everything, then tick the plans whose label passes keep.
async function onlyPlans(page, keep) {
    await page.click('#planRetailers summary');
    await page.click('#planRetailersPanel [data-plan-all="0"]');
    const boxes = page.locator('#planRetailersPanel input[data-plan]');
    const n = await boxes.count();
    for (let i = 0; i < n; i++) {
        const text = (await boxes.nth(i).locator('xpath=..').textContent()).trim();
        if (keep(text)) await boxes.nth(i).check();
    }
    await page.keyboard.press('Escape');
}

async function tickAll(page) {
    await page.click('#planRetailers summary');
    await page.click('#planRetailersPanel [data-plan-all="1"]');
    await page.keyboard.press('Escape');
}

async function importYear(page, file) {
    await page.route('**/api.amber.com.au/**', (route) => route.abort());
    await page.goto('/');
    await page.setInputFiles('#nem12File', { name: 'meter.csv', mimeType: 'text/csv', buffer: Buffer.from(file || nem12Year('4102123456', '2025-11-01', '2026-10-31')) });
    await expect(page.locator('#nem12Summary')).toContainText('NMI 4102123456: 365 days');
    await page.click('#nem12Build');
    await page.waitForSelector('#resultsSection:not(.hidden)', { timeout: 30000 });
}

test('Solar & battery: a NEM12 household gets a best setup, its year month by month and its payback', async ({ page }) => {
    test.setTimeout(150000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await importYear(page);

    await page.click('#tab-plan');
    await expect(page.locator('#tab-plan')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#planDataStatus')).toContainText('Using 12 months of readings for NMI 4102123456');
    await expect(page.locator('#planDataStatus')).toContainText('1 Nov 2025');
    await expect(page.locator('#configSection')).toBeHidden();
    await expect(page.locator('#planInputs')).toBeVisible();
    // Not on Amber: today's plan is a retailer's, and the town follows the network.
    await expect(page.locator('#planCompareWith')).toHaveValue('');
    await expect(page.locator('#planCompareWith option:checked')).toHaveText("Whatever's cheapest");
    await expect(page.locator('#planLocation')).toHaveValue('sydney');
    await expect(page.locator('#planCostInputs input')).toHaveCount(18);

    // Every field on the tab has help nearby.
    const missing = await page.evaluate(() => Array.from(document.querySelectorAll('#planInputs [data-help]'))
        .filter((el) => el.offsetParent && !(el.parentElement.querySelector('.help-btn') || el.querySelector('.help-btn')))
        .map((el) => el.getAttribute('data-help')));
    expect(missing).toEqual([]);
    const unknown = await page.evaluate(() => Array.from(document.querySelectorAll('#panel-plan [data-help]'))
        .map((el) => el.getAttribute('data-help')).filter((k) => !window.Amber.HELP[k]));
    expect(unknown).toEqual([]);

    const started = Date.now();
    await page.click('#planRun');
    await expect(page.locator('#planResults')).toBeVisible({ timeout: 120000 });
    console.log(`planner search took ${((Date.now() - started) / 1000).toFixed(1)} s`);
    await expect(page.locator('#planProgressText')).toContainText('options compared');
    await expect(page.locator('#planRecommendation')).toContainText('Best for you');
    await expect(page.locator('#planRecommendation')).toContainText("Next year's bill");
    await expect(page.locator('#planRecommendation')).toContainText('What to ask installers for:');
    // How keen to be: a level, a word and the reasons.
    const keen = page.locator('#planRecommendation [data-keen]');
    await expect(keen).toHaveCount(1);
    await expect(keen).toContainText(/How keen to be/);
    await expect(keen).toContainText(/(Strong|Good|Modest|Marginal|Not worth it)/);
    await expect(keen).toContainText(/every \$1 up front comes back as about \$\d+\.\d\d in today's money/);
    await expect(page.locator('#planPaybackNotes [data-keen]')).toHaveCount(1);
    await expect(page.locator('#planRecommendation')).toContainText(/usable that can charge and discharge at about \d+(\.\d)? kW/);
    await expect(page.locator('#planOptionsTable')).toContainText('cheapest with nothing new');
    // The money columns say what they count.
    for (const heading of ['Saves a year', 'Pays back', "Worth in today's money (20 yrs)"]) {
        await expect(page.locator('#planOptionsTable thead th', { hasText: heading }).locator('.help-btn')).toHaveCount(1);
    }

    // The month table: 12 months and the year.
    const monthRows = page.locator('#planDetailBody table').first().locator('tbody tr');
    await expect(monthRows).toHaveCount(13);
    await expect(monthRows.last()).toContainText('Year');
    await expect(page.locator('#planPaybackNotes')).toContainText('Paid');

    // Tapping another option shows its year instead.
    const second = page.locator('#planOptionsTable [data-plan-option="1"]');
    const secondPlan = (await second.locator('td').nth(1).textContent()).trim();
    await second.click();
    await expect(page.locator('#planOptionsTable [data-plan-option="1"]')).toHaveClass(/bg-indigo-50/);
    await expect(page.locator('#planDetailTitle')).toContainText(secondPlan);
    await page.click('#planOptionsTable [data-plan-option="-1"]');
    await expect(page.locator('#planDetailTitle')).toContainText('no new panels and no battery');
    await expect(page.locator('#planPaybackNotes')).toContainText('Nothing to buy');

    // Ranking by payback puts hardware first.
    await page.selectOption('#planRankBy', 'payback');
    await expect(page.locator('#planOptionsTable [data-plan-option="0"] td').nth(0)).not.toHaveText('Nothing new');

    // Leaving the tab brings the dates bar back.
    await page.click('#tab-compare');
    await expect(page.locator('#configSection')).toBeVisible();
    expect(errors).toEqual([]);
});

test('Solar & battery: fixing the panels, the battery and the plan', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await importYear(page);
    await page.click('#tab-plan');
    await expect(page.locator('#planInputs')).toBeVisible();

    await page.selectOption('#planSolarMode', 'fixed');
    await expect(page.locator('#planSolarKw')).toBeVisible();
    await expect(page.locator('#planRoofKw')).toBeHidden();
    await page.fill('#planSolarKw', '6.6');
    await page.selectOption('#planBatteryMode', 'none');
    await expect(page.locator('#planBatteryKwh')).toBeHidden();
    await expect(page.locator('#planBatteryMax')).toBeHidden();
    const plan = (await page.locator('#planRetailersPanel input[data-plan]').nth(2).locator('xpath=..').textContent()).trim();
    await onlyPlans(page, (t) => t === plan);
    await expect(page.locator('#planRetailersSummary')).toHaveText(`Only ${plan}`);
    await expect(page.locator('#planRetailersPanel')).toBeHidden();
    await page.click('#planRun');
    await expect(page.locator('#planResults')).toBeVisible({ timeout: 90000 });

    const rows = page.locator('#planOptionsTable [data-plan-option]:not([data-plan-option^="-"])');
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator('td').nth(0)).toHaveText('6.6 kW solar');
    await expect(rows.first().locator('td').nth(1)).toHaveText(plan);
    await expect(page.locator('#planRecommendation')).toContainText('6.6 kW of solar and no battery');
    // What to order: the panels and the inverter size the planner assumed.
    await expect(page.locator('#planRecommendation')).toContainText('What to ask installers for: 6.6 kW of panels with an inverter of about 5 kW.');
    await expect(page.locator('#planDetailBody')).toContainText('What to ask installers for: 6.6 kW of panels with an inverter of about 5 kW');
    await expect(page.locator('#planDetailBody table').first().locator('thead')).toContainText('Solar made');
    // Where the saving comes from: the bill in parts, and where the new panels' power goes.
    await expect(page.locator('#planDetailBody')).toContainText('Where the saving comes from');
    await expect(page.locator('#planDetailBody table').nth(1)).toContainText('Power bought');
    await expect(page.locator('#planDetailBody table').nth(1)).toContainText('Solar and battery sent to the grid');
    await expect(page.locator('#planDetailBody')).toContainText(/The new panels could make [0-9,]+ kWh a year/);

    // The choices are remembered after a reload.
    await page.reload();
    await page.click('#tab-plan');
    await expect(page.locator('#planInputs')).toBeVisible();
    await expect(page.locator('#planSolarMode')).toHaveValue('fixed');
    await expect(page.locator('#planBatteryMode')).toHaveValue('none');
    await expect(page.locator('#planRetailersSummary')).toHaveText(`Only ${plan}`);
    expect(errors).toEqual([]);
});

test('Solar & battery: a chosen plan to compare against keeps the yardstick; "whatever\'s cheapest" follows the plans ticked', async ({ page }) => {
    test.setTimeout(150000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await importYear(page);
    await page.click('#tab-plan');
    await expect(page.locator('#planInputs')).toBeVisible();
    await page.fill('#planRoofKw', '6.6');
    await page.fill('#planBatteryMax', '13.5');
    const cells = async (tr) => (await tr.locator('td').allTextContents()).map((t) => t.trim());

    // Against a chosen plan (today's dear one): that plan's row saves $0.
    const dear = await page.locator('#planCompareWith option').nth(2).getAttribute('value');
    await page.selectOption('#planCompareWith', dear);
    await page.click('#planRun');
    await expect(page.locator('#planResults')).toBeVisible({ timeout: 120000 });
    const against = await cells(page.locator('#planOptionsTable [data-plan-option="-1"]'));
    expect(against[0]).toBe('Nothing new');
    expect(against[4]).toBe('$0');
    await expect(page.locator('#planOptionsTable [data-plan-option="-1"]')).toContainText('what you compare against');
    await expect(page.locator('#planDetailBody')).toContainText('Compared with nothing new on');
    const best = await cells(page.locator('#planOptionsTable [data-plan-option="0"]'));

    // Only the best option's plan ticked: with the same plan to compare against, the same numbers.
    const isBest = (t) => t === best[1] || t.startsWith(`${best[1]} (`);
    await onlyPlans(page, isBest);
    await page.click('#planRun');
    await expect(page.locator('#planProgressText')).toContainText('options compared');
    const same = page.locator('#planOptionsTable [data-plan-option]:not([data-plan-option^="-"])').filter({ has: page.locator('td:first-child', { hasText: new RegExp(`^${best[0].replace(/[.+]/g, '\\$&')}$`) }) });
    expect(await cells(same.first())).toEqual(best);

    // "Whatever's cheapest" only looks at the plans ticked: here, that one plan.
    await page.selectOption('#planCompareWith', '');
    await page.click('#planRun');
    await expect(page.locator('#planProgressText')).toContainText('options compared');
    const cheapest = await cells(page.locator('#planOptionsTable [data-plan-option="-1"]'));
    expect(isBest(cheapest[1].replace(/\s*\(cheapest with nothing new\)$/, ''))).toBe(true);
    await expect(page.locator('#planRecommendation')).toContainText("the cheapest plan you'd use");
    expect(errors).toEqual([]);
});

test('Solar & battery: companies and plans left out are not searched or used for "whatever\'s cheapest"', async ({ page }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await importYear(page);
    await page.click('#tab-plan');
    await expect(page.locator('#planInputs')).toBeVisible();
    await expect(page.locator('#planRetailersSummary')).toHaveText('All companies');
    await page.selectOption('#planSolarMode', 'none');
    await page.selectOption('#planBatteryMode', 'none');
    const planOf = async (i) => (await page.locator(`#planOptionsTable [data-plan-option="${i}"] td`).nth(1).textContent()).replace(/\s*\(.*?(nothing new|compare against)\)\s*$/, '').trim();
    await page.click('#planRun');
    await expect(page.locator('#planResults')).toBeVisible({ timeout: 60000 });
    const cheapest = await planOf(-1);

    // Leave out that one plan: "whatever's cheapest" moves to the next one.
    await page.click('#planRetailers summary');
    await page.locator('#planRetailersPanel label', { hasText: cheapest }).first().locator('input').uncheck();
    await page.keyboard.press('Escape');
    await page.click('#planRun');
    await expect(page.locator('#planProgressText')).toContainText('options compared');
    const next = await planOf(-1);
    expect(next).not.toBe(cheapest);
    const shown = await page.locator('#planOptionsTable [data-plan-option]:not([data-plan-option^="-"]) td:nth-child(2)').allTextContents();
    expect(shown.map((t) => t.trim())).not.toContain(cheapest);

    // Leave out a whole company: none of its plans appear.
    await page.click('#planRetailers summary');
    await page.locator('#planRetailersPanel input[data-company="OVO"]').uncheck();
    await expect(page.locator('#planRetailersPanel input[data-plan^="OVO"]:checked')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#planRetailersSummary')).toContainText('companies');
    await page.click('#planRun');
    await expect(page.locator('#planProgressText')).toContainText('options compared');
    const after = await page.locator('#planOptionsTable [data-plan-option]:not([data-plan-option^="-"]) td:nth-child(2)').allTextContents();
    expect(after.some((t) => t.trim().startsWith('OVO'))).toBe(false);

    // Nothing ticked: it says so instead of running.
    await onlyPlans(page, () => false);
    await expect(page.locator('#planRetailersSummary')).toHaveText('None ticked');
    await page.click('#planRun');
    await expect(page.locator('#planProgressText')).toContainText('Tick at least one company');
    expect(errors).toEqual([]);
});

test('Solar & battery: a home that already has panels and a battery', async ({ page }) => {
    test.setTimeout(150000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await importYear(page, nem12Battery('4102123456', '2025-11-01', '2026-10-31'));
    await page.click('#tab-plan');
    await expect(page.locator('#planInputs')).toBeVisible();
    // Spotted from the readings and filled in as a guess.
    await expect(page.locator('#planExistingHint')).toContainText('after dark on 53 days');
    await expect(page.locator('#planExistingBatteryKwh')).toHaveValue('10');
    expect(parseFloat(await page.locator('#planExistingSolarKw').inputValue())).toBeGreaterThan(2);
    await expect(page.locator('label[for="planRoofKw"], [data-plan-show="solar-best"]').first()).toContainText('Room left on the roof');

    const started = Date.now();
    await page.click('#planRun');
    await expect(page.locator('#planResults')).toBeVisible({ timeout: 120000 });
    console.log(`planner search with a battery already took ${((Date.now() - started) / 1000).toFixed(1)} s`);
    const check = page.locator('#planExistingCheck');
    await expect(check).toBeVisible();
    await expect(check).toContainText('Your readings');
    await expect(check).toContainText("Planner's battery");
    await expect(check).toContainText('it saves you about');
    await expect(page.locator('#planAssumptions')).toContainText('taken out of your readings');
    // Every option runs the battery the home has, so "nothing new" isn't "no battery".
    await page.click('#planOptionsTable [data-plan-option="-1"]');
    await expect(page.locator('#planDetailTitle')).toContainText('no extra battery');
    await expect(page.locator('#planDetailBody')).toContainText('Your 10 kWh battery cycles');

    // Without one, the check goes away.
    await page.fill('#planExistingBatteryKwh', '0');
    await page.click('#planRun');
    await expect(page.locator('#planProgressText')).toContainText('options compared');
    await expect(check).toBeHidden();
    expect(errors).toEqual([]);
});

test('Solar & battery: without a year of readings it says what to do', async ({ page }) => {
    await page.route('**/api.amber.com.au/**', (route) => route.abort());
    await page.goto('/');
    await page.click('#tab-plan');
    await expect(page.locator('#planDataStatus')).toContainText('No meter readings yet');
    await expect(page.locator('#planInputs')).toBeHidden();
    await page.click('#planDataStatus [data-plan-go="setup"]');
    await expect(page.locator('#tab-setup')).toHaveAttribute('aria-selected', 'true');
});
