const { test, expect } = require('@playwright/test');

test.describe('Jaina Pooja WebUI - Print Mode Validation', () => {

    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({ path: 'test.data.json' });
        });

        await page.goto('/');
        await expect(page.locator('.card').first()).toBeVisible();

        await page.locator('#settings-btn').click();
        await expect(page.locator('#toggle-videos')).toBeVisible();
    });

    test('Print Mode - Default State (Videos ON, QR OFF)', async ({ page }) => {
        // Default state: Videos are checked, QRs are unchecked
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(500); // Allow fonts/layout to settle
        await expect(page).toHaveScreenshot('print-default-state.png', { fullPage: true, timeout: 15000 });
    });

    test('Print Mode - Both State (Videos ON, QR ON)', async ({ page }) => {
        // Turn on QRs
        await page.locator('#toggle-qrs').check();

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(500);
        await expect(page).toHaveScreenshot('print-both-state.png', { fullPage: true, timeout: 15000 });
    });

    test('Print Mode - QR-only State (Videos OFF, QR ON)', async ({ page }) => {
        // Turn on QRs, turn off Videos
        await page.locator('#toggle-qrs').check();
        await page.locator('#toggle-videos').uncheck();

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(500);
        await expect(page).toHaveScreenshot('print-qr-only-state.png', {
            fullPage: true, timeout: 15000,
            maxDiffPixelRatio: 0.02 // Allows up to a 2% variance 
        });
    });

    test('Print Mode - None State (Videos OFF, QR OFF)', async ({ page }) => {
        // Turn off Videos (QRs are off by default)
        await page.locator('#toggle-videos').uncheck();

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(500);
        await expect(page).toHaveScreenshot('print-none-state.png', { fullPage: true, timeout: 15000 });
    });
});