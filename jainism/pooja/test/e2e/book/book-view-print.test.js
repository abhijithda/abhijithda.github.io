const { test, expect } = require('@playwright/test');
const path = require('path');
const { hasClass } = require('../test-utils');

// Re-enabled from book-view-print.test.js.comment. What changed and why:
//
// The original file's Video/QR/None/Both "state" tests and the read-tracking
// test each ended in a full-page `toHaveScreenshot()` call, which had two
// real problems: no baseline PNGs existed anywhere in the repo for these
// names (first run would just fail outright, not show a real diff), and a
// full-page print screenshot is a blunt instrument for "is the QR code
// visible" specifically — any unrelated visual change anywhere on the page
// would fail these for a reason that has nothing to do with what they're
// named after.
//
// First pass replaced the screenshots entirely with the same computed-style/
// visibility assertions media-visibility.test.js uses for the on-screen
// case — precise, deterministic, no baseline to keep in sync — but that
// traded away something real: a human reviewing a PR that changes this
// behavior gets a pass/fail, not a picture to actually look at. Restored
// the screenshot alongside the precise assertions (not instead of them) in
// each test below, so both properties hold: the assertion catches a logic
// regression even if it happens to look pixel-identical, and the
// screenshot catches a visual regression a developer might approve without
// reading closely, with an actual image diff to review in the PR.

async function openBookView(page) {
    await page.locator('.view-toggle-btn[data-view="book"]').click();
    await expect(page.locator('#book-container')).toHaveClass(/active/);
    await expect(page.locator('#book-columns .book-card').first()).toBeVisible();
}

test.describe('Book View - Print Mode', () => {

    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({
                path: path.join(__dirname, '..', '..', 'data.json')
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
        // Alongside the precise checks above (which catch logic
        // regressions), a full-page screenshot too — so a visual
        // regression here still shows up as a reviewable image diff in a
        // PR, not just a passing/failing assertion with no picture to look
        // at. See the describe block below's header comment for why this
        // was reintroduced.
        await expect(page).toHaveScreenshot('book-print-default-state.png', { fullPage: true, timeout: 15000 });
    });

    test('Both state (Videos ON, QR ON): both the thumbnail and the QR print', async ({ page }) => {
        await page.locator('#toggle-qrs').check();

        const row = page.locator('.book-vid-row').first();
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        await expect(row.locator('.book-vid-thumb')).toBeVisible();
        await expect(row.locator('.book-vid-qr')).toBeVisible();
        await expect(page).toHaveScreenshot('book-print-both-state.png', { fullPage: true, timeout: 15000 });
    });

    test('QR-only state (Videos OFF, QR ON): the QR prints, the video thumbnail does not', async ({ page }) => {
        await page.locator('#toggle-qrs').check();
        await page.locator('#toggle-videos').uncheck();

        const row = page.locator('.book-vid-row').first();
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        await expect(row.locator('.book-vid-thumb')).toBeHidden();
        await expect(row.locator('.book-vid-qr')).toBeVisible();
        await expect(page).toHaveScreenshot('book-print-qr-only-state.png', { fullPage: true, timeout: 15000 });
    });

    test('None state (Videos OFF, QR OFF): neither prints', async ({ page }) => {
        await page.locator('#toggle-videos').uncheck();

        const row = page.locator('.book-vid-row').first();
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        await expect(row.locator('.book-vid-thumb')).toBeHidden();
        await expect(row.locator('.book-vid-qr')).toBeHidden();
        await expect(page).toHaveScreenshot('book-print-none-state.png', { fullPage: true, timeout: 15000 });
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
        // .read-tick's own base class already contains the substring
        // "read" — toHaveClass(/read/) would pass here regardless of
        // whether the tick were ever actually marked read, so this needs
        // an exact class-token check instead (see test-utils.js).
        expect(await hasClass(tick, 'read')).toBe(true);

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
        await expect(page).toHaveScreenshot('book-print-read-tracking-state.png', { fullPage: true, timeout: 15000 });
    });
});

// Full-page print screenshots per paper size. Added after a real bug
// (an active A3/A4 screen setting leaking its physical width into print —
// see book-print-regressions.test.js and AI.md's Print section) shipped
// undetected specifically because no test ever visually compared print
// output *with a non-default paper size selected* — the computed-style
// checks above (and in paper-size-font-scale.test.js) covered the numbers
// in isolation, but nothing looked at the actual rendered page. These
// close that gap. A4/A3 specifically use the QR-codes-on and
// Read-tracking-on state (with one tick marked read), alongside Videos
// (already on by default) — the fullest state a physical A4/A3 printout
// can actually make use of: a paper printout can't play a video, but a QR
// code gets the reader to it, and read progress is meant to carry over
// onto the printout too (see AI.md's Read Tracking section). If baselines
// for these don't exist yet, generate them via `npm run test:update-snapshots`
// or the project's update-snapshots.yml CI workflow before these can pass.
test.describe('Book View - Print Mode - Paper size screenshots', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({
                path: path.join(__dirname, '..', '..', 'data.json')
            });
        });

        await page.goto('/');
        await expect(page.locator('#book-columns .book-card').first()).toBeVisible();
        await openBookView(page);

        await page.locator('#settings-btn').click();
        await expect(page.locator('#paper-size-select')).toBeVisible();
    });

    test('Print screenshot: Dynamic (default) paper size', async ({ page }) => {
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(300);
        await expect(page).toHaveScreenshot('book-print-paper-size-dynamic.png', { fullPage: true, timeout: 15000 });
    });

    test('Print screenshot: A4 paper size', async ({ page }) => {
        // QR codes and Read tracking on, alongside Videos (already on by
        // default) — the fullest useful state for an actual physical
        // printout: a paper printout can't play a video, but a QR code is
        // exactly the thing that's actually useful once it's on paper (the
        // reader scans it to reach the video), and read progress is meant
        // to carry over onto the printout too (see AI.md's Read Tracking
        // section). Marks one tick read so the screenshot actually shows
        // the filled-in state, not just empty circles. Keeps the same
        // baseline filename as before so this shows as a real diff in a
        // PR rather than an unrelated add/delete.
        await page.locator('#toggle-qrs').check();
        await page.locator('#toggle-read-tracking').check();
        await page.locator('#book-q_001_b_1 .read-tick').click();
        await page.locator('#paper-size-select').selectOption('a4');
        await page.waitForTimeout(200);

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(300);
        await expect(page).toHaveScreenshot('book-print-paper-size-a4.png', { fullPage: true, timeout: 15000 });
    });

    test('Print screenshot: A3 paper size', async ({ page }) => {
        // Same reasoning as the A4 case above.
        await page.locator('#toggle-qrs').check();
        await page.locator('#toggle-read-tracking').check();
        await page.locator('#book-q_001_b_1 .read-tick').click();
        await page.locator('#paper-size-select').selectOption('a3');
        await page.waitForTimeout(200);

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(300);
        await expect(page).toHaveScreenshot('book-print-paper-size-a3.png', { fullPage: true, timeout: 15000 });
    });
});
