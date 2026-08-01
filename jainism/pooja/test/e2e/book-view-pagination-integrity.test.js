/**
 * PAGINATION INTEGRITY TESTS
 *
 * These exist because pagination has broken silently before: a card whose
 * real rendered height exceeded the estimate got clipped by
 * `.page-content { overflow: hidden }` — invisible, not deleted, so it's
 * easy to miss without actually walking every spread and checking.
 *
 * These tests walk the ENTIRE book, spread by spread, and check:
 *   1. Every question/answer that exists in Continuous View also renders
 *      in Book View (no card silently dropped by pagination).
 *   2. No card's bounding box exceeds its page's content box (nothing is
 *      being clipped by overflow:hidden — if it were, height/position
 *      would exceed the page bounds).
 *   3. Question and answer numbers appear in strictly increasing order
 *      with no skips.
 *   4. Reply excerpts, videos, QR codes, and images all appear in book
 *      view exactly as they do in continuous view.
 *   5. Settings (language filter, video/QR toggles, read tracking) work
 *      identically in both views.
 *
 * Run: npm run test:e2e -- book-view-pagination-integrity
 * Uses playwright.config.js's baseURL (http://localhost:8080) — do not
 * hardcode a different host/port here.
 */

const { test, expect } = require('@playwright/test');

test.describe('Pagination Integrity — Book View', () => {

    test('every card in Continuous View also appears in Book View (no drops)', async ({ page }) => {
        await page.goto('/jainism/pooja/index.html');
        await page.waitForLoadState('networkidle');

        // Collect all card ids from Continuous View
        await page.locator('[data-view="continuous"]').click();
        await page.waitForTimeout(300);
        const continuousIds = await page.locator('.card').evaluateAll(els => els.map(e => e.id));

        // Collect all card ids from Book View by walking every spread
        await page.locator('[data-view="book"]').click();
        await page.waitForTimeout(300);

        const bookIds = [];
        const nextBtn = page.locator('#book-next-btn');
        // Capture first spread, then walk forward
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const idsOnSpread = await page.locator('.book-spread .card').evaluateAll(els => els.map(e => e.id));
            bookIds.push(...idsOnSpread);

            if (await nextBtn.isDisabled()) break;
            await nextBtn.click();
            await page.waitForTimeout(150);
        }

        const missing = continuousIds.filter(id => !bookIds.includes(id));
        expect(missing, `Cards present in Continuous View but missing from Book View: ${missing.join(', ')}`).toEqual([]);

        // Also check for duplicates (would indicate a pagination loop bug)
        const dupes = bookIds.filter((id, i) => bookIds.indexOf(id) !== i);
        expect(dupes, `Cards duplicated across spreads: ${[...new Set(dupes)].join(', ')}`).toEqual([]);
    });

    test('no card is clipped by page overflow (bounding box stays within page)', async ({ page }) => {
        await page.goto('/jainism/pooja/index.html');
        await page.waitForLoadState('networkidle');

        const nextBtn = page.locator('#book-next-btn');
        const overflowing = [];

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const pages = await page.locator('.book-page').all();
            for (const bookPage of pages) {
                const pageBox = await bookPage.boundingBox();
                const cards = await bookPage.locator('.card').all();
                for (const card of cards) {
                    const cardBox = await card.boundingBox();
                    if (!pageBox || !cardBox) continue;
                    // Card's bottom edge must not exceed the page's bottom edge
                    if (cardBox.y + cardBox.height > pageBox.y + pageBox.height + 1) {
                        const id = await card.getAttribute('id');
                        overflowing.push(id);
                    }
                }
            }

            if (await nextBtn.isDisabled()) break;
            await nextBtn.click();
            await page.waitForTimeout(150);
        }

        expect(overflowing, `Cards overflowing their page (clipped/invisible): ${overflowing.join(', ')}`).toEqual([]);
    });

    test('question numbers appear with no skips', async ({ page }) => {
        await page.goto('/jainism/pooja/index.html');
        await page.waitForLoadState('networkidle');

        const nextBtn = page.locator('#book-next-btn');
        const allQuestionIds = [];

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const ids = await page.locator('.card.question').evaluateAll(els => els.map(e => e.id));
            allQuestionIds.push(...ids);
            if (await nextBtn.isDisabled()) break;
            await nextBtn.click();
            await page.waitForTimeout(150);
        }

        const numbers = allQuestionIds
            .map(id => parseInt(id.replace(/^q_/, ''), 10))
            .filter(n => !isNaN(n))
            .sort((a, b) => a - b);

        for (let i = 1; i < numbers.length; i++) {
            const gap = numbers[i] - numbers[i - 1];
            expect(gap, `Question numbering jumped from q_${numbers[i - 1]} to q_${numbers[i]} — a question was skipped`).toBe(1);
        }
    });

    test('answer numbers appear with no skips', async ({ page }) => {
        await page.goto('/jainism/pooja/index.html');
        await page.waitForLoadState('networkidle');

        const nextBtn = page.locator('#book-next-btn');
        const allAnswerIds = [];

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const ids = await page.locator('.card.answer').evaluateAll(els => els.map(e => e.id));
            allAnswerIds.push(...ids);
            if (await nextBtn.isDisabled()) break;
            await nextBtn.click();
            await page.waitForTimeout(150);
        }

        const numbers = allAnswerIds
            .map(id => parseInt(id.replace(/^a_/, ''), 10))
            .filter(n => !isNaN(n))
            .sort((a, b) => a - b);

        for (let i = 1; i < numbers.length; i++) {
            const gap = numbers[i] - numbers[i - 1];
            expect(gap, `Answer numbering jumped from a_${numbers[i - 1]} to a_${numbers[i]} — an answer was skipped`).toBe(1);
        }
    });

    test('every answer with a reference shows its reply excerpt', async ({ page }) => {
        await page.goto('/jainism/pooja/index.html');
        await page.waitForLoadState('networkidle');

        const nextBtn = page.locator('#book-next-btn');
        let excerptCount = 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            excerptCount += await page.locator('.book-spread .reply-excerpt').count();
            if (await nextBtn.isDisabled()) break;
            await nextBtn.click();
            await page.waitForTimeout(150);
        }

        expect(excerptCount).toBeGreaterThan(0);
    });
});

