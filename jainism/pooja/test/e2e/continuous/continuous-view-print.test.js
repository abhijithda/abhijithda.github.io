const { test, expect } = require('@playwright/test');
const {
    VIEWS, openViewWithSettings, defineMediaStatePrintTests, definePaperSizePrintTests,
} = require('../media-states');

// Re-enabled from continuous-view-print.test.js.comment — see the header
// comment in book-view-print.test.js for the full history. Screenshots
// were restored alongside the precise visibility checks below (not instead
// of them), so a PR changing this behavior gets both a pass/fail and an
// actual image to review.

test.describe('Continuous View - Print Mode', () => {

    test.beforeEach(async ({ page }) => {
        await openViewWithSettings(page, VIEWS.continuous);
    });

    test('print keeps the page itself plain white (block colours stay, the app\'s grey page background does not)', async ({ page }) => {
        await page.emulateMedia({ media: 'print' });
        const bg = await page.evaluate(() => ({
            body: getComputedStyle(document.body).backgroundColor,
            html: getComputedStyle(document.documentElement).backgroundColor,
        }));
        expect(bg.body).toBe('rgb(255, 255, 255)');
        expect(bg.html).toBe('rgb(255, 255, 255)');
    });

    test('item cards print white with only their coloured left bar, matching book view', async ({ page }) => {
        const colourOf = sel => page.locator(sel).first()
            .evaluate(el => getComputedStyle(el).backgroundColor);

        // On screen the cards keep their tint...
        expect(await colourOf('.card.answer')).not.toBe('rgb(255, 255, 255)');
        // ...in print they are white.
        await page.emulateMedia({ media: 'print' });
        expect(await colourOf('.card.question')).toBe('rgb(255, 255, 255)');
        expect(await colourOf('.card.answer')).toBe('rgb(255, 255, 255)');
    });

    test('a Ref strip is held together with its card, and the card bar is drawn per row across the spacing', async ({ page }) => {
        await page.emulateMedia({ media: 'print' });
        const info = await page.evaluate(() => {
            const card = [...document.querySelectorAll('.card.answer')]
                .find(c => c.querySelector('.reply-excerpt'));
            const strip = card.querySelector('.reply-excerpt');
            const next = strip.nextElementSibling;
            return {
                stripBreakInside: getComputedStyle(strip).breakInside,
                stripBreakAfter: getComputedStyle(strip).breakAfter,
                nextBreakBefore: getComputedStyle(next).breakBefore,
                cardBorderLeft: getComputedStyle(card).borderLeftColor,
                rowBg: getComputedStyle(next).backgroundImage,
                rowBgClip: getComputedStyle(next).backgroundClip,
            };
        });
        expect(info.stripBreakInside).toBe('avoid');
        expect(info.stripBreakAfter).toBe('avoid');
        expect(info.nextBreakBefore).toBe('avoid');
        // The card itself draws no coloured bar (it would stretch to the page bottom)...
        expect(info.cardBorderLeft).toBe('rgba(0, 0, 0, 0)');
        // ...each row paints it as a border-box background layer instead.
        expect(info.rowBg).toContain('linear-gradient');
        expect(info.rowBgClip).toContain('border-box');
    });

    test('answer cards may split across pages, while question cards, inserts and image blocks stay whole', async ({ page }) => {
        await page.emulateMedia({ media: 'print' });
        const breakInside = async selector => page.locator(selector).first()
            .evaluate(el => getComputedStyle(el).breakInside);

        expect(await breakInside('.card.answer')).toBe('auto');
        expect(await breakInside('.card.question')).toBe('avoid');
        expect(await breakInside('.card.insert')).toBe('avoid');
        expect(await breakInside('.block-row.media-only')).toBe('avoid');
    });

    test('a printed image card is not height-capped, so its captions stay inside it', async ({ page }) => {
        await page.emulateMedia({ media: 'print' });
        const card = page.locator('.block-row.media-only .image-card').first();
        await expect(card).toBeAttached();
        const caps = await card.evaluate(c => ({
            card: getComputedStyle(c).maxHeight,
            img: getComputedStyle(c.querySelector('img')).maxHeight,
        }));
        expect(caps.card).toBe('none');
        expect(caps.img).not.toBe('none');
    });

    // The four video/QR state tests are shared with book view: ../media-states.js
    defineMediaStatePrintTests(VIEWS.continuous);
});

// Full-page print screenshots per paper size — see the equivalent describe
// block in book-view-print.test.js for why these were added (a real bug
// where an active screen paper-size setting leaked into print shipped
// undetected because nothing ever visually checked print output with a
// non-default paper size). Continuous view's print pagination is native
// browser page-splitting (no JS pagination to regress the way book view's
// can), so this is lower-risk than the book-view equivalent, but it closes
// the same coverage gap and costs little to keep in sync. A4/A3 use the
// QR-codes-on and Read-tracking-on state (with one tick marked read),
// alongside Videos (already on by default) — same reasoning as book
// view's equivalent test. If baselines for these don't exist yet,
// generate them via `npm run test:update-snapshots` or the project's
// update-snapshots.yml CI workflow.
test.describe('Continuous View - Print Mode - Paper size screenshots', () => {
    test.beforeEach(async ({ page }) => {
        await openViewWithSettings(page, VIEWS.continuous, '#paper-size-select');
    });

    test('every insert item (cover, standalone photo, ...) prints on its own page', async ({ page }) => {
        await page.emulateMedia({ media: 'print' });
        const breaks = await page.locator('.card.insert').evaluateAll(cards =>
            cards.map(c => {
                const s = getComputedStyle(c);
                return {
                    isFirstCard: !c.previousElementSibling,
                    before: s.breakBefore,
                    after: s.breakAfter,
                };
            }));
        expect(breaks.length).toBeGreaterThan(0);
        for (const b of breaks) {
            expect(b.after).toBe('page');
            // A forced break before the document's very first card would
            // print a blank first page, so only later inserts break before.
            expect(b.before).toBe(b.isFirstCard ? 'auto' : 'page');
        }
    });

    definePaperSizePrintTests(VIEWS.continuous);
});
