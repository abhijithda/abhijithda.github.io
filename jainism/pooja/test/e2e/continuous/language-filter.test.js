const { test, expect } = require('@playwright/test');
const path = require('path');

// Continuous-view-specific language-filter rendering: does continuous
// view's own DOM actually react correctly when the active languages
// change (columns removed, not just hidden; correct content shown per
// language). The language *picker's* own UI mechanism (trigger, search,
// "at least one must stay active" validation, persistence, closing on an
// outside click) is the same header.js component regardless of which view
// is showing, and was split out to core/language-filter.test.js instead —
// deleting this folder does not lose that coverage. Book view has its own
// content-reaction test in book/book-view.test.js.

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
  await page.locator('#lang-trigger').click();
});

test('Language checkboxes filter content correctly', async ({ page }) => {
  // --- STATE 1: BOTH (default) ---
  await expect(page.locator('#lang-chk-kn')).toBeChecked();
  await expect(page.locator('#lang-chk-en')).toBeChecked();
  await expect(page.locator('.col-en').first()).toBeVisible();
  await expect(page.locator('.col-kn').first()).toBeVisible();

  // --- STATE 2: ENGLISH ONLY ---
  await page.locator('#lang-chk-kn').uncheck();
  await expect(page.locator('.col-en').first()).toBeVisible();
  // Kannada column removed (not just hidden) by renderContinuousView.
  await expect(page.locator('.col-kn')).toHaveCount(0);
  await expect(page.locator('.col-en').first()).toContainText(/All are equal/i);
  await expect(page.locator('#lang-summary')).toHaveText('English');

  // --- STATE 3: KANNADA ONLY ---
  await page.locator('#lang-chk-kn').check();
  await page.locator('#lang-chk-en').uncheck();
  await expect(page.locator('.col-kn').first()).toBeVisible();
  await expect(page.locator('.col-en')).toHaveCount(0);
  await expect(page.locator('.col-kn').first()).toContainText(/ಎಲ್ಲಾ ದೇವರು ಒಂದೇ/i);
});
