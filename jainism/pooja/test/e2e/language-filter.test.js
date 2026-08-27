const { test, expect } = require('@playwright/test');

// The language picker was a single-select <select id="lang-select">
// (All/kn/en); it's now a collapsed "Kannada, English" summary that expands
// into a searchable checkbox list (#lang-trigger -> #lang-panel) so it
// scales past a couple of languages without turning Settings into a wall
// of checkboxes.

test.beforeEach(async ({ page }) => {
  await page.route('**/data.json', route => {
    route.fulfill({ path: 'test/data.json' });
  });

  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();

  await page.locator('#settings-btn').click();
  await expect(page.locator('#lang-trigger')).toBeVisible();
});

test('the trigger shows a collapsed summary until it is opened', async ({ page }) => {
  await expect(page.locator('#lang-summary')).toHaveText('ಕನ್ನಡ, English');
  await expect(page.locator('#lang-panel')).toBeHidden();

  await page.locator('#lang-trigger').click();
  await expect(page.locator('#lang-panel')).toBeVisible();
  await expect(page.locator('#lang-chk-kn')).toBeVisible();
  await expect(page.locator('#lang-chk-en')).toBeVisible();
});

test('Language checkboxes filter content correctly', async ({ page }) => {
  await page.locator('#lang-trigger').click();

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

test('the search box filters the visible language rows', async ({ page }) => {
  await page.locator('#lang-trigger').click();

  await page.locator('#lang-search').fill('english');
  await expect(page.locator('#lang-chk-en')).toBeVisible();
  await expect(page.locator('#lang-chk-kn')).toHaveCount(0);

  await page.locator('#lang-search').fill('');
  await expect(page.locator('#lang-chk-kn')).toBeVisible();
});

test('at least one language must stay active — unchecking the last one reverts', async ({ page }) => {
  await page.locator('#lang-trigger').click();
  await page.locator('#lang-chk-kn').uncheck();
  // Use .click(), not .uncheck() — header.js reverts this synchronously in
  // its 'change' handler, so .uncheck()'s own built-in "ended up unchecked"
  // assertion would fail before we even get to check the reverted state below.
  await page.locator('#lang-chk-en').click(); // attempting to clear the last active lang

  await expect(page.locator('#lang-chk-en')).toBeChecked();
  await expect(page.locator('.col-en').first()).toBeVisible();
});

test('language selection persists across a reload', async ({ page }) => {
  await page.locator('#lang-trigger').click();
  await page.locator('#lang-chk-kn').uncheck();
  await expect(page.locator('.col-kn')).toHaveCount(0);

  await page.reload();
  await page.locator('#settings-btn').click();

  await expect(page.locator('#lang-summary')).toHaveText('English');
  await expect(page.locator('.col-kn')).toHaveCount(0);
});

test('clicking outside the language panel closes it without discarding the selection', async ({ page }) => {
  await page.locator('#lang-trigger').click();
  await page.locator('#lang-chk-kn').uncheck();

  await page.locator('#search-bar').click(); // click elsewhere in the header
  await expect(page.locator('#lang-panel')).toBeHidden();
  await expect(page.locator('#lang-summary')).toHaveText('English');
});