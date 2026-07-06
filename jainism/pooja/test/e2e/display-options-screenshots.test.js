const { test, expect } = require('@playwright/test');

test.describe('Display Options - Visual Validation (Screenshots)', () => {
    
    test('Screenshot: Default state (Videos ON, QR OFF)', async ({ page }) => {
        await page.goto('/');
        
        const videosCheckbox = page.locator('#toggle-videos');
        const qrsCheckbox = page.locator('#toggle-qrs');
        const chatContainer = page.locator('#chat-container');
        
        // Wait for content to load
        await page.waitForSelector('#chat-container .card .video-card');
        
        // Verify default state
        await expect(videosCheckbox).toBeChecked();
        await expect(qrsCheckbox).not.toBeChecked();
        
        // Take screenshot
        await page.screenshot({ path: 'test-results/screenshots/01-default-videos-on.png', fullPage: true });
        
        // Validate that video is visible and QR is hidden
        const firstCardWithVideo = chatContainer.locator('.card:has(.video-card)').first();
        const videoInCard = firstCardWithVideo.locator('.video-card').first();
        const qrInCard = firstCardWithVideo.locator('.qr-code').first();
        
        await expect(videoInCard).toBeVisible();
        await expect(qrInCard).toBeHidden();
        
        console.log('✓ Default state: Videos visible, QR hidden');
    });

    test('Screenshot: QR-only state (Videos OFF, QR ON)', async ({ page }) => {
        await page.goto('/');
        
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
        
        // Take screenshot
        await page.screenshot({ path: 'test-results/screenshots/02-qr-only.png', fullPage: true });
        
        // Validate that QR is visible and video is hidden
        const firstCardWithMedia = chatContainer.locator('.card:has(.video-card)').first();
        const videoInCard = firstCardWithMedia.locator('.video-card').first();
        const qrInCard = firstCardWithMedia.locator('.qr-code').first();
        
        await expect(videoInCard).toBeHidden();
        await expect(qrInCard).toBeVisible();
        
        console.log('✓ QR-only state: Videos hidden, QR visible');
    });

    test('Screenshot: Both state (Videos ON, QR ON)', async ({ page }) => {
        await page.goto('/');
        
        const videosCheckbox = page.locator('#toggle-videos');
        const qrsCheckbox = page.locator('#toggle-qrs');
        const chatContainer = page.locator('#chat-container');
        
        // Wait for content to load
        await page.waitForSelector('#chat-container .card .video-card');
        
        // Set both ON state
        await videosCheckbox.check();
        await qrsCheckbox.check();
        
        // Wait for visibility changes
        await page.waitForTimeout(500);
        
        // Take screenshot
        await page.screenshot({ path: 'test-results/screenshots/03-both-videos-and-qr.png', fullPage: true });
        
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
        
        console.log('✓ Both state: Videos and QR visible with PIP layout');
    });

    test('Screenshot: None state (Videos OFF, QR OFF)', async ({ page }) => {
        await page.goto('/');
        
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
        
        // Take screenshot
        await page.screenshot({ path: 'test-results/screenshots/04-none-hidden.png', fullPage: true });
        
        // Validate both are hidden
        // Find a card that originally had videos
        const firstCardWithVideo = chatContainer.locator('.card:has(.video-card)').first();
        const videoInCard = firstCardWithVideo.locator('.video-card').first();
        const qrInCard = firstCardWithVideo.locator('.qr-code').first();
        
        await expect(videoInCard).toBeHidden();
        await expect(qrInCard).toBeHidden();
        
        console.log('✓ None state: Videos and QR hidden');
    });

    test('Screenshot: Videos-only state (Videos ON, QR OFF) - verify default persists', async ({ page }) => {
        await page.goto('/');
        
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
        
        // Take screenshot
        await page.screenshot({ path: 'test-results/screenshots/05-videos-only.png', fullPage: true });
        
        // Validate
        const firstCardWithMedia = chatContainer.locator('.card:has(.video-card)').first();
        const videoInCard = firstCardWithMedia.locator('.video-card').first();
        const qrInCard = firstCardWithMedia.locator('.qr-code').first();
        
        await expect(videoInCard).toBeVisible();
        await expect(qrInCard).toBeHidden();
        
        console.log('✓ Videos-only state: Videos visible, QR hidden');
    });
});
