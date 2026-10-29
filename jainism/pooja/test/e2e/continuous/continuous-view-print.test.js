const { test, expect } = require('@playwright/test');
const path = require('path');

// Re-enabled from continuous-view-print.test.js.comment — see the header
// comment in book-view-print.test.js for the full history. Screenshots
// were restored alongside the precise visibility checks below (not instead
// of them), so a PR changing this behavior gets both a pass/fail and an
// actual image to review.

test.describe('Continuous View - Print Mode', () => {

    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({
                path: path.join(__dirname, '..', '..', 'data.json')
            });
        });

        await page.goto('/');
        // Book view is the default on a fresh load — switch to continuous
        // view explicitly before waiting on .card, since these tests are
        // continuous-view-specific.
        await page.locator('.view-toggle-btn[data-view="continuous"]').click();
        await expect(page.locator('.card').first()).toBeVisible();

        await page.locator('#settings-btn').click();
        await expect(page.locator('#toggle-videos')).toBeVisible();
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

    test('Videos-only state (Videos ON, QR OFF): the video thumbnail prints, the QR does not', async ({ page }) => {
        await page.locator('#toggle-qrs').uncheck();

        const mediaWrap = page.locator('.media-wrap').first();
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        await expect(mediaWrap.locator('.video-card')).toBeVisible();
        await expect(mediaWrap.locator('.qr-code')).toBeHidden();
        await expect(page).toHaveScreenshot('continuous-print-default-state.png', { fullPage: true, timeout: 15000 });
    });

    test('Default / Both state (Videos ON, QR ON): both the thumbnail and the QR print', async ({ page }) => {
        // Both are ON by default; check() is a no-op that documents the state.
        await page.locator('#toggle-qrs').check();

        const mediaWrap = page.locator('.media-wrap').first();
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        await expect(mediaWrap.locator('.video-card')).toBeVisible();
        await expect(mediaWrap.locator('.qr-code')).toBeVisible();
        await expect(page).toHaveScreenshot('continuous-print-both-state.png', { fullPage: true, timeout: 15000 });
    });

    test('QR-only state (Videos OFF, QR ON): the QR prints, the video thumbnail does not', async ({ page }) => {
        await page.locator('#toggle-qrs').check();
        await page.locator('#toggle-videos').uncheck();

        const mediaWrap = page.locator('.media-wrap').first();
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        await expect(mediaWrap.locator('.video-card')).toBeHidden();
        await expect(mediaWrap.locator('.qr-code')).toBeVisible();
        await expect(page).toHaveScreenshot('continuous-print-qr-only-state.png', { fullPage: true, timeout: 15000 });
    });

    test('None state (Videos OFF, QR OFF): neither prints', async ({ page }) => {
        await page.locator('#toggle-videos').uncheck();
        await page.locator('#toggle-qrs').uncheck();

        const mediaWrap = page.locator('.media-wrap').first();
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(200);

        await expect(mediaWrap.locator('.video-card')).toBeHidden();
        await expect(mediaWrap.locator('.qr-code')).toBeHidden();
        await expect(page).toHaveScreenshot('continuous-print-none-state.png', { fullPage: true, timeout: 15000 });
    });
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
        await page.route('**/data.json', route => {
            route.fulfill({
                path: path.join(__dirname, '..', '..', 'data.json')
            });
        });

        await page.goto('/');
        await page.locator('.view-toggle-btn[data-view="continuous"]').click();
        await expect(page.locator('.card').first()).toBeVisible();

        await page.locator('#settings-btn').click();
        await expect(page.locator('#paper-size-select')).toBeVisible();
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

    test('Print screenshot: Dynamic (default) paper size', async ({ page }) => {
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(300);
        await expect(page).toHaveScreenshot('continuous-print-paper-size-dynamic.png', { fullPage: true, timeout: 15000 });
    });

    test('Print screenshot: A4 paper size', async ({ page }) => {
        // QR codes and Read tracking on, alongside Videos (already on by
        // default) — the fullest useful state for an actual physical
        // printout, same reasoning as book view's equivalent test. Marks
        // one tick read so the screenshot actually shows the filled-in
        // state, not just empty circles. Keeps the same baseline filename
        // so this shows as a real diff in a PR rather than an unrelated
        // add/delete.
        await page.locator('#toggle-qrs').check();
        await page.locator('#toggle-read-tracking').check();
        await page.locator('#q_001_b_1 .read-tick').click();
        await page.locator('#paper-size-select').selectOption('a4');
        await page.waitForTimeout(200);

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(300);
        await expect(page).toHaveScreenshot('continuous-print-paper-size-a4.png', { fullPage: true, timeout: 15000 });
    });

    test('Print screenshot: A3 paper size', async ({ page }) => {
        // Same reasoning as the A4 case above.
        await page.locator('#toggle-qrs').check();
        await page.locator('#toggle-read-tracking').check();
        await page.locator('#q_001_b_1 .read-tick').click();
        await page.locator('#paper-size-select').selectOption('a3');
        await page.waitForTimeout(200);

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(300);
        await expect(page).toHaveScreenshot('continuous-print-paper-size-a3.png', { fullPage: true, timeout: 15000 });
    });
});
