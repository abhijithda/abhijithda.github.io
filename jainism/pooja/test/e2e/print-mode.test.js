const { test, expect } = require('@playwright/test');

test.describe('Jaina Pooja WebUI - E2E Integration (Display Options)', () => {
    test('Display options: default, videos-only, qrs-only, none, both', async ({ page }) => {
        await page.goto('/');

        const body = page.locator('body');
        const videosCheckbox = page.locator('#toggle-videos');
        const qrsCheckbox = page.locator('#toggle-qrs');

        // Wait for content
        await expect(page.locator('.card').first()).toBeVisible();

        // DEFAULT: videos ON, qrs OFF
        await expect(body).toHaveClass(/show-videos/);
        await expect(body).not.toHaveClass(/show-qrs/);
        await expect(page.locator('.video-card').first()).toBeVisible();
        await expect(page.locator('.qr-code').first()).toBeHidden();

        // VIDEOS ONLY -> toggle qrs ON then videos OFF
        await qrsCheckbox.click();
        await expect(body).toHaveClass(/show-qrs/);
        await videosCheckbox.click();
        await expect(body).not.toHaveClass(/show-videos/);
        // Videos should be hidden, QR visible
        await expect(page.locator('.video-card').first()).toBeHidden();
        await expect(page.locator('.qr-code img').first()).toBeVisible();

        // NONE -> turn qrs OFF
        await qrsCheckbox.click();
        await expect(body).not.toHaveClass(/show-qrs/);
        await expect(page.locator('.qr-code').first()).toBeHidden();

        // BOTH -> turn videos ON and qrs ON
        await videosCheckbox.click();
        await qrsCheckbox.click();
        await expect(body).toHaveClass(/show-videos/);
        await expect(body).toHaveClass(/show-qrs/);
        await expect(page.locator('.video-card').first()).toBeVisible();
        await expect(page.locator('.qr-code img').first()).toBeVisible();
        
        // Verify QR PIP is inside the media wrapper bounds
        const pipInside = await page.evaluate(() => {
            const media = document.querySelector('.media-wrap');
            const pip = document.querySelector('.media-wrap .qr-code');
            if (!media || !pip) return false;
            const m = media.getBoundingClientRect();
            const p = pip.getBoundingClientRect();
            return p.left >= m.left && p.right <= m.right && p.top >= m.top && p.bottom <= m.bottom;
        });
        expect(pipInside).toBe(true);
    });
});