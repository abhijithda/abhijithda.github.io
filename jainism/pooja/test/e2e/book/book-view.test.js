const { test, expect } = require('@playwright/test');
const path = require('path');
const { hasClass } = require('../test-utils');

// Switches into book view and waits for the first spread to actually render
// (initBookView populates cards synchronously, but the first
// renderCurrentSpread() call is deferred via setTimeout). Does NOT assert
// a numbered page — the app now lands on Home first, and book view's own
// default spread is the (unnumbered) cover when the data has one, so
// "some card is visible" is the only thing every caller can rely on.
// Tests that specifically need numbered content check for it themselves.
async function openBookView(page) {
    await page.locator('.view-toggle-btn[data-view="book"]').click();
    await expect(page.locator('#book-container')).toHaveClass(/active/);
    await expect(page.locator('#book-columns .book-card').first()).toBeVisible();
}

test.describe('Book View — using the small controlled fixture', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({
                path: path.join(__dirname, '..', '..', 'data.json')
            });
        });
        // The app now lands on the Home page first, not book view — each
        // test below calls openBookView() itself before relying on its
        // content, so beforeEach only needs to get past the initial goto.
        await page.goto('/');
    });

    test('the view-toggle button switches from continuous to book view', async ({ page }) => {
        await openBookView(page);

        await expect(page.locator('#continuous-container')).toHaveCSS('display', 'none');
        await expect(page.locator('.view-toggle-btn[data-view="book"]')).toHaveClass(/active/);
    });

    test('a standalone photo (insert with no block.content, just a caption) renders as its own centered page, not inline with text', async ({ page }) => {
        // Isolated fixture, not the shared small one — the shared fixture
        // keeps q_001 right on the cover's facing page (spread 0), which
        // every other test in this file relies on; adding a second insert
        // here would push q_001 onto spread 1 and break those.
        await page.route('**/data.json', route => route.fulfill({
            json: [
                { id: 'ins_001', type: 'insert', hideId: true, blocks: [{ id: 'ins_001_b_1', type: 'images' }] },
                {
                    id: 'i_001', type: 'insert',
                    blocks: [{ id: 'i_001_b_1', type: 'images', images: [{ src: 'test.jpg', caption: { kn: 'ಪರೀಕ್ಷೆ', en: 'Test Caption' } }] }],
                },
            ],
        }));
        await page.reload();
        await openBookView(page);

        const card = page.locator('#book-i_001');
        await expect(card).toHaveClass(/standalone-image/);
        await expect(card.locator('.book-image')).toBeVisible();
    });

    test('an answer that references its question shows a book-excerpt strip', async ({ page }) => {
        await openBookView(page);

        // a_001 references q_001 in the fixture (same relationship reply-excerpt.test.js checks in continuous view).
        // Preview uses the first active language (kn here) — same fix as
        // applied to the unit test earlier; this e2e test had the same
        // English-text assumption and was never corrected.
        const excerpt = page.locator('#book-a_001_b_1 .book-excerpt');
        await expect(excerpt).toBeVisible();
        await expect(excerpt).toContainText(/ಎಲ್ಲಾ ದೇವರು ಒಂದೇ/);
    });

    test('switching to a single language hides the other language\'s lines in book view', async ({ page }) => {
        await openBookView(page);

        await page.locator('#settings-btn').click();
        await page.locator('#lang-trigger').click();
        // Uncheck Kannada, leaving only English active.
        await page.locator('#lang-chk-kn').uncheck();

        await expect(page.locator('#book-columns .book-lang-line.lang-kn')).toHaveCount(0);
        await expect(page.locator('#book-columns .book-lang-line.lang-en').first()).toBeVisible();
    });

    test('media toggles hide/show the video thumbnail and QR independently in book view', async ({ page }) => {
        await openBookView(page);
        await page.waitForSelector('#book-columns .book-vid-row');

        const thumb = page.locator('#book-columns .book-vid-thumb').first();
        const qr = page.locator('#book-columns .book-vid-qr').first();

        // Default: Videos on, QR off.
        await expect(thumb).toBeVisible();
        await expect(qr).toBeHidden();

        await page.locator('#settings-btn').click();
        await page.locator('#toggle-qrs').check();
        await expect(qr).toBeVisible();

        await page.locator('#toggle-videos').uncheck();
        await expect(thumb).toBeHidden();
        await expect(qr).toBeVisible();
    });

    test('read tracking works in book view and shares state with the header progress counter', async ({ page }) => {
        await openBookView(page);

        await page.locator('#settings-btn').click();
        await page.locator('#toggle-read-tracking').check();

        const tick = page.locator('#book-q_001_b_1 .read-tick');
        await expect(tick).toBeVisible();
        const progress = page.locator('#read-progress');
        const before = await progress.textContent();

        await tick.click();

        // .read-tick's own base class already contains the substring
        // "read" — toHaveClass(/read/) would pass here regardless of
        // whether the tick were ever actually marked read, so this needs
        // an exact class-token check instead (see test-utils.js).
        expect(await hasClass(tick, 'read')).toBe(true);
        await expect(progress).not.toHaveText(before);
    });

    // Regression coverage for the read-state-shared-across-views design in
    // AI.md: marking a block read in book view must still show as read if
    // the user switches to continuous view (same localStorage key).
    test('a block marked read in book view also shows read in continuous view', async ({ page }) => {
        await openBookView(page);
        await page.locator('#settings-btn').click();
        await page.locator('#toggle-read-tracking').check();
        await page.locator('#book-q_001_b_1 .read-tick').click();

        await page.locator('.view-toggle-btn[data-view="continuous"]').click();
        await expect(page.locator('#continuous-container')).toHaveCSS('display', 'flex');

        await expect(page.locator('#q_001_b_1')).toHaveClass(/read/);
    });
});

