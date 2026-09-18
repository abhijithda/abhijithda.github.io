const { test, expect } = require('@playwright/test');
const path = require('path');
const { hasClass } = require('../test-utils');

// These test the shared core/read-tracking.js mechanism and its Settings
// persistence — localStorage read-state, the "Read tracking" visibility
// toggle, and the base (unconditional) print CSS rule that hides ticks
// entirely when the setting is off. None of this is continuous-view
// behavior; continuous view is just used here as the simplest vehicle to
// reach the DOM (fewer moving parts than book view's pagination). Book
// view's own rendering of read state has its own dedicated tests in
// book/book-view.test.js and book/book-view-print.test.js — this file
// isn't a substitute for those, it only covers what's identical
// regardless of which view happens to be showing.
//
// Split out from continuous/read-tracking.test.js, which kept the tests
// that actually exercise continuous-specific rendering (the progress
// counter's continuous-specific block IDs, sibling-block independence,
// continuous's own print rendering). See that file's own header comment.

test.describe('Read Tracking - shared mechanism and settings', () => {

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

    test('read state survives a full page reload (localStorage, no login)', async ({ page }) => {
        await page.locator('#q_001_b_1 .read-tick').click();
        await expect(page.locator('#q_001_b_1')).toHaveClass(/read/);

        await page.reload();
        await expect(page.locator('.card').first()).toBeVisible();

        // "Read tracking" visibility itself resets to off on reload (same
        // as Videos/QR) — the underlying read STATE persists regardless,
        // it's just not shown until re-enabled.
        await page.locator('#settings-btn').click();
        await page.locator('#toggle-read-tracking').check();

        await expect(page.locator('#q_001_b_1')).toHaveClass(/read/);
        // .read-tick's own base class already contains the substring
        // "read" — toHaveClass(/read/) would pass here regardless of
        // whether the tick were ever actually marked read, so this needs
        // an exact class-token check instead (see test-utils.js).
        expect(await hasClass(page.locator('#q_001_b_1 .read-tick'), 'read')).toBe(true);
    });

    test('Settings - read tracking visibility persists across reloads', async ({ page }) => {
        const readTrackingToggle = page.locator('#toggle-read-tracking');
        const settingsBtn = page.locator('#settings-btn');

        // 1. Disable read tracking and verify it hides
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

    test('in print, the tick is hidden entirely when Read tracking is disabled in settings', async ({ page }) => {
        // This is the base, unconditional `.read-tick { display: none }`
        // print rule (core/read-tracking.css) — it has no view-scoping at
        // all, so passing here is evidence it holds everywhere, not just
        // in continuous view.
        const readTrackingToggle = page.locator('#toggle-read-tracking');

        await readTrackingToggle.uncheck();
        await expect(page.locator('.read-tick').first()).toBeHidden();

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        await expect(page.locator('.read-tick').first()).toBeHidden();
    });
});
