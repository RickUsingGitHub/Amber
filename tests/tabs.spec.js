const { test, expect } = require('@playwright/test');

test('opens on Setup when there is no API key', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#tab-setup')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#apiKey')).toBeVisible();
    await expect(page.locator('#fetchData')).toBeVisible();

    // Compare without a key stays on Setup and says why.
    await page.click('#tab-compare');
    await page.click('#fetchData');
    await expect(page.locator('#tab-setup')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#apiKey')).toBeFocused();
    await expect(page.locator('#message')).toContainText('API key');
});