test.describe('Book View — navigation, using the live site data', () => {
    // These need a real, multi-page book to exercise Prev/Next/Jump
    // meaningfully, so — unlike the suite above — this one does NOT
    // override data.json with the small test fixture.
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('.view-toggle-btn[data-view="book"]')).toBeVisible();
        await openBookView(page);
    });

    // The live book opens on its (unnumbered) cover spread by default —
    // like a real book's title page — not page 1. Prev is disabled there
    // same as it always was at the very first spread; it's just that the
    // very first spread is the cover now, not page 1.
    test('starts on the cover (unnumbered), with Prev disabled', async ({ page }) => {
        await expect(page.locator('#book-container')).toHaveClass(/active/);
        await expect(page.locator('#book-spread')).toHaveClass(/cover-spread/);
        await expect(page.locator('#book-page-num-left')).toHaveText('');
        await expect(page.locator('#book-prev')).toBeDisabled();
    });

    test('Next reveals page 1; Prev returns to the cover', async ({ page }) => {
        const nextBtn = page.locator('#book-next');
        test.skip(await nextBtn.isDisabled(), 'content fits on the cover spread alone — nothing to page through');

        await nextBtn.click();
        await expect(page.locator('#book-page-num-left')).toHaveText('1');
        await expect(page.locator('#book-prev')).toBeEnabled();

        await page.locator('#book-prev').click();
        await expect(page.locator('#book-page-num-left')).toHaveText('');
        await expect(page.locator('#book-prev')).toBeDisabled();
    });

    test('the right/left arrow keys page forward and back, like Prev/Next', async ({ page }) => {
        const nextBtn = page.locator('#book-next');
        test.skip(await nextBtn.isDisabled(), 'content fits on the cover spread alone — nothing to page through');

        await page.locator('#book-container').click();
        await page.keyboard.press('ArrowRight');
        await expect(page.locator('#book-page-num-left')).toHaveText('1');

        await page.keyboard.press('ArrowLeft');
        await expect(page.locator('#book-page-num-left')).toHaveText('');
    });

    test('jump-to-page moves straight to the requested spread', async ({ page }) => {
        const spreadInfo = await page.locator('#book-spread-info').textContent(); // "(of N)" — numbered pages only, cover excluded
        const totalPages = parseInt(spreadInfo.replace(/\D/g, ''), 10);
        test.skip(!totalPages || totalPages < 4, 'not enough numbered pages in the live book to jump to page 4');

        await page.locator('#book-jump-input').fill('4');
        await page.locator('#book-jump-go').click();

        await expect(page.locator('#book-page-num-left')).toHaveText('3');
        await expect(page.locator('#book-page-num-right')).toHaveText('4');
    });

    test('typing 0 into jump-to-page returns to the unnumbered cover', async ({ page }) => {
        await page.locator('#book-jump-input').fill('1');
        await page.locator('#book-jump-go').click();
        await expect(page.locator('#book-page-num-left')).toHaveText('1');

        await page.locator('#book-jump-input').fill('0');
        await page.locator('#book-jump-go').click();
        await expect(page.locator('#book-page-num-left')).toHaveText('');
        await expect(page.locator('#book-spread')).toHaveClass(/cover-spread/);
    });

    test('the current page persists across a reload', async ({ page }) => {
        const nextBtn = page.locator('#book-next');
        test.skip(await nextBtn.isDisabled(), 'content fits on the cover spread alone — nothing to page through');

        await nextBtn.click();
        await expect(page.locator('#book-page-num-left')).toHaveText('1');

        await page.reload();
        await expect(page.locator('#book-container')).toHaveClass(/active/);
        await expect(page.locator('#book-page-num-left')).toHaveText('1');
    });
});