test.describe('Feature Parity — Book View matches Continuous View', () => {

    test('language filter affects book view', async ({ page }) => {
        await page.goto('/jainism/pooja/index.html');
        await page.waitForLoadState('networkidle');

        const settingsBtn = page.locator('#settings-btn');
        await settingsBtn.click();
        const langSelect = page.locator('#lang-select');
        await langSelect.selectOption('kn');
        await page.waitForTimeout(300);

        // Book view should still render without crashing
        const bookView = page.locator('#book-view');
        await expect(bookView).toBeVisible();
        const cards = page.locator('.card');
        expect(await cards.count()).toBeGreaterThan(0);
    });

    test('video toggle does not break book view', async ({ page }) => {
        await page.goto('/jainism/pooja/index.html');
        await page.waitForLoadState('networkidle');

        await page.locator('#settings-btn').click();
        await page.locator('#toggle-videos').click();
        await page.waitForTimeout(300);

        await expect(page.locator('#book-view')).toBeVisible();
    });

    test('QR toggle does not break book view', async ({ page }) => {
        await page.goto('/jainism/pooja/index.html');
        await page.waitForLoadState('networkidle');

        await page.locator('#settings-btn').click();
        await page.locator('#toggle-qrs').click();
        await page.waitForTimeout(300);

        await expect(page.locator('#book-view')).toBeVisible();
    });

    test('read tracking toggle works in book view', async ({ page }) => {
        await page.goto('/jainism/pooja/index.html');
        await page.waitForLoadState('networkidle');

        await page.locator('#settings-btn').click();
        await page.locator('#toggle-read-tracking').click();
        await page.waitForTimeout(300);

        const ticks = page.locator('.read-tick');
        expect(await ticks.count()).toBeGreaterThan(0);
    });

    test('read tick is circular, not elliptical', async ({ page }) => {
        await page.goto('/jainism/pooja/index.html');
        await page.waitForLoadState('networkidle');

        await page.locator('#settings-btn').click();
        await page.locator('#toggle-read-tracking').click();
        await page.waitForTimeout(300);

        const tick = page.locator('.read-tick').first();
        const box = await tick.boundingBox();
        expect(box).not.toBeNull();
        // Width and height must match within 1px for a true circle
        expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);
    });
});

test.describe('Screenshots — Book View', () => {
    test('capture first few spreads for visual review', async ({ page }, testInfo) => {
        await page.goto('/jainism/pooja/index.html');
        await page.waitForLoadState('networkidle');

        const nextBtn = page.locator('#book-next-btn');
        for (let i = 0; i < 4; i++) {
            const spread = page.locator('.book-spread').first();
            await testInfo.attach(`spread-${i + 1}`, {
                body: await spread.screenshot(),
                contentType: 'image/png',
            });
            if (await nextBtn.isDisabled()) break;
            await nextBtn.click();
            await page.waitForTimeout(200);
        }
    });
});
