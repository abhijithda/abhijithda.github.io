const { test, expect } = require('@playwright/test');

// Helper: precise classList check, since '.read-tick' is itself a base
// class name containing the substring "read" — a naive /read/ regex
// against it would false-positive regardless of actual read state.
async function hasClass(locator, className) {
    return locator.evaluate((el, cls) => el.classList.contains(cls), className);
}

test.describe('Read Tracking - block-level, local-only, no login', () => {

    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({ path: 'test/data.json' });
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

    test('the tick is invisible until Read tracking is enabled in Settings', async ({ page }) => {
        // Reload to get back to the off-by-default state, without the
        // beforeEach's toggle-enabling step.
        await page.reload();
        await expect(page.locator('.card').first()).toBeVisible();

        await expect(page.locator('.read-tick').first()).toBeHidden();
        await expect(page.locator('#read-progress')).toBeHidden();
    });

    test('in print, the tick shows as a blank pencil-markable circle even for a block already marked read digitally', async ({ page }) => {
        const tick = page.locator('#q_001_b_1 .read-tick');
        await tick.click(); // mark it read digitally first

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        const appearance = await tick.evaluate(el => {
            const cs = getComputedStyle(el);
            return { display: cs.display, background: cs.backgroundColor, color: cs.color };
        });

        expect(appearance.display).not.toBe('none');
        // Blank regardless of the .read class actually being present —
        // print never shows the digital fill/checkmark.
        expect(await hasClass(tick, 'read')).toBe(true);
        expect(appearance.background).toBe('rgba(0, 0, 0, 0)');
        expect(appearance.color).toBe('rgba(0, 0, 0, 0)');
    });

    test('in print, the tick is hidden entirely when Read tracking is off', async ({ page }) => {
        await page.reload();
        await expect(page.locator('.card').first()).toBeVisible();
        // Note: no Settings/toggle step here — stays at the off default.

        await page.emulateMedia({ media: 'print' });
        await expect(page.locator('.read-tick').first()).toBeHidden();
    });
});
