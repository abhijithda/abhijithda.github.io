const { test, expect } = require('@playwright/test');
const path = require('path');

// Re-enabled from continuous-view-print.test.js.comment — see the header
// comment in book-view-print.test.js for why the original full-page
// toHaveScreenshot() calls were replaced with direct visibility checks
// (no baseline PNGs exist for these names, and a full-page print
// screenshot is too blunt an instrument for "is the QR code visible"
// specifically).

test.describe('Continuous View - Print Mode', () => {

    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({
                path: path.join(__dirname, '..', 'data.json')
            });
        });

        await page.goto('/');
        // Book view is the default on a fresh load — switch to continuous
        // view explicitly before waiting on .card, since these tests are
        // continuous-view-specific.
        await page.locator('.view-toggle-btn[data-view="continuous"]').click();
        await expect(page.locator('.card').first()).toBeVisible();

        await page.locator('#settings-btn').click();
        await expect(page.locator('#toggle-videos')).toBeVisible();
    });

    test('Default state (Videos ON, QR OFF): the video thumbnail prints, the QR does not', async ({ page }) => {
        const mediaWrap = page.locator('.media-wrap').first();
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        await expect(mediaWrap.locator('.video-card')).toBeVisible();
        await expect(mediaWrap.locator('.qr-code')).toBeHidden();
    });

    test('Both state (Videos ON, QR ON): both the thumbnail and the QR print', async ({ page }) => {
        await page.locator('#toggle-qrs').check();

        const mediaWrap = page.locator('.media-wrap').first();
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        await expect(mediaWrap.locator('.video-card')).toBeVisible();
        await expect(mediaWrap.locator('.qr-code')).toBeVisible();
    });

    test('QR-only state (Videos OFF, QR ON): the QR prints, the video thumbnail does not', async ({ page }) => {
        await page.locator('#toggle-qrs').check();
        await page.locator('#toggle-videos').uncheck();

        const mediaWrap = page.locator('.media-wrap').first();
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        await expect(mediaWrap.locator('.video-card')).toBeHidden();
        await expect(mediaWrap.locator('.qr-code')).toBeVisible();
    });

    test('None state (Videos OFF, QR OFF): neither prints', async ({ page }) => {
        await page.locator('#toggle-videos').uncheck();

        const mediaWrap = page.locator('.media-wrap').first();
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        await expect(mediaWrap.locator('.video-card')).toBeHidden();
        await expect(mediaWrap.locator('.qr-code')).toBeHidden();
    });
});
