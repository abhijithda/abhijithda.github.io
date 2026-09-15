const { test, expect } = require('@playwright/test');
const path = require('path');

// Regression coverage for two print-specific side effects of earlier,
// screen-focused changes:
//  1. overflow-x: auto (added to #book-container for the on-screen A4/A3
//     horizontal-scroll fix) clips a printed page to whatever was
//     scrolled into view on screen, since browsers don't "unroll" a
//     scrollable region for print.
//  2. Moving mantra/note/shloka's colour from border-left-color to
//     box-shadow (see core/card-types.css) put it under "background
//     graphics", which several browsers suppress in print by default.

test.describe('Book print — regressions', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({ path: path.join(__dirname, '..', '..', 'data.json') });
        });
        await page.goto('/');
        await expect(page.locator('#book-columns .book-card').first()).toBeVisible();
    });

    test('#book-container is not a clipped scroll region under print, even in A3', async ({ page }) => {
        await page.locator('#settings-btn').click();
        await page.locator('#paper-size-select').selectOption('a3');
        await page.waitForTimeout(200);

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        const overflow = await page.locator('#book-container').evaluate(el => getComputedStyle(el).overflow);
        expect(overflow).toBe('visible');
    });

    test('an active A3/A4 screen setting does not leak its physical width into print', async ({ page }) => {
        // Regression test: body[data-paper-size="a3"] .book-shell's
        // width:420mm/594mm lives outside any @media query (so it also
        // matches during print) and has higher specificity than a plain
        // `.book-shell` selector — without !important on the print
        // block's reset, that higher-specificity screen-preview width
        // would win even under print, shrinking everything to fit a
        // physical size meant for the screen, not the actual printed
        // page. See book-view.css's comment on this exact rule.
        const container = page.locator('#book-container');
        const viewportWidthBefore = await container.evaluate(el => el.clientWidth);

        await page.locator('#settings-btn').click();
        await page.locator('#paper-size-select').selectOption('a3');
        await page.waitForTimeout(200);

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        const shellWidth = await page.locator('.book-shell').evaluate(el => getComputedStyle(el).width);
        // 594mm ≈ 2245px — if the bug regresses, this would report
        // something close to that instead of the viewport's own width.
        expect(parseFloat(shellWidth)).toBeLessThan(viewportWidthBefore + 50);
    });

    test('a standalone image is not capped to the same flat height as a small inline image', async ({ page }) => {
        // Regression test: print's ".book-image { max-height: 140mm !important }"
        // "safe fallback for inline images" is a bare selector with
        // !important, which -- since !important always wins over a
        // non-!important rule regardless of specificity -- silently
        // overrode the standalone-specific 75cqh sizing (itself invalid
        // in print anyway, since cqh needs the containment print disables
        // -- see book-view.css's comment on this rule) too, capping every
        // image on the page to the same flat height whether standalone or
        // not. A standalone image should be allowed to use most of the
        // page instead -- but not so much that it (plus its caption and
        // card padding) exceeds A4 landscape's real usable height, which
        // silently clips the caption instead (see the next test, and
        // book-view.css's comment on this exact value).
        const standaloneImage = page.locator('.book-columns .standalone-image .book-image').first();
        await expect(standaloneImage).toBeVisible();

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        const maxHeight = await standaloneImage.evaluate(el => getComputedStyle(el).maxHeight);
        // 140mm ~= 529px is the old, wrong, flat inline-image cap; 150mm ~=
        // 567px is the fix -- comfortably more than 140mm, but (unlike an
        // earlier, too-generous 220mm attempt) still safely under A4
        // landscape's real usable height once the caption is added.
        expect(parseFloat(maxHeight)).toBeGreaterThan(540);
    });

    test('a standalone image with a caption does not lose the caption to page-height overflow', async ({ page }) => {
        // Regression test: a `break-inside: avoid` card taller than a full
        // physical page can't actually be kept unbroken -- there's no page
        // left to avoid breaking onto -- and what browsers do with that
        // impossible request is silently clip whatever comes after the
        // point where the page ends. That's exactly what an earlier,
        // too-generous standalone-image height cap (220mm, exceeding A4
        // landscape's real 180mm usable height once the caption and card
        // padding are added) caused: the caption, being last in the card,
        // disappeared specifically in print despite rendering fine on
        // screen. This looks for any standalone image that actually has a
        // caption and asserts it stays visible under print.
        const captions = page.locator('.book-columns .standalone-image .book-image-caption');
        const count = await captions.count();
        test.skip(count === 0, 'fixture has no standalone image with a caption to check');

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        for (let i = 0; i < count; i++) {
            await expect(captions.nth(i)).toBeVisible();
        }
    });

    test('print forces color-adjust, so mantra/note/shloka colors cannot silently disappear', async ({ page }) => {
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        const adjust = await page.evaluate(() => {
            const cs = getComputedStyle(document.body);
            return cs.printColorAdjust || cs.webkitPrintColorAdjust;
        });
        expect(adjust).toBe('exact');
    });
});
