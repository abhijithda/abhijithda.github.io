const { test, expect } = require('@playwright/test');

// This is NOT a regression test — it makes no assertions and never fails on
// content changes. It exists purely to produce always-current screenshots of
// the live site (real data.json) across every Videos/QR display combination,
// in both normal screen view and print-emulated view, so you can manually
// review layout and prep printouts from CI artifacts without running the dev
// server locally every time.

const COMBINATIONS = [
    { name: 'videos-on-qr-off', videos: true, qrs: false },   // default
    { name: 'videos-on-qr-on', videos: true, qrs: true },     // both / PIP
    { name: 'videos-off-qr-on', videos: false, qrs: true },   // qr-only
    { name: 'videos-off-qr-off', videos: false, qrs: false }, // none
];

test.describe('Site Preview (screenshot artifacts only, no assertions)', () => {

    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({ path: 'test/data.json' });
        });

        await page.goto('/');
        await expect(page.locator('.card').first()).toBeVisible();

        await page.locator('#settings-btn').click();
        await expect(page.locator('#toggle-videos')).toBeVisible();
    });

    for (const combo of COMBINATIONS) {
        test(`Screen view: ${combo.name}`, async ({ page }) => {

            // force: true — these checkboxes live inside the collapsed Settings
            // menu, and we don't need to open the menu just to toggle them.
            await page.locator('#toggle-videos').setChecked(combo.videos, { force: true });
            await page.locator('#toggle-qrs').setChecked(combo.qrs, { force: true });

            // Let updateMediaVisibility() finish applying visibility changes.
            await page.waitForTimeout(500);

            await page.screenshot({
                path: `test-results/site-preview/screen-${combo.name}.png`,
                fullPage: true,
            });
        });

        test(`Print view: ${combo.name}`, async ({ page }) => {

            await page.locator('#toggle-videos').setChecked(combo.videos, { force: true });
            await page.locator('#toggle-qrs').setChecked(combo.qrs, { force: true });
            await page.waitForTimeout(500);

            await page.emulateMedia({ media: 'print' });
            await page.waitForTimeout(500); // let print CSS/fonts settle

            await page.screenshot({
                path: `test-results/site-preview/print-${combo.name}.png`,
                fullPage: true,
            });
        });
    }
});