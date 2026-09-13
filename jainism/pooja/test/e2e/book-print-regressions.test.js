const { test, expect } = require('@playwright/test');
const path = require('path');

// Regression coverage for two print-specific side effects of earlier,
// screen-focused changes:
//  1. overflow-x: auto (added to #book-container for the on-screen A4/A3
//     horizontal-scroll fix) clips a printed page to whatever was
//     scrolled into view on screen, since browsers don't "unroll" a
//     scrollable region for print.
//  2. Moving mantra/note/shloka's colour from border-left-color to
//     box-shadow (see core/card-types.css) put it under "background
//     graphics", which several browsers suppress in print by default.

test.describe('Book print — regressions', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({ path: path.join(__dirname, '..', 'data.json') });
        });
        await page.goto('/');
        await expect(page.locator('#book-columns .book-card').first()).toBeVisible();
    });

    test('#book-container is not a clipped scroll region under print, even in A3', async ({ page }) => {
        await page.locator('#settings-btn').click();
        await page.locator('#paper-size-select').selectOption('a3');
        await page.waitForTimeout(200);

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        const overflow = await page.locator('#book-container').evaluate(el => getComputedStyle(el).overflow);
        expect(overflow).toBe('visible');
    });

    test('print forces color-adjust, so mantra/note/shloka colors cannot silently disappear', async ({ page }) => {
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        const adjust = await page.evaluate(() => {
            const cs = getComputedStyle(document.body);
            return cs.printColorAdjust || cs.webkitPrintColorAdjust;
        });
        expect(adjust).toBe('exact');
    });
});
