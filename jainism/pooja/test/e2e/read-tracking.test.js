const { test, expect } = require('@playwright/test');
const path = require('path');

// Helper: precise classList check, since '.read-tick' is itself a base
// class name containing the substring "read" — a naive /read/ regex
// against it would false-positive regardless of actual read state.
async function hasClass(locator, className) {
    return locator.evaluate((el, cls) => el.classList.contains(cls), className);
}

test.describe('Read Tracking - block-level, local-only, no login', () => {

    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({
                path: path.join(__dirname, '..', 'data.json')
            });
        });

        await page.goto('/');
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

        expect(await hasClass(block, 'read')).toBe(true);
        expect(await hasClass(block.locator('.read-tick'), 'read')).toBe(true);
        await expect(progress).not.toHaveText(before);
    });

    test('marking one block read in a multi-block answer does not affect its sibling blocks', async ({ page }) => {
        // a_002 in the fixture has multiple blocks (a_002_b_1..b_4).
        await page.locator('#a_002_b_1 .read-tick').click();

        expect(await hasClass(page.locator('#a_002_b_1'), 'read')).toBe(true);
        expect(await hasClass(page.locator('#a_002_b_2'), 'read')).toBe(false);
    });

    test('read state survives a full page reload (localStorage, no login)', async ({ page }) => {
        await page.locator('#q_001_b_1 .read-tick').click();
        expect(await hasClass(page.locator('#q_001_b_1'), 'read')).toBe(true);

        await page.reload();
        await expect(page.locator('.card').first()).toBeVisible();

        // "Read tracking" visibility itself resets to off on reload (same
        // as Videos/QR) — the underlying read STATE persists regardless,
        // it's just not shown until re-enabled.
        await page.locator('#settings-btn').click();
        await page.locator('#toggle-read-tracking').check();

        expect(await hasClass(page.locator('#q_001_b_1'), 'read')).toBe(true);
        expect(await hasClass(page.locator('#q_001_b_1 .read-tick'), 'read')).toBe(true);
    });

    test('clicking the tick again returns the block to unread', async ({ page }) => {
        const block = page.locator('#q_001_b_1');
        const tick = block.locator('.read-tick');

        await tick.click();
        await tick.click();

        expect(await hasClass(block, 'read')).toBe(false);
        expect(await hasClass(tick, 'read')).toBe(false);
    });

    test('Settings - read tracking visibility persists across reloads', async ({ page }) => {
        const readTrackingToggle = page.locator('#toggle-read-tracking');
        const settingsBtn = page.locator('#settings-btn'); // Grab the settings button

        // 1. Disable read tracking and verify it hides
        // (Assuming beforeEach already opens the menu here)
        await readTrackingToggle.uncheck();
        await expect(page.locator('.read-tick').first()).toBeHidden();

        // 2. Reload the page and verify the OFF state persisted via localStorage
        await page.reload();
        await expect(page.locator('.card').first()).toBeVisible();
        await expect(page.locator('.read-tick').first()).toBeHidden();

        // 3. Enable read tracking and verify it shows
        await settingsBtn.click();
        await readTrackingToggle.check();
        await expect(page.locator('.read-tick').first()).toBeVisible();

        // 4. Reload the page and verify the ON state persisted via localStorage
        await page.reload();
        await expect(page.locator('.card').first()).toBeVisible();
        await expect(page.locator('.read-tick').first()).toBeVisible();
    });

    test('in print, the tick reflects digital read progress for transfer to physical prints', async ({ page }) => {
        const readTrackingToggle = page.locator('#toggle-read-tracking');
        // Ensure read tracking is enabled (handling potential beforeEach overrides)
        await readTrackingToggle.check();

        // Target the first tick and mark it as read digitally
        const tick = page.locator('.read-tick').first();
        await tick.click();
        await expect(tick).toHaveClass(/read/); // Ensure the JS applied the class

        // Emulate print media
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200); // Give the browser a moment to apply @media print styles

        // Evaluate the computed styles of the printed read tick
        const appearance = await tick.evaluate(el => {
            const cs = getComputedStyle(el);
            return { display: cs.display, backgroundColor: cs.backgroundColor };
        });

        expect(appearance.display).not.toBe('none');

        // Print CSS now carries over the green fill (#4caf50 -> rgb(76, 175, 80)) 
        // instead of clearing it, so users can see their read progress on the printout.
        expect(appearance.backgroundColor).toBe('rgb(76, 175, 80)');
    });

    test('in print, the tick is hidden entirely when Read tracking is disabled in settings', async ({ page }) => {
        const readTrackingToggle = page.locator('#toggle-read-tracking');

        // Turn off read tracking via the toggle
        await readTrackingToggle.uncheck();
        await expect(page.locator('.read-tick').first()).toBeHidden();

        // Emulate print media
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        // Verify ticks remain hidden in the print view so they don't clutter the page unnecessarily
        await expect(page.locator('.read-tick').first()).toBeHidden();
    });
});
