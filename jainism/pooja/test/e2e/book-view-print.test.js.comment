const { test, expect } = require('@playwright/test');
const path = require('path');

async function openBookView(page) {
    await page.locator('.view-toggle-btn[data-view="book"]').click();
    await expect(page.locator('#book-container')).toHaveClass(/active/);
    await expect(page.locator('#book-columns .book-card').first()).toBeVisible();
}

test.describe('Book View - Print Mode Validation', () => {

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

    // Per REQUIREMENTS.md: "Print view should print the entire book, not
    // just the current page." Book view achieves this purely via the
    // @media print rules in book-view.css (column-count: 1, transform:
    // none, height: auto — see the print block at the bottom of the file),
    // not via the renderPrintBook()/#book-print-container pipeline
    // described in AI.md, which is currently an empty stub. This test
    // asserts the actual (CSS-driven) mechanism: every card in the book,
    // not just the on-screen spread, is present and visible under print.
    test('Print Mode - entire book renders as one flowing column, not just the current spread', async ({ page }) => {
        const allCardIds = await page.locator('#book-columns .book-card').evaluateAll(
            cards => cards.map(c => c.id)
        );
        expect(allCardIds.length).toBeGreaterThan(1);

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(500);

        // Every card that exists in the book — not only the first
        // spread's worth — must be visible once print CSS applies.
        for (const id of allCardIds) {
            await expect(page.locator(`#${id}`)).toBeVisible();
        }

        // The interactive spread nav must not appear on paper.
        await expect(page.locator('.book-nav')).toBeHidden();
    });

    test('Print Mode - Default State (Videos ON, QR OFF)', async ({ page }) => {
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(500);
        await expect(page).toHaveScreenshot('book-print-default-state.png', { fullPage: true, timeout: 15000 });
    });

    test('Print Mode - Both State (Videos ON, QR ON)', async ({ page }) => {
        await page.locator('#toggle-qrs').check();

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(500);
        await expect(page).toHaveScreenshot('book-print-both-state.png', { fullPage: true, timeout: 15000 });
    });

    test('Print Mode - QR-only State (Videos OFF, QR ON)', async ({ page }) => {
        await page.locator('#toggle-qrs').check();
        await page.locator('#toggle-videos').uncheck();

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(500);
        await expect(page).toHaveScreenshot('book-print-qr-only-state.png', {
            fullPage: true, timeout: 15000,
            maxDiffPixelRatio: 0.02
        });
    });

    test('Print Mode - None State (Videos OFF, QR OFF)', async ({ page }) => {
        await page.locator('#toggle-videos').uncheck();

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(500);
        await expect(page).toHaveScreenshot('book-print-none-state.png', { fullPage: true, timeout: 15000 });
    });

    // Read progress should carry from screen to printout, per REQUIREMENTS.md.
    test('Print Mode - read ticks stay visible on paper', async ({ page }) => {
        await page.locator('#toggle-read-tracking').check();
        await page.locator('#book-q_001_b_1 .read-tick').click();

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(500);

        await expect(page.locator('#book-q_001_b_1 .read-tick')).toHaveClass(/read/);
        await expect(page).toHaveScreenshot('book-print-read-tracking-state.png', { fullPage: true, timeout: 15000 });
    });
});
