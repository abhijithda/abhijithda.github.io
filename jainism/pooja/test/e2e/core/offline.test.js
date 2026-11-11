const { test, expect } = require('@playwright/test');

// Offline use is opt-in (Settings -> Offline copy) and the worker is skipped
// under automation on purpose (see core/offline.js), so these tests open the
// page with ?sw=on. They use the app's real data.json and images (no
// page.route mocking: a mocked request would bypass what is being tested).

const toggleOfflineCopy = async page => {
    await page.locator('#settings-btn').click();
    await page.locator('label.switch:has(#toggle-offline)').click();
    await page.locator('#settings-btn').click();          // close the menu again
};

const savedState = page => page.evaluate(async () => ({
    registrations: (await navigator.serviceWorker.getRegistrations()).length,
    caches: await caches.keys(),
}));

test.describe('Offline copy (opt-in service worker)', () => {
    test('by default nothing is downloaded, registered or shown', async ({ page }) => {
        await page.goto('/?sw=on');
        await expect(page.locator('#toggle-offline')).not.toBeChecked();
        await expect(page.locator('#home-offline-status')).toBeHidden();
        await page.waitForTimeout(1500);                  // give a worker time to appear if it wrongly would
        expect(await savedState(page)).toEqual({ registrations: 0, caches: [] });
    });

    test('turning it on saves a copy, then the book still opens with no network', async ({ page, context }) => {
        test.setTimeout(60000);

        await page.goto('/?sw=on');
        await toggleOfflineCopy(page);
        const status = page.locator('#home-offline-status');
        await expect(status).toHaveAttribute('data-state', 'ready', { timeout: 30000 });

        // The choice is remembered, and both copies of the switch agree
        await page.reload();
        await expect(page.locator('#toggle-offline')).toBeChecked();
        await expect(page.locator('#home-toggle-offline')).toBeChecked();
        await expect(status).toHaveAttribute('data-state', 'ready', { timeout: 30000 });

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
        await expect(status).toHaveAttribute('data-state', 'offline-ready');

        // ...and the book is readable
        await page.locator('.view-toggle-btn[data-view="book"]').click();
        await expect(page.locator('#book-columns .book-card').first()).toBeVisible();
        await page.locator('#book-next').click();
        await expect(page.locator('#book-columns .book-card').first()).toBeVisible();
    });

    test('turning it off removes the worker and every saved file, and nothing is saved again', async ({ page }) => {
        test.setTimeout(60000);

        await page.goto('/?sw=on');
        await toggleOfflineCopy(page);
        await expect(page.locator('#home-offline-status')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });

        await toggleOfflineCopy(page);
        await expect.poll(() => savedState(page), { timeout: 10000 }).toEqual({ registrations: 0, caches: [] });
        await expect(page.locator('#home-toggle-offline')).not.toBeChecked();

        // Browsing afterwards must not quietly save the book again
        await page.locator('.view-toggle-btn[data-view="book"]').click();
        await page.locator('.view-toggle-btn[data-view="continuous"]').click();
        await page.waitForTimeout(1500);
        expect(await savedState(page)).toEqual({ registrations: 0, caches: [] });
    });

    test('is not registered when the page is opened by automation without ?sw=on', async ({ page }) => {
        await page.goto('/');
        const count = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
        expect(count).toBe(0);
    });
});
