const { test, expect } = require('@playwright/test');

test.describe('Jaina Pooja WebUI - E2E Integration', () => {

    test('Successfully loads JSON data and toggles Print Mode', async ({ page }) => {
        // 1. Navigate to the local server
        await page.goto('/');

        // 2. Wait for the fetch() call to finish and render the bubbles
        // Playwright is smart enough to auto-retry until the element appears
        const firstBubble = page.locator('.bubble').first();
        await expect(firstBubble).toBeVisible();

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

        // 6. Verify QR codes are attached to the DOM for videos
        // (This assumes your data.json has at least one video block!)
        const qrCodeImage = page.locator('.print-only-qr img').first();
        await expect(qrCodeImage).toBeAttached();
    });

});