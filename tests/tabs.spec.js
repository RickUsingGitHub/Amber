const { test, expect } = require('@playwright/test');

test('first visit: a welcome with two paths, and the dates bar only once connected', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#tab-setup')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#tab-setup')).toHaveText('Start');
    await expect(page.locator('#welcomeCard')).toBeVisible();
    await expect(page.locator('#connectedCard')).toBeHidden();
    await expect(page.locator('#fetchData')).toBeHidden();
    await expect(page.locator('#resultTools')).toBeHidden();

    // Other tabs point back to Start.
    await page.click('#tab-compare');
    await expect(page.locator('#panel-compare [data-results-placeholder]')).toContainText('Start');
    await page.click('#panel-compare [data-go-start]');
    await expect(page.locator('#tab-setup')).toHaveAttribute('aria-selected', 'true');

    // "I'm with Amber" goes to the API key.
    await page.click('#chooseAmber');
    await expect(page.locator('#apiKey')).toBeFocused();
    await page.fill('#apiKey', 'psk_test_key_123');
    await expect(page.locator('#fetchData')).toBeVisible();
    await expect(page.locator('#welcomeCard')).toBeHidden();
    await expect(page.locator('#connectedCard')).toBeVisible();

    // Clearing the key goes back to the welcome.
    await page.fill('#apiKey', '');
    await expect(page.locator('#welcomeCard')).toBeVisible();
    await expect(page.locator('#fetchData')).toBeHidden();
});

test('help bubbles: hover, tap to pin, Escape to close, and in generated tables too', async ({ page }) => {
    await page.goto('/');
    const help = page.locator('#setupSection .help-btn').first();
    await expect(help).toHaveAttribute('aria-label', /Amber API key/);
    await help.hover();
    await expect(page.locator('#helpBubble')).toBeVisible();
    await expect(page.locator('#helpBubble')).toContainText('Generate new token');
    await page.mouse.move(0, 0);
    await expect(page.locator('#helpBubble')).toBeHidden();

    await help.click();
    await expect(page.locator('#helpBubble')).toBeVisible();
    await expect(help).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('#helpBubble')).toBeHidden();
    await expect(help).toBeFocused();

    // A label keeps its own text (the button sits beside it, not inside).
    await expect(page.locator('label[for="apiKey"]')).toHaveText('Amber API key (token)');

    // The jargon buster lists the terms.
    await page.click('#glossarySection summary');
    await expect(page.locator('#glossaryList')).toContainText('Demand charge');
    await expect(page.locator('#glossaryList')).toContainText('busiest half hour');

    // Every visible form field on the Compare tab has help nearby.
    await page.fill('#apiKey', 'psk_test_key_123');
    await page.click('#tab-compare');
    await page.click('#ratesDetailsToggle');
    const missing = await page.evaluate(() => Array.from(document.querySelectorAll('#planChooser label[for]'))
        .filter((l) => l.offsetParent && !l.parentElement.querySelector('.help-btn') && !l.closest('[data-tou-period]') && !/^(demandWindowEnd)$/.test(l.getAttribute('for')))
        .map((l) => l.getAttribute('for')));
    expect(missing).toEqual([]);
});

test('a disclaimer is on every page, with the full text a tap away', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#disclaimerShort')).toBeVisible();
    await expect(page.locator('#disclaimerShort')).toContainText("isn't financial advice");
    await expect(page.locator('#disclaimer > div')).toBeHidden();
    await page.click('#disclaimer summary');
    await expect(page.locator('#disclaimer')).toContainText('written with the help of AI');
    await expect(page.locator('#disclaimer')).toContainText('at your own risk');
    // The planner says so too, before anyone sizes a system.
    await page.click('#tab-plan');
    await expect(page.locator('#planDisclaimer')).toBeVisible();
    await expect(page.locator('#disclaimerShort')).toBeVisible();
});

test('Free? has its own tab, pointing back to Start before there are results', async ({ page }) => {
    await page.goto('/');
    const names = await page.locator('#mainTabs [role="tab"]').evaluateAll((tabs) => tabs.map((t) => t.id));
    expect(names).toEqual(['tab-setup', 'tab-compare', 'tab-check', 'tab-bill', 'tab-free', 'tab-plan']);
    await page.click('#tab-free');
    await expect(page.locator('#panel-free [data-results-placeholder]')).toContainText('Start');
    await expect(page.locator('#batteryShiftSection')).toBeHidden();
    await expect(page.locator('#panel-compare #batteryShiftSection')).toHaveCount(0);
});

test('on a phone the six tabs fit without scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/');
    expect(await page.locator('#mainTabs [role="tab"]').evaluateAll((tabs) => tabs.map((t) => t.innerText))).toEqual(['Start', 'Compare', 'Usage', 'Bill?', 'Free?', 'Solar+?']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    const rows = await page.locator('#mainTabs [role="tab"]').evaluateAll((tabs) => new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().top))).size);
    expect(rows).toBe(1);
});

test('short tab names, the same on a computer, with the full name on hover', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('#mainTabs [role="tab"]').evaluateAll((tabs) => tabs.map((t) => t.innerText))).toEqual(['Start', 'Compare', 'Usage', 'Bill?', 'Free?', 'Solar+?']);
    await expect(page.locator('#tab-plan')).toHaveAttribute('title', /Solar and battery/);
    await expect(page.locator('#tab-bill')).toHaveAttribute('title', /Bill check/);
    await expect(page.locator('#tab-free')).toHaveAttribute('title', /Free power/);
});
