const { test, expect } = require('@playwright/test');

test.describe('Read Tracking - block-level, local-only, no login', () => {

    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({ path: 'test/data.json' });
        });

        await page.goto('/');
        await expect(page.locator('.card').first()).toBeVisible();
    });

    test('toggling a block\'s slider marks that block as read and updates the progress counter', async ({ page }) => {
        const block = page.locator('#q_001_b_1');
        const progress = page.locator('#read-progress');
        const before = await progress.textContent();

        await block.locator('.read-switch input').click();

        await expect(block).toHaveClass(/read/);
        await expect(progress).not.toHaveText(before);
    });

    test('marking one block read in a multi-block answer does not affect its sibling blocks', async ({ page }) => {
        // a_002 in the fixture has multiple blocks (a_002_b_1..b_4).
        await page.locator('#a_002_b_1 .read-switch input').click();

        await expect(page.locator('#a_002_b_1')).toHaveClass(/read/);
        await expect(page.locator('#a_002_b_2')).not.toHaveClass(/read/);
    });

    test('read state survives a full page reload (localStorage, no login)', async ({ page }) => {
        await page.locator('#q_001_b_1 .read-switch input').click();
        await expect(page.locator('#q_001_b_1')).toHaveClass(/read/);

        await page.reload();
        await expect(page.locator('.card').first()).toBeVisible();

        await expect(page.locator('#q_001_b_1')).toHaveClass(/read/);
        await expect(page.locator('#q_001_b_1 .read-switch input')).toBeChecked();
    });

    test('toggling the slider off again returns the block to unread', async ({ page }) => {
        const block = page.locator('#q_001_b_1');
        const toggle = block.locator('.read-switch input');

        await toggle.click();
        await toggle.click();

        await expect(block).not.toHaveClass(/read/);
        await expect(toggle).not.toBeChecked();
    });
});
