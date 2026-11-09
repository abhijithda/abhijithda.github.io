const { test, expect } = require('@playwright/test');
const path = require('path');

// Phone-sized screens (<= 700px): the header wraps, the book shows ONE page at
// a time, and swiping turns pages. The 700px breakpoint is shared by
// header.css, book-view.css, continuous-view.css and book-view.js.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const openBook = async page => {
    await page.locator('.view-toggle-btn[data-view="book"]').click();
    await expect(page.locator('#book-columns .book-card').first()).toBeVisible();
};

// Same gesture a finger makes: touchstart then touchend `dx` pixels to the side.
const swipe = (page, dx) => page.evaluate(dx => {
    const el = document.getElementById('book-spread');
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const touch = (type, cx, cy) => {
        const t = new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy });
        return new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true });
    };
    el.dispatchEvent(touch('touchstart', x, y));
    el.dispatchEvent(touch('touchend', x + dx, y + 5));
}, dx);

test.describe('Phone layout', () => {
    test.beforeEach(async ({ page }) => {
        await page.route('**/data.json', route => {
            route.fulfill({ path: path.join(__dirname, '..', '..', 'data.json') });
        });
        await page.goto('/');
    });

    // The continuous view is rendered when its first card is on screen. Measuring
    // before that would test the previous view, not this one.
    const showContinuous = async page => {
        await page.locator('.view-toggle-btn[data-view="continuous"]').click();
        await expect(page.locator('#continuous-container .card').first()).toBeVisible();
    };

    // What the page looks like right now: how far it overflows sideways, which
    // paper size and container width it has, and the elements that stick out.
    const overflowReport = page => page.evaluate(() => {
        const W = innerWidth;
        const wide = [];
        document.querySelectorAll('body *').forEach(e => {
            const r = e.getBoundingClientRect();
            if (r.width > 0 && r.right > W + 2) {
                const cs = getComputedStyle(e);
                wide.push(`${e.tagName.toLowerCase()}#${e.id}.${String(e.className).slice(0, 40)}`
                    + ` w=${Math.round(r.width)} right=${Math.round(r.right)}`
                    + ` display=${cs.display} position=${cs.position}`
                    + (e.getAttribute('src') ? ` src=${e.getAttribute('src')}` : ''));
            }
        });
        const container = document.getElementById('continuous-container');
        return {
            over: document.documentElement.scrollWidth - innerWidth,
            paper: document.body.dataset.paperSize,
            container: container ? Math.round(container.getBoundingClientRect().width) : null,
            viewport: innerWidth,
            wide: wide.slice(0, 10),
        };
    });

    // The page may take a moment to settle (images decode, layout re-runs after a
    // resize), so wait up to 3s for "no sideways scroll". A transient overflow that
    // clears is recorded on the test report; one that stays fails the test and
    // names the elements responsible, not just "expected <= 0, received 808".
    const expectNoSidewaysScroll = async (page, where) => {
        const first = await overflowReport(page);
        let info = first;
        const deadline = Date.now() + 3000;
        while (info.over > 0 && Date.now() < deadline) {
            await page.waitForTimeout(100);
            info = await overflowReport(page);
        }
        if (first.over > 0 && info.over <= 0) {
            test.info().annotations.push({ type: 'transient-overflow', description: `${where}: ${JSON.stringify(first)}` });
        }
        expect(info.over, `${where}: ${JSON.stringify(info)}`).toBeLessThanOrEqual(0);
    };

    for (const width of [320, 360, 390, 430]) {
        test(`nothing scrolls sideways at ${width}px (home, book, continuous)`, async ({ page }) => {
            await page.setViewportSize({ width, height: 800 });
            await expectNoSidewaysScroll(page, 'home');
            await openBook(page);
            await expectNoSidewaysScroll(page, 'book');
            await showContinuous(page);
            await expectNoSidewaysScroll(page, 'continuous');
        });
    }

    // Dynamic (the default) adapts to the phone. A4 / A3 are a deliberate "show
    // me the real paper" preview: they keep their true width (794px / 1123px) and
    // may scroll sideways, as on desktop. The one hard requirement is that the
    // reader can always get back out of it via Settings.
    for (const paperSize of ['a4', 'a3']) {
        test(`a saved ${paperSize.toUpperCase()} paper size keeps its real width, and Settings can switch back to Dynamic`, async ({ page }) => {
            await page.addInitScript(size => {
                localStorage.setItem('settings', JSON.stringify({ paperSize: size }));
            }, paperSize);
            await page.goto('/');
            await expect(page.locator('body')).toHaveAttribute('data-paper-size', paperSize);
            await showContinuous(page);

            // real paper width: wider than the screen on purpose
            const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
            expect(over, `${paperSize} should be a wide real-size preview`).toBeGreaterThan(0);

            // Settings is still on screen and can switch the paper size back
            const settings = await page.locator('#settings-btn').boundingBox();
            expect(settings.x).toBeGreaterThanOrEqual(0);
            expect(settings.x + settings.width).toBeLessThanOrEqual(390);
            await page.locator('#settings-btn').click();
            await page.locator('#paper-size-select').selectOption('dynamic');
            await page.locator('#settings-btn').click();
            await expect(page.locator('body')).toHaveAttribute('data-paper-size', 'dynamic');
            await expectNoSidewaysScroll(page, `continuous (after ${paperSize} -> dynamic)`);
        });
    }

    test('Book view with A4 on a phone stays a two-page spread, and Dynamic brings back the single page', async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem('settings', JSON.stringify({ paperSize: 'a4' }));
        });
        await page.goto('/');
        await openBook(page);
        await expect(page.locator('.book-spine')).toBeVisible();
        await page.locator('#settings-btn').click();
        await page.locator('#paper-size-select').selectOption('dynamic');
        await page.locator('#settings-btn').click();
        await expect(page.locator('.book-spine')).toBeHidden();
        await expectNoSidewaysScroll(page, 'book (after a4 -> dynamic)');
    });

    test('the whole header (search and Settings) is on screen, not cut off', async ({ page }) => {
        for (const id of ['#search-bar', '#settings-btn', '#zen-mode-btn']) {
            const box = await page.locator(id).boundingBox();
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(390);
        }
    });

    test('the Settings menu fits inside the screen', async ({ page }) => {
        await page.locator('#settings-btn').click();
        const box = await page.locator('#settings-menu').boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(390);
    });

    test('book view shows a single page: only the left page number is used', async ({ page }) => {
        await openBook(page);
        await page.locator('#book-next').click();
        await expect(page.locator('#book-page-num-left')).not.toHaveText('');
        await expect(page.locator('#book-page-num-right')).toBeHidden();
    });

    test('Prev/Next stay inside the screen', async ({ page }) => {
        await openBook(page);
        for (const id of ['#book-prev', '#book-next']) {
            const box = await page.locator(id).boundingBox();
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(390);
        }
    });

    test('swiping left turns to the next page and right goes back; a tiny drag does nothing', async ({ page }) => {
        await openBook(page);
        await page.locator('#book-next').click();
        const input = page.locator('#book-jump-input');
        const start = await input.inputValue();
        await swipe(page, -120);
        await expect(input).not.toHaveValue(start);
        await swipe(page, 120);
        await expect(input).toHaveValue(start);
        await swipe(page, -20);
        await expect(input).toHaveValue(start);
    });

    test('rotating to a wide screen switches back to the two-page spread and keeps the reader on the same card', async ({ page }) => {
        await openBook(page);
        await page.locator('#book-next').click();
        await page.locator('#book-next').click();
        const firstCardOnPage = () => page.evaluate(() => {
            const sp = document.getElementById('book-spread').getBoundingClientRect();
            for (const c of document.querySelectorAll('#book-columns .book-card')) {
                const r = c.getBoundingClientRect();
                if (r.right > sp.left && r.left < sp.right) return c.id;
            }
        });
        const before = await firstCardOnPage();
        await page.setViewportSize({ width: 1024, height: 700 });
        // two-page layout is back: the spine only exists in that mode
        await expect(page.locator('.book-spine')).toBeVisible();
        // the card the reader was on is still somewhere on the visible spread
        const visible = await page.evaluate(id => {
            const sp = document.getElementById('book-spread').getBoundingClientRect();
            const r = document.getElementById(id).getBoundingClientRect();
            return r.right > sp.left && r.left < sp.right;
        }, before);
        expect(visible).toBe(true);
    });
});
