const { test, expect } = require('@playwright/test');

// This feature (WhatsApp-style "replying to" preview, jump-to-source, and a
// Back button) was lost once already across branch merges/manual reverts —
// these tests exist so that can't happen silently again.
test.describe('Reply Excerpt - jump to source and back', () => {

    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({ path: 'test/data.json' });
        });

        await page.goto('/');
        await expect(page.locator('.card').first()).toBeVisible();
    });

    test('an answer that references its question shows a reply-excerpt', async ({ page }) => {
        // a_001 references q_001 in the fixture.
        const excerpt = page.locator('#a_001 .reply-excerpt.multi-block');
        await expect(excerpt).toBeVisible();
        await expect(excerpt.locator('.excerpt-row')).toHaveCount(1);
    });

    test('a question with no references shows no reply-excerpt', async ({ page }) => {
        await expect(page.locator('#q_001 .reply-excerpt')).toHaveCount(0);
    });

    // Regression test for a real bug: the excerpt used to ignore the
    // language selector entirely and always show both columns.
    test('the excerpt respects the selected language, same as regular blocks', async ({ page }) => {
        await page.locator('#settings-btn').click();
        await page.selectOption('#lang-select', 'kn');
        const excerpt = page.locator('#a_001 .reply-excerpt .excerpt-row').first();
        await expect(excerpt.locator('.col-kn')).toBeVisible();
        await expect(excerpt.locator('.col-en')).toHaveCount(0);
    });

    test('clicking the excerpt block-id scrolls to the source and shows Back to Message', async ({ page }) => {
        const backBtn = page.locator('#back-to-message');
        await expect(backBtn).toBeHidden();

        await page.locator('#a_001 .excerpt-row .block-id').click();

        await expect(backBtn).toBeVisible();
        await expect(backBtn).toContainText('←');
        await expect(page.locator('#q_001_b_1')).toBeInViewport();
    });

    test('clicking Back to Message returns to where the reader jumped from', async ({ page }) => {
        await page.locator('#a_001').scrollIntoViewIfNeeded();
        const scrollBeforeJump = await page.evaluate(() => window.scrollY);

        await page.locator('#a_001 .excerpt-row .block-id').click();
        await page.waitForTimeout(400);

        const scrollAfterJump = await page.evaluate(() => window.scrollY);
        expect(scrollAfterJump).not.toBe(scrollBeforeJump);

        await page.locator('#back-to-message').click();
        await page.waitForTimeout(400);

        const scrollAfterBack = await page.evaluate(() => window.scrollY);
        expect(Math.abs(scrollAfterBack - scrollBeforeJump)).toBeLessThan(30);
    });

    test('clicking the excerpt content expands it, and clicking again collapses it', async ({ page }) => {
        const excerptRow = page.locator('#a_001 .excerpt-row').first();
        const contentWrap = excerptRow.locator('.excerpt-content-wrap');

        await expect(excerptRow).not.toHaveClass(/expanded/);

        await contentWrap.click();
        await expect(excerptRow).toHaveClass(/expanded/);

        await contentWrap.click();
        await expect(excerptRow).not.toHaveClass(/expanded/);
    });
});
