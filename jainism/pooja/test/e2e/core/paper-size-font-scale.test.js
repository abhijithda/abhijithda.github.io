const { test, expect } = require('@playwright/test');
const path = require('path');

// Covers the two related Settings additions:
//   1. Paper size (Dynamic / A4 / A3) — continuous view gets a live width
//      cap previewing print width only (no real pagination); book view gets
//      real physical pagination (page dimensions and count actually
//      change); Dynamic stays fully responsive on screen in both views but
//      always prints as A4.
//   2. Font-size scaling — a multiplier (via --font-scale) shared
//      identically between screen and print, and shared across both views.
// Both persist through the same unified `settings` object/localStorage key
// as every other setting (see header/header.test.js for the unit-level
// coverage of header.js's loadSettings/saveSettings/applyPaperSize/
// applyFontScale logic — this file only asserts what actually renders).

async function openSettings(page) {
    await page.locator('#settings-btn').click();
    await expect(page.locator('#paper-size-select')).toBeVisible();
}

test.describe('Paper size setting', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({ path: path.join(__dirname, '..', '..', 'data.json') });
        });
        await page.goto('/');
        await expect(page.locator('#book-columns .book-card').first()).toBeVisible();
    });

    test('defaults to Dynamic, and the continuous view has no width cap on screen', async ({ page }) => {
        await openSettings(page);
        await expect(page.locator('#paper-size-select')).toHaveValue('dynamic');
        expect(await page.locator('body').getAttribute('data-paper-size')).toBe('dynamic');

        await page.locator('.view-toggle-btn[data-view="continuous"]').click();
        await expect(page.locator('.card').first()).toBeVisible();
        const maxWidth = await page.locator('#continuous-container').evaluate(el => getComputedStyle(el).maxWidth);
        expect(maxWidth).toBe('1000px'); // the existing, unchanged default cap
    });

    test('choosing A4 caps the continuous view to A4 width, and A3 to A3 width', async ({ page }) => {
        await page.locator('.view-toggle-btn[data-view="continuous"]').click();
        await expect(page.locator('.card').first()).toBeVisible();

        await openSettings(page);
        await page.locator('#paper-size-select').selectOption('a4');
        await expect(page.locator('body')).toHaveAttribute('data-paper-size', 'a4');
        // A4/A3 use a genuine fixed `width` (not `max-width: none` here —
        // see book-view.css/continuous-view.css's comments on why a
        // max-width-based cap let the page shrink to fit the viewport/zoom
        // level), so check `width`, not `maxWidth`.
        const a4Width = await page.locator('#continuous-container').evaluate(el => getComputedStyle(el).width);
        // 210mm at 96dpi ≈ 793.7px — assert it's the physically-capped
        // value, not the old 1000px default, without pinning an exact px
        // rounding that could vary by rendering engine.
        expect(parseFloat(a4Width)).toBeLessThan(900);

        await page.locator('#paper-size-select').selectOption('a3');
        await expect(page.locator('body')).toHaveAttribute('data-paper-size', 'a3');
        const a3Width = await page.locator('#continuous-container').evaluate(el => getComputedStyle(el).width);
        expect(parseFloat(a3Width)).toBeGreaterThan(parseFloat(a4Width));
    });

    test('the paper-size preview cap in continuous view does not paginate — no page breaks or numbers appear on screen', async ({ page }) => {
        await page.locator('.view-toggle-btn[data-view="continuous"]').click();
        await expect(page.locator('.card').first()).toBeVisible();

        await openSettings(page);
        await page.locator('#paper-size-select').selectOption('a4');

        // Still a single flowing scrollable column — book view's pagination
        // controls (rendered once at boot, since book is the default view)
        // stay hidden behind the continuous view, not shown alongside it.
        await expect(page.locator('#book-page-num-left')).toBeHidden();
        await expect(page.locator('.book-nav')).toBeHidden();
    });

    test('switching to A3 changes the book view spread width, and can change the total page count', async ({ page }) => {
        await expect(page.locator('#book-spread-info')).toHaveText(/\(of \d+\)/);
        // A4/A3 use a genuine fixed `width` (max-width: none) — see
        // book-view.css's comment on why a max-width-based cap let the
        // page shrink to fit the viewport/zoom level — so check `width`,
        // not `maxWidth` (Dynamic, the state before this switch, still
        // uses max-width:960px + width:100%, so `width` correctly reports
        // its actual rendered pixel width here too).
        const beforeWidth = await page.locator('.book-shell').evaluate(el => getComputedStyle(el).width);

        await openSettings(page);
        await page.locator('#paper-size-select').selectOption('a3');
        await page.waitForTimeout(200); // allow the resize listener's renderCurrentSpread() to settle

        // Page count is content-dependent (may or may not change with this
        // fixture), but the shell must actually have grown physically —
        // that's the real pagination mechanism (see book-view.css).
        const afterWidth = await page.locator('.book-shell').evaluate(el => getComputedStyle(el).width);
        expect(parseFloat(afterWidth)).toBeGreaterThan(parseFloat(beforeWidth));
    });

    test('the physical page is reachable by scrolling both left and right, not clipped on one side', async ({ page }) => {
        // Regression test: centering an overflowing child with the parent's
        // align-items/justify-content (box alignment) rather than the
        // child's own margin: auto is a well-known browser quirk — only the
        // *end*-side overflow becomes scrollable, the *start* side is
        // clipped and unreachable. See book-view.css's #book-container /
        // .book-shell comments.
        await openSettings(page);
        await page.locator('#paper-size-select').selectOption('a3');
        await page.waitForTimeout(200);

        const bookContainer = page.locator('#book-container');
        const scrollInfo = await bookContainer.evaluate(el => ({
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
        }));
        // Only meaningful if A3 actually overflows this viewport — skip the
        // assertion body (not the test) if the test runs in a very wide
        // viewport where there's nothing to scroll.
        test.skip(scrollInfo.scrollWidth <= scrollInfo.clientWidth, 'viewport wide enough that A3 does not overflow here');

        // Scroll to the very start, then measure the shell's left edge
        // relative to the container's visible left edge.
        await bookContainer.evaluate(el => { el.scrollLeft = 0; });
        const leftGapAtStart = await page.evaluate(() => {
            const container = document.getElementById('book-container');
            const shell = document.querySelector('.book-shell');
            return shell.getBoundingClientRect().left - container.getBoundingClientRect().left;
        });
        // If the start-side overflow were clipped (the bug), scrollLeft=0
        // would already show the shell's left edge flush or past the
        // container's left edge (gap <= 0), because the browser considers
        // "0" scrolled-as-far-left-as-it-goes even though content extends
        // further left than that. With the margin:auto fix, scrolling to
        // 0 should still leave a visible gap (or exactly reach the true
        // left edge) — not silently start already past it.
        expect(leftGapAtStart).toBeGreaterThanOrEqual(0);
    });

    test('Dynamic always prints as A4 regardless of screen state; only A3 changes the printed sheet', async ({ page }) => {
        await openSettings(page);

        // Dynamic (default)
        let pageCss = await page.locator('#print-page-size').textContent();
        expect(pageCss).toContain('A4');

        // Explicit A4 — identical printed result to Dynamic
        await page.locator('#paper-size-select').selectOption('a4');
        pageCss = await page.locator('#print-page-size').textContent();
        expect(pageCss).toContain('A4');
        expect(pageCss).not.toContain('A3');

        // A3 — the one choice that actually changes the printed sheet
        await page.locator('#paper-size-select').selectOption('a3');
        pageCss = await page.locator('#print-page-size').textContent();
        expect(pageCss).toContain('A3');
    });

    test('print orientation follows the active view (landscape for book, portrait for continuous)', async ({ page }) => {
        // Book view is the default on load.
        let pageCss = await page.locator('#print-page-size').textContent();
        expect(pageCss).toContain('landscape');

        await page.locator('.view-toggle-btn[data-view="continuous"]').click();
        await expect(page.locator('.card').first()).toBeVisible();
        pageCss = await page.locator('#print-page-size').textContent();
        expect(pageCss).toContain('portrait');
    });

    test('the choice persists across a reload, via the same unified settings key', async ({ page }) => {
        await openSettings(page);
        await page.locator('#paper-size-select').selectOption('a3');

        await page.reload();
        await expect(page.locator('#book-columns .book-card').first()).toBeVisible();
        await expect(page.locator('body')).toHaveAttribute('data-paper-size', 'a3');
        await openSettings(page);
        await expect(page.locator('#paper-size-select')).toHaveValue('a3');
    });
});

