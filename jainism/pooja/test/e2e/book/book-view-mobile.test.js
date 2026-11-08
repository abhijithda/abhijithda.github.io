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

    for (const width of [320, 360, 390, 430]) {
        test(`nothing scrolls sideways at ${width}px (home, book, continuous)`, async ({ page }) => {
            await page.setViewportSize({ width, height: 800 });
            const sideways = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
            expect(await sideways()).toBeLessThanOrEqual(0);
            await openBook(page);
            expect(await sideways()).toBeLessThanOrEqual(0);
            await page.locator('.view-toggle-btn[data-view="continuous"]').click();
            expect(await sideways()).toBeLessThanOrEqual(0);
        });
    }

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
