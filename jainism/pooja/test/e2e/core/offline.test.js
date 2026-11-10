const { test, expect } = require('@playwright/test');

// The worker is skipped under automation on purpose (see core/offline.js), so
// these tests opt in with ?sw=on. They use the app's real data.json and images
// (no page.route mocking: a mocked request would bypass what is being tested).

test.describe('Offline use (service worker)', () => {
    test('saves a copy on the first visit, then the book still opens with no network', async ({ page, context }) => {
        test.setTimeout(60000);

        await page.goto('/?sw=on');
        const status = page.locator('#home-offline-status');
        await expect(status).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
        await expect(status).toBeVisible();

        // Everything the page loaded from this site is in the saved copy
        const notSaved = await page.evaluate(async () => {
            const saved = new Set();
            for (const name of await caches.keys()) {
                for (const req of await (await caches.open(name)).keys()) saved.add(new URL(req.url).pathname);
            }
            return performance.getEntriesByType('resource')
                .map(r => new URL(r.name))
                .filter(u => u.origin === location.origin)
                .map(u => u.pathname)
                .filter(p => !p.endsWith('/sw.js') && !p.endsWith('/favicon.ico'))
                .filter(p => !saved.has(p));
        });
        expect(notSaved).toEqual([]);

        // Offline: the page comes back from the saved copy and says so
        await context.setOffline(true);
        await page.reload();
        await expect(page.locator('#home-cover-title')).not.toHaveText('');
        await expect(status).toHaveAttribute('data-state', 'offline-ready');

        // ...and the book is readable
        await page.locator('.view-toggle-btn[data-view="book"]').click();
        await expect(page.locator('#book-columns .book-card').first()).toBeVisible();
        await page.locator('#book-next').click();
        await expect(page.locator('#book-columns .book-card').first()).toBeVisible();
    });

    test('is not registered when the page is opened by automation without ?sw=on', async ({ page }) => {
        await page.goto('/');
        const count = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
        expect(count).toBe(0);
        await expect(page.locator('#home-offline-status')).toBeHidden();
    });
});
