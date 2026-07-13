const { test, expect } = require('@playwright/test');

// Regression coverage for a real bug: .col-media's visibility used to be
// gated entirely on the Videos/QR toggles, so any photo (standalone item,
// media-only block inside an answer, or a photo sitting alongside a video)
// would vanish whenever both toggles were off. The 'has-images' class
// (see script.js/style.css) decouples photos from that gating — these
// tests assert the actual rendered behavior, independent of the CSS
// implementation detail, so a future specificity regression would be
// caught here even if the has-images unit tests in script.test.js pass.
test.describe('Media Visibility - Images independent of Video/QR toggles', () => {

    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({ path: 'test/data.json' });
        });

        await page.goto('/');
        await expect(page.locator('.card').first()).toBeVisible();

        await page.locator('#settings-btn').click();
        await expect(page.locator('#toggle-videos')).toBeVisible();
    });

    test('a standalone photo item stays visible when both toggles are off', async ({ page }) => {
        // Videos is ON and QR is OFF by default — turn Videos off too.
        await page.locator('#toggle-videos').uncheck();
        await page.waitForTimeout(300);

        // i_001: standalone "images"-type item in the fixture
        await expect(page.locator('#i_001_b_1 .image-card img')).toBeVisible();
    });

    test('a media-only photo block inside a text-heavy answer stays visible when both toggles are off', async ({ page }) => {
        await page.locator('#toggle-videos').uncheck();
        await page.waitForTimeout(300);

        // a_002_b_4: content-less image block inside the a_002 answer item
        // — matches the real-world "I-13.5" case (photo inside an answer,
        // not a standalone item).
        await expect(page.locator('#a_002_b_4 .image-card img')).toBeVisible();
    });

    test('a photo stays visible (and its sibling video stays hidden) when both toggles are off', async ({ page }) => {
        await page.locator('#toggle-videos').uncheck();
        await page.waitForTimeout(300);

        // a_004_b_1: mixed-media block — both a video and an image together
        // ("video explains, photo shows something related"). The photo
        // must stay visible; the video must still respect its own toggle.
        const block = page.locator('#a_004_b_1');
        await expect(block.locator('.image-card img')).toBeVisible();
        await expect(block.locator('.video-card')).toBeHidden();
    });

    test('the video becomes visible again when the Videos toggle is re-enabled, alongside the still-visible photo', async ({ page }) => {
        await page.locator('#toggle-videos').uncheck();
        await page.waitForTimeout(300);
        await page.locator('#toggle-videos').check();
        await page.waitForTimeout(300);

        const block = page.locator('#a_004_b_1');
        await expect(block.locator('.image-card img')).toBeVisible();
        await expect(block.locator('.video-card')).toBeVisible();
    });
});