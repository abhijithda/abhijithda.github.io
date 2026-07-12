const { test, expect } = require('@playwright/test');

test.describe('Display Options - Visual Validation (Screenshots)', () => {

    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({ path: 'test/data.json' });
        });

        await page.goto('/');
        await expect(page.locator('.card').first()).toBeVisible();

        await page.locator('#settings-btn').click();
        await expect(page.locator('#toggle-videos')).toBeVisible();
    });

    test('Screenshot: Default state (Videos ON, QR OFF)', async ({ page }) => {
        const videosCheckbox = page.locator('#toggle-videos');
        const qrsCheckbox = page.locator('#toggle-qrs');
        const chatContainer = page.locator('#chat-container');

        // Wait for content to load
        await page.waitForSelector('#chat-container .card .video-card');

        // Verify default state
        await expect(videosCheckbox).toBeChecked();
        await expect(qrsCheckbox).not.toBeChecked();

        // Validate that video is visible and QR is hidden
        const firstCardWithVideo = chatContainer.locator('.card:has(.video-card)').first();
        const videoInCard = firstCardWithVideo.locator('.video-card').first();
        const qrInCard = firstCardWithVideo.locator('.qr-code').first();

        await expect(videoInCard).toBeVisible();
        await expect(qrInCard).toBeHidden();

        // Capture visual snapshot for comparison (viewport only for consistency)
        await expect(page).toHaveScreenshot('screenshot-default-state-videos-on-qr-off.png', {
            fullPage: true, // Optional: captures the entire scrollable page
            timeout: 20000
        });

        console.log('✓ Default state: Videos visible, QR hidden');
    });

    test('Screenshot: QR-only state (Videos OFF, QR ON)', async ({ page }) => {
        const videosCheckbox = page.locator('#toggle-videos');
        const qrsCheckbox = page.locator('#toggle-qrs');
        const chatContainer = page.locator('#chat-container');

        // Wait for content to load
        await page.waitForSelector('#chat-container .card .video-card');

        // Set QR-only state
        await videosCheckbox.uncheck();
        await qrsCheckbox.check();

        // Wait for visibility changes
        await page.waitForTimeout(500);

        // Validate that QR is visible and video is hidden
        const firstCardWithMedia = chatContainer.locator('.card:has(.video-card)').first();
        const videoInCard = firstCardWithMedia.locator('.video-card').first();
        const qrInCard = firstCardWithMedia.locator('.qr-code').first();

        await expect(videoInCard).toBeHidden();
        await expect(qrInCard).toBeVisible();

        // Capture visual snapshot for comparison (viewport only for consistency)
        await expect(page).toHaveScreenshot('screenshot-qr-only-state-videos-off-qr-on.png', {
            fullPage: true, // Optional: captures the entire scrollable page
            timeout: 20000
            //fullPage: false,
            // maxDiffPixels: 1000
        });

        console.log('✓ QR-only state: Videos hidden, QR visible');
    });

    test('Screenshot: Both state (Videos ON, QR ON)', async ({ page }) => {
        const settingsBtn = page.locator('#settings-btn');
        const videosCheckbox = page.locator('#toggle-videos');
        const qrsCheckbox = page.locator('#toggle-qrs');
        const chatContainer = page.locator('#chat-container');

        await page.waitForSelector('#chat-container .card .video-card');

        // // Open the Settings menu — the toggles are hidden inside it until this is clicked
        // await settingsBtn.click();
        await expect(qrsCheckbox).toBeVisible();

        await videosCheckbox.check();
        await qrsCheckbox.check();

        await page.waitForTimeout(500);

        // Validate both are visible
        const firstCardWithMedia = chatContainer.locator('.card:has(.video-card)').first();
        const videoInCard = firstCardWithMedia.locator('.video-card').first();
        const qrInCard = firstCardWithMedia.locator('.qr-code').first();

        await expect(videoInCard).toBeVisible();
        await expect(qrInCard).toBeVisible();

        // Verify QR is positioned as PIP (Picture-in-Picture) over video
        const qrBounds = await qrInCard.boundingBox();
        const mediaWrap = firstCardWithMedia.locator('.media-wrap').first();
        const mediaWrapBounds = await mediaWrap.boundingBox();

        // QR should be within media-wrap bounds
        if (qrBounds && mediaWrapBounds) {
            expect(qrBounds.x >= mediaWrapBounds.x).toBe(true);
            expect(qrBounds.y >= mediaWrapBounds.y).toBe(true);
            console.log(`✓ PIP Layout verified: QR positioned over video within media-wrap`);
        }

        // Capture visual snapshot for comparison (viewport only for consistency)
        await expect(page).toHaveScreenshot('screenshot-both-state-videos-on-qr-on.png', {
            // fullPage: false,
            // maxDiffPixels: 1000
            fullPage: true, // Optional: captures the entire scrollable page
            timeout: 20000
        });

        console.log('✓ Both state: Videos and QR visible with PIP layout');
    });

    test('Screenshot: None state (Videos OFF, QR OFF)', async ({ page }) => {
        const videosCheckbox = page.locator('#toggle-videos');
        const qrsCheckbox = page.locator('#toggle-qrs');
        const chatContainer = page.locator('#chat-container');

        // Wait for content to load
        await page.waitForSelector('#chat-container .card');

        // Set none state
        await videosCheckbox.uncheck();
        await qrsCheckbox.uncheck();

        // Wait for visibility changes
        await page.waitForTimeout(500);

        // Validate both are hidden
        // Find a card that originally had videos
        const firstCardWithVideo = chatContainer.locator('.card:has(.video-card)').first();
        const videoInCard = firstCardWithVideo.locator('.video-card').first();
        const qrInCard = firstCardWithVideo.locator('.qr-code').first();

        await expect(videoInCard).toBeHidden();
        await expect(qrInCard).toBeHidden();

        // Capture visual snapshot for comparison (viewport only for consistency)
        await expect(page).toHaveScreenshot('screenshot-none-state-videos-off-qr-off.png', {
            fullPage: false,
            maxDiffPixels: 1000
        });

        console.log('✓ None state: Videos and QR hidden');
    });

    test('Screenshot: Videos-only state (Videos ON, QR OFF) - verify default persists', async ({ page }) => {
        const videosCheckbox = page.locator('#toggle-videos');
        const qrsCheckbox = page.locator('#toggle-qrs');
        const chatContainer = page.locator('#chat-container');

        // Wait for content to load
        await page.waitForSelector('#chat-container .card .video-card');

        // Ensure state is Videos ON, QR OFF (default)
        await videosCheckbox.check();
        await qrsCheckbox.uncheck();

        // Wait for visibility changes
        await page.waitForTimeout(500);

        // Validate
        const firstCardWithMedia = chatContainer.locator('.card:has(.video-card)').first();
        const videoInCard = firstCardWithMedia.locator('.video-card').first();
        const qrInCard = firstCardWithMedia.locator('.qr-code').first();

        await expect(videoInCard).toBeVisible();
        await expect(qrInCard).toBeHidden();

        // Capture visual snapshot for comparison (viewport only for consistency)
        await expect(page).toHaveScreenshot('screenshot-videos-only-state-videos-on-qr-off.png', {
            // fullPage: false,
            // maxDiffPixels: 1000
            fullPage: true, // Optional: captures the entire scrollable page
            timeout: 20000
        });

        console.log('✓ Videos-only state: Videos visible, QR hidden');
    });
});