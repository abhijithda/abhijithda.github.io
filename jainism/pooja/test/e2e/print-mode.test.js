const { test, expect } = require('@playwright/test');

test.describe('Jaina Pooja WebUI - E2E Integration', () => {

    test('Successfully loads JSON data and toggles Print Mode', async ({ page }) => {
        // 1. Navigate to the local server
        await page.goto('/');

        // 2. Wait for the fetch() call to finish and render the cards
        // Playwright is smart enough to auto-retry until the element appears
        const firstCard = page.locator('.card').first();
        await expect(firstCard).toBeVisible();

        // 3. Verify we start in normal mode
        const body = page.locator('body');
        await expect(body).not.toHaveClass(/print-mode/);

        // 4. Click the Print Mode toggle
        // Based on your script.js, this is triggered by a checkbox with id="print-toggle"
        // Target the visible slider UI directly
        const printToggleSlider = page.locator('.switch .slider');
        await printToggleSlider.click();

        // 5. Verify the CSS class was added to the body
        await expect(body).toHaveClass(/print-mode/);

        // 6. Verify QR codes are physically VISIBLE on screen
        const qrCodeImage = page.locator('.qr-code img').first();
        await expect(
            qrCodeImage,
            'Print View Toggle Failed: The QR code is missing or still hidden.'
        ).toBeVisible();

        // 7. Verify the video elements are physically HIDDEN
        const videoContainer = page.locator('.video-card, iframe, a[href*="youtu"]').first();
        await expect(
            videoContainer,
            'Print View Toggle Failed: Video elements are still showing up on the page.'
        ).toBeHidden();
    });

    test('Print Mode layout matches baseline screenshot', async ({ page }) => {
        // 1. Arrange: Go to page and enable Print Mode
        await page.goto('/');
        await page.locator('.switch .slider').click();

        // Give a tiny moment for any animations or images to fully settle
        await page.waitForTimeout(500);

        // 2. Act & Assert: Take a screenshot and compare it to the baseline
        // Playwright will automatically name the screenshot after your test name
        await expect(page).toHaveScreenshot('print-mode-desktop.png', {
            fullPage: true, // Optional: captures the entire scrollable page
            timeout: 20000
        });
    });
});