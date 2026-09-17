const { test, expect } = require('@playwright/test');
const path = require('path');

async function openBookView(page) {
    await page.locator('.view-toggle-btn[data-view="book"]').click();
    await expect(page.locator('#book-container')).toHaveClass(/active/);
    await expect(page.locator('#book-columns .book-card').first()).toBeVisible();
}

test.describe('Book View - Screenshot Tests (Display Options)', () => {

    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({
                path: path.join(__dirname, '..', 'data.json')
            });
        });

        await page.goto('/');
        // Book view is the default on a fresh load — wait for its content
        // (rather than continuous view's, which is rendered but hidden)
        // as the "data has loaded" signal.
        await expect(page.locator('#book-columns .book-card').first()).toBeVisible();

        await openBookView(page);

        await page.locator('#settings-btn').click();
        await expect(page.locator('#toggle-videos')).toBeVisible();
    });

    test('Screenshot: Default state (Videos ON, QR OFF)', async ({ page }) => {
        const videosCheckbox = page.locator('#toggle-videos');
        const qrsCheckbox = page.locator('#toggle-qrs');

        await page.waitForSelector('#book-columns .book-vid-row');

        await expect(videosCheckbox).toBeChecked();
        await expect(qrsCheckbox).not.toBeChecked();

        const rowWithMedia = page.locator('#book-columns .book-vid-row').first();
        await expect(rowWithMedia.locator('.book-vid-thumb')).toBeVisible();
        await expect(rowWithMedia.locator('.book-vid-qr')).toBeHidden();

        await expect(page).toHaveScreenshot('book-screenshot-default-state-videos-on-qr-off.png', {
            fullPage: true,
            timeout: 20000
        });
    });

    test('Screenshot: QR-only state (Videos OFF, QR ON)', async ({ page }) => {
        const videosCheckbox = page.locator('#toggle-videos');
        const qrsCheckbox = page.locator('#toggle-qrs');

        await page.waitForSelector('#book-columns .book-vid-row');

        await videosCheckbox.uncheck();
        await qrsCheckbox.check();
        await page.waitForTimeout(300);

        const rowWithMedia = page.locator('#book-columns .book-vid-row').first();
        await expect(rowWithMedia.locator('.book-vid-thumb')).toBeHidden();
        await expect(rowWithMedia.locator('.book-vid-qr')).toBeVisible();

        await expect(page).toHaveScreenshot('book-screenshot-qr-only-state-videos-off-qr-on.png', {
            fullPage: true,
            timeout: 20000
        });
    });

    test('Screenshot: Both state (Videos ON, QR ON)', async ({ page }) => {
        const videosCheckbox = page.locator('#toggle-videos');
        const qrsCheckbox = page.locator('#toggle-qrs');

        await page.waitForSelector('#book-columns .book-vid-row');

        await videosCheckbox.check();
        await qrsCheckbox.check();
        await page.waitForTimeout(300);

        const rowWithMedia = page.locator('#book-columns .book-vid-row').first();
        await expect(rowWithMedia.locator('.book-vid-thumb')).toBeVisible();
        await expect(rowWithMedia.locator('.book-vid-qr')).toBeVisible();

        await expect(page).toHaveScreenshot('book-screenshot-both-state-videos-on-qr-on.png', {
            fullPage: true,
            timeout: 20000
        });
    });

    test('Screenshot: None state (Videos OFF, QR OFF)', async ({ page }) => {
        const videosCheckbox = page.locator('#toggle-videos');
        const qrsCheckbox = page.locator('#toggle-qrs');

        await page.waitForSelector('#book-columns .book-vid-row');

        await videosCheckbox.uncheck();
        await qrsCheckbox.uncheck();
        await page.waitForTimeout(300);

        const rowWithMedia = page.locator('#book-columns .book-vid-row').first();
        // With both toggles off, the whole row (not just thumb/qr) is hidden — see applyBookMediaVisibility.
        await expect(rowWithMedia).toBeHidden();

        await expect(page).toHaveScreenshot('book-screenshot-none-state-videos-off-qr-off.png', {
            fullPage: true,
            timeout: 20000
        });
    });

    // Standalone image pages are a book-view-only layout (no equivalent in
    // continuous view's screenshot suite) — worth its own reference shot
    // since it's governed by different CSS (centered, full-page, no card
    // border) than an inline image block.
    test('Screenshot: standalone image page (i_001)', async ({ page }) => {
        const card = page.locator('#book-i_001');
        await expect(card).toHaveClass(/standalone-image/);
        await expect(card.locator('.book-image')).toBeVisible();

        await expect(page).toHaveScreenshot('book-screenshot-standalone-image-page.png', {
            fullPage: true,
            timeout: 20000
        });
    });
});
