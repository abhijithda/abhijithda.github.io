const { test, expect } = require('@playwright/test');
const { plainPhotoInsert } = require('../test-utils');
const { VIEWS, openViewWithSettings, defineMediaStateScreenTests } = require('../media-states');

test.describe('Book View - Screenshot Tests (Display Options)', () => {

    test.beforeEach(async ({ page }) => {
        await openViewWithSettings(page, VIEWS.book);
    });

    // Default / QR-only / Both / None: shared with continuous view, see ../media-states.js
    defineMediaStateScreenTests(VIEWS.book);

    // Standalone image pages are a book-view-only layout (no equivalent in
    // continuous view's screenshot suite) — worth its own reference shot
    // since it's governed by different CSS (centered, full-page, no card
    // border) than an inline image block.
    test('Screenshot: standalone image page (i_001)', async ({ page }) => {
        // Isolated fixture, not the shared small one — the shared
        // fixture's only standalone-image-shaped item is the cover
        // (ins_001), which has block.content and so renders as the
        // title-style page, not the plain standalone-image page this
        // screenshot is meant to document.
        await page.route('**/data.json', route => route.fulfill({
            json: [plainPhotoInsert('i_001')],
        }));
        await page.reload();
        await VIEWS.book.open(page);

        const card = page.locator('#book-i_001');
        await expect(card).toHaveClass(/standalone-image/);
        await expect(card.locator('.book-image')).toBeVisible();

        await expect(page).toHaveScreenshot('book-screenshot-standalone-image-page.png', {
            fullPage: true,
            timeout: 20000
        });
    });
});
