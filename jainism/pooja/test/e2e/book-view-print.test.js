const { test, expect } = require('@playwright/test');
const path = require('path');

// Re-enabled from book-view-print.test.js.comment. What changed and why:
//
// The original file's Video/QR/None/Both "state" tests and the read-tracking
// test each ended in a full-page `toHaveScreenshot()` call. Two problems
// with that, neither fixable by editing the assertions themselves:
//   1. No baseline PNGs exist for these names anywhere in the repo — first
//      run would fail outright with "no expected screenshot found", not a
//      real diff. Per AI.md, baselines are meant to come from the
//      dedicated update-snapshots.yml CI workflow, not be hand-generated
//      here.
//   2. A full-page print screenshot is an extremely blunt instrument for
//      "is the QR code visible" — any unrelated visual change anywhere on
//      the page (font rendering, an unrelated color, a spacing tweak)
//      would fail these tests for a reason that has nothing to do with
//      what they're named after, exactly the kind of stale-baseline noise
//      seen in book-view-screenshots.test.js/continuous-view-screenshots.test.js.
//
// Replaced with the same computed-style/visibility assertions
// media-visibility.test.js already uses for the on-screen case — just
// under `page.emulateMedia({ media: 'print' })` — which test the actual
// thing each case is named after, directly and deterministically, with no
// baseline to keep in sync.

async function openBookView(page) {
    await page.locator('.view-toggle-btn[data-view="book"]').click();
    await expect(page.locator('#book-container')).toHaveClass(/active/);
    await expect(page.locator('#book-columns .book-card').first()).toBeVisible();
}

test.describe('Book View - Print Mode', () => {

    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({
                path: path.join(__dirname, '..', 'data.json')
            });
        });

        await page.goto('/');
        // Book view is the default on a fresh load — wait for its content
        // (rather than continuous view's, which is rendered but hidden)
        // as the "data has loaded" signal.
        await expect(page.locator('#book-columns .book-card').first()).toBeVisible();

        await openBookView(page);

        await page.locator('#settings-btn').click();
        await expect(page.locator('#toggle-videos')).toBeVisible();
    });

    // Per REQUIREMENTS.md: "Print view should print the entire book, not
    // just the current page." Book view achieves this purely via the
    // @media print rules in book-view.css (column-count, transform: none,
    // height: auto — see the print block at the bottom of the file), not
    // via the renderPrintBook()/#book-print-container pipeline described
    // in earlier design notes, which was never built. This asserts the
    // actual (CSS-reflow) mechanism: every card in the book, not just the
    // on-screen spread, is present and visible under print.
    test('entire book renders as one flowing column, not just the current spread', async ({ page }) => {
        const allCardIds = await page.locator('#book-columns .book-card').evaluateAll(
            cards => cards.map(c => c.id)
        );
        expect(allCardIds.length).toBeGreaterThan(1);

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        // Every card that exists in the book — not only the first
        // spread's worth — must be visible once print CSS applies.
        for (const id of allCardIds) {
            await expect(page.locator(`#${id}`)).toBeVisible();
        }

        // The interactive spread nav must not appear on paper.
        await expect(page.locator('.book-nav')).toBeHidden();
    });

    test('Default state (Videos ON, QR OFF): the video thumbnail prints, the QR does not', async ({ page }) => {
        const row = page.locator('.book-vid-row').first();
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        await expect(row.locator('.book-vid-thumb')).toBeVisible();
        await expect(row.locator('.book-vid-qr')).toBeHidden();
    });

    test('Both state (Videos ON, QR ON): both the thumbnail and the QR print', async ({ page }) => {
        await page.locator('#toggle-qrs').check();

        const row = page.locator('.book-vid-row').first();
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        await expect(row.locator('.book-vid-thumb')).toBeVisible();
        await expect(row.locator('.book-vid-qr')).toBeVisible();
    });

    test('QR-only state (Videos OFF, QR ON): the QR prints, the video thumbnail does not', async ({ page }) => {
        await page.locator('#toggle-qrs').check();
        await page.locator('#toggle-videos').uncheck();

        const row = page.locator('.book-vid-row').first();
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        await expect(row.locator('.book-vid-thumb')).toBeHidden();
        await expect(row.locator('.book-vid-qr')).toBeVisible();
    });

    test('None state (Videos OFF, QR OFF): neither prints', async ({ page }) => {
        await page.locator('#toggle-videos').uncheck();

        const row = page.locator('.book-vid-row').first();
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        await expect(row.locator('.book-vid-thumb')).toBeHidden();
        await expect(row.locator('.book-vid-qr')).toBeHidden();
    });

    // Read progress should carry from screen to printout, per
    // REQUIREMENTS.md. read-tracking.test.js already covers this for
    // continuous view; book view has its own DOM structure (and its own
    // standalone-image override in book-view.css) so it's worth its own
    // check rather than assuming the shared core/read-tracking.css rules
    // apply identically.
    test('read ticks stay visible on paper, reflecting digital read progress', async ({ page }) => {
        await page.locator('#toggle-read-tracking').check();
        const tick = page.locator('#book-q_001_b_1 .read-tick');
        await tick.click();
        await expect(tick).toHaveClass(/read/);

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        const appearance = await tick.evaluate(el => {
            const cs = getComputedStyle(el);
            return { display: cs.display, backgroundColor: cs.backgroundColor };
        });
        expect(appearance.display).not.toBe('none');
        // Print CSS carries over the green fill (#4caf50 -> rgb(76,175,80))
        // instead of clearing it, so read progress is visible on paper.
        expect(appearance.backgroundColor).toBe('rgb(76, 175, 80)');
    });
});
