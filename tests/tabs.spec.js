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
