const { test, expect } = require('@playwright/test');
const path = require('path');

// Covers the Focus/zen mode toggle: hides the header (and, best-effort,
// requests real browser Fullscreen — not asserted here, since headless
// Playwright's fullscreen support is unreliable across browsers/CI; the
// header-hiding behavior is the part guaranteed to work everywhere and is
// what these tests check).

test.describe('Focus / zen mode', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({ path: path.join(__dirname, '..', '..', 'data.json') });
        });
        await page.goto('/');
        await expect(page.locator('#book-columns .book-card').first()).toBeVisible();
    });

    test('hides the header and shows the exit button; the exit button restores it', async ({ page }) => {
        await expect(page.locator('.app-header')).toBeVisible();
        await expect(page.locator('#zen-exit-btn')).toBeHidden();

        await page.locator('#zen-mode-btn').click();
        await expect(page.locator('.app-header')).toBeHidden();
        await expect(page.locator('#zen-exit-btn')).toBeVisible();

        await page.locator('#zen-exit-btn').click();
        await expect(page.locator('.app-header')).toBeVisible();
        await expect(page.locator('#zen-exit-btn')).toBeHidden();
    });

    test('Escape exits zen mode', async ({ page }) => {
        await page.locator('#zen-mode-btn').click();
        await expect(page.locator('.app-header')).toBeHidden();

        await page.keyboard.press('Escape');
        await expect(page.locator('.app-header')).toBeVisible();
    });

    test('the peek button shows/hides the header without leaving zen mode', async ({ page }) => {
        await page.locator('#zen-mode-btn').click();
        await expect(page.locator('.app-header')).toBeHidden();

        await page.locator('#zen-peek-btn').click();
        await expect(page.locator('.app-header')).toBeVisible();
        // Still in zen mode — the exit button is deliberately tucked away
        // while peeked open (it would overlap the revealed header), but
        // Escape still works regardless of that button's visibility.
        await expect(page.locator('#zen-exit-btn')).toBeHidden();

        await page.locator('#zen-peek-btn').click();
        await expect(page.locator('.app-header')).toBeHidden();
        await expect(page.locator('#zen-exit-btn')).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(page.locator('.app-header')).toBeVisible();
    });

    test('reclaims the header\'s space in book view rather than leaving a gap', async ({ page }) => {
        const before = await page.locator('#book-container').evaluate(el => getComputedStyle(el).minHeight);
        await page.locator('#zen-mode-btn').click();
        const after = await page.locator('#book-container').evaluate(el => getComputedStyle(el).minHeight);
        expect(parseFloat(after)).toBeGreaterThan(parseFloat(before));
    });

    test('works the same from continuous view', async ({ page }) => {
        await page.locator('.view-toggle-btn[data-view="continuous"]').click();
        await expect(page.locator('.card').first()).toBeVisible();

        await page.locator('#zen-mode-btn').click();
        await expect(page.locator('.app-header')).toBeHidden();
        await expect(page.locator('.card').first()).toBeVisible(); // content still readable
    });
});
