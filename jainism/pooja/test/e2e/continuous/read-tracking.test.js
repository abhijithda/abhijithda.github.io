const { test, expect } = require('@playwright/test');
const path = require('path');

// Continuous-view-specific read-tracking rendering: the progress counter,
// per-block independence within a multi-block answer, and continuous
// view's own print rendering. The shared mechanism these sit on top of
// (localStorage persistence, the Settings visibility toggle, the base
// print CSS rule that hides ticks entirely when disabled) is view-agnostic
// and was split out to core/read-tracking.test.js instead — deleting this
// folder does not lose that coverage. Book view's own equivalents of the
// tests below live in book/book-view.test.js and book/book-view-print.test.js.

test.describe('Read Tracking - continuous view rendering', () => {

    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({
                path: path.join(__dirname, '..', '..', 'data.json')
            });
        });

        await page.goto('/');
        await page.locator('.view-toggle-btn[data-view="continuous"]').click();
        await expect(page.locator('.card').first()).toBeVisible();

        // Read tracking is opt-in and off by default — the tick marks are
        // display:none until this is turned on in Settings.
        await page.locator('#settings-btn').click();
        await page.locator('#toggle-read-tracking').check();
        await expect(page.locator('.read-tick').first()).toBeVisible();
    });

    test('clicking a block\'s tick marks that block as read and updates the progress counter', async ({ page }) => {
        const block = page.locator('#q_001_b_1');
        const progress = page.locator('#read-progress');
        const before = await progress.textContent();

        await block.locator('.read-tick').click();

        await expect(block).toHaveClass(/read/);
        await expect(block.locator('.read-tick')).toHaveClass(/read/);
        await expect(progress).not.toHaveText(before);
    });

    test('marking one block read in a multi-block answer does not affect its sibling blocks', async ({ page }) => {
        // a_002 in the fixture has multiple blocks (a_002_b_1..b_4).
        await page.locator('#a_002_b_1 .read-tick').click();

        await expect(page.locator('#a_002_b_1')).toHaveClass(/read/);
        await expect(page.locator('#a_002_b_2')).not.toHaveClass(/read/);
    });

    test('clicking the tick again returns the block to unread', async ({ page }) => {
        const block = page.locator('#q_001_b_1');
        const tick = block.locator('.read-tick');

        await tick.click();
        await tick.click();

        await expect(block).not.toHaveClass(/read/);
        await expect(tick).not.toHaveClass(/read/);
    });

    test('in print, the tick reflects digital read progress for transfer to physical prints', async ({ page }) => {
        const tick = page.locator('.read-tick').first();
        await tick.click();
        await expect(tick).toHaveClass(/read/);

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        const appearance = await tick.evaluate(el => {
            const cs = getComputedStyle(el);
            return { display: cs.display, backgroundColor: cs.backgroundColor };
        });

        expect(appearance.display).not.toBe('none');
        // Print CSS carries over the green fill (#4caf50 -> rgb(76,175,80))
        // instead of clearing it, so users can see their read progress on
        // the printout.
        expect(appearance.backgroundColor).toBe('rgb(76, 175, 80)');
    });
});