test.describe('Font-size scaling setting', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({ path: path.join(__dirname, '..', '..', 'data.json') });
        });
        await page.goto('/');
        await expect(page.locator('#book-columns .book-card').first()).toBeVisible();
    });

    test('defaults to 100%, --font-scale: 1', async ({ page }) => {
        await openSettings(page);
        await expect(page.locator('#font-scale-display')).toHaveText('100%');
        const scale = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim());
        expect(scale).toBe('1');
    });

    test('increase/decrease buttons update the display and the shared --font-scale property', async ({ page }) => {
        await openSettings(page);
        await page.locator('#font-scale-increase').click();
        await expect(page.locator('#font-scale-display')).toHaveText('110%');

        let scale = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim());
        expect(scale).toBe('1.1');

        await page.locator('#font-scale-decrease').click();
        await page.locator('#font-scale-decrease').click();
        await expect(page.locator('#font-scale-display')).toHaveText('90%');
        scale = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim());
        expect(scale).toBe('0.9');
    });

    test('increasing font size actually grows rendered book-view text (multiplier, not just a stored number)', async ({ page }) => {
        const line = page.locator('#book-columns .book-lang-line.lang-kn').first();
        const before = await line.evaluate(el => parseFloat(getComputedStyle(el).fontSize));

        await openSettings(page);
        for (let i = 0; i < 3; i++) await page.locator('#font-scale-increase').click();

        const after = await line.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
        expect(after).toBeGreaterThan(before);
        expect(after / before).toBeCloseTo(1.3, 1);
    });

    test('increasing font size also grows rendered continuous-view text, sharing the same setting across views', async ({ page }) => {
        await openSettings(page);
        await page.locator('#font-scale-increase').click();
        await page.locator('#font-scale-increase').click();

        await page.locator('.view-toggle-btn[data-view="continuous"]').click();
        await expect(page.locator('.card').first()).toBeVisible();
        const scale = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim());
        expect(scale).toBe('1.2');
    });

    test('font scale composes with paper-size capping: bigger text within a fixed physical width can push the book past a single spread', async ({ page }) => {
        await openSettings(page);
        await page.locator('#paper-size-select').selectOption('a4');
        await page.waitForTimeout(200);
        const before = await page.locator('#book-spread-info').textContent();

        for (let i = 0; i < 6; i++) await page.locator('#font-scale-increase').click();
        await page.waitForTimeout(200);
        const after = await page.locator('#book-spread-info').textContent();

        const toCount = (s) => parseInt(s.replace(/\D/g, ''), 10);
        // Larger text in the same physical width can only need the same
        // number of pages or more — never fewer.
        expect(toCount(after)).toBeGreaterThanOrEqual(toCount(before));
    });

    test('the choice persists across a reload, via the same unified settings key', async ({ page }) => {
        await openSettings(page);
        await page.locator('#font-scale-increase').click();
        await page.locator('#font-scale-increase').click();

        await page.reload();
        await expect(page.locator('#book-columns .book-card').first()).toBeVisible();
        await openSettings(page);
        await expect(page.locator('#font-scale-display')).toHaveText('120%');
    });
});
