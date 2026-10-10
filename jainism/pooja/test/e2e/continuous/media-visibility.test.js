const { test, expect } = require('@playwright/test');
const path = require('path');
const { plainPhotoInsert } = require('../test-utils');

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
            route.fulfill({
                path: path.join(__dirname, '..', '..', 'data.json')
            });
        });

        await page.goto('/');
        // The app lands on the Home page first — switch to continuous
        // view explicitly before waiting on .card, since these tests are
        // continuous-view-specific.
        await page.locator('.view-toggle-btn[data-view="continuous"]').click();
        await expect(page.locator('.card').first()).toBeVisible();

        await page.locator('#settings-btn').click();
        await expect(page.locator('#toggle-videos')).toBeVisible();
    });

    test('a standalone photo item stays visible when both toggles are off', async ({ page }) => {
        // Isolated fixture, not the shared small one — the shared fixture's
        // only standalone-image item is the cover (ins_001, hideId: true),
        // which deliberately renders with no findable DOM id at all; this
        // test needs a plain, referenceable standalone photo instead.
        await page.route('**/data.json', route => route.fulfill({
            json: [plainPhotoInsert('i_001')],
        }));
        await page.reload();
        await page.locator('.view-toggle-btn[data-view="continuous"]').click();
        await expect(page.locator('.card').first()).toBeVisible();
        await page.locator('#settings-btn').click();
        await expect(page.locator('#toggle-videos')).toBeVisible();

        // Videos is ON and QR is OFF by default — turn Videos off too.
        await page.locator('#toggle-videos').uncheck();
        await page.waitForTimeout(300);

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

// A standalone photo (image + caption, no block.content) must sit in the same
// content column as text blocks — beside the id badge, left-aligned with the
// text columns — rather than wrapping under the id at the card's far-left
// edge at a fixed width. See "Standalone photos" in continuous-view.css.
test.describe('Media Layout - standalone photo alignment (screen)', () => {

    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => route.fulfill({
            json: [plainPhotoInsert('i_001')],
        }));
        await page.goto('/');
        await page.locator('.view-toggle-btn[data-view="continuous"]').click();
        await expect(page.locator('.card').first()).toBeVisible();
    });

    test('the photo sits beside the id badge, not wrapped under it', async ({ page }) => {
        const idBox = await page.locator('#i_001_b_1 .block-id').boundingBox();
        const imgBox = await page.locator('#i_001_b_1 .image-card img').boundingBox();
        expect(imgBox.x).toBeGreaterThanOrEqual(idBox.x + idBox.width);
        expect(imgBox.y).toBeLessThan(idBox.y + idBox.height + 40);
    });

    test('the photo starts at its column\'s left edge, even when narrower than the column', async ({ page }) => {
        const colBox = await page.locator('#i_001_b_1 .col-media').boundingBox();
        const imgBox = await page.locator('#i_001_b_1 .image-card img').boundingBox();
        expect(Math.abs(imgBox.x - colBox.x)).toBeLessThanOrEqual(1);
    });

    test('the photo stays inside its card and within the 80vh height cap', async ({ page }) => {
        const cardBox = await page.locator('#i_001').boundingBox();
        const imgBox = await page.locator('#i_001_b_1 .image-card img').boundingBox();
        const vh = page.viewportSize().height;
        expect(imgBox.x + imgBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
        expect(imgBox.height).toBeLessThanOrEqual(vh * 0.8 + 1);
    });

    test('the captions stay inside the image card and do not overflow onto the next block', async ({ page }) => {
        const cardBox = await page.locator('#i_001_b_1 .image-card').boundingBox();
        const captions = page.locator('#i_001_b_1 .image-caption');
        const n = await captions.count();
        expect(n).toBeGreaterThan(0);
        for (let i = 0; i < n; i++) {
            const c = await captions.nth(i).boundingBox();
            expect(c.y + c.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
        }
    });
});
