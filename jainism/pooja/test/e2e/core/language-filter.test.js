const { test, expect } = require('@playwright/test');
const path = require('path');

// These test the shared header language-picker UI mechanism itself
// (#lang-trigger -> #lang-panel: the collapsed summary, the search box,
// the "at least one language must stay active" validation, persistence,
// closing on an outside click) — the exact same header.js component and
// DOM regardless of which view happens to be showing. Continuous view is
// used here only as the simplest vehicle to reach the DOM; a couple of
// these lean on continuous-specific `.col-en`/`.col-kn` elements purely as
// the easiest visible proof a setting actually took effect, not because
// the picker's own behavior is continuous-specific. Book view has its own
// content-reaction test in book/book-view.test.js — this file isn't a
// substitute for that.
//
// Split out from continuous/language-filter.test.js, which kept the one
// test that actually exercises continuous-specific rendering (column
// removal and content-text assertions). See that file's own header
// comment.

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
  // .col-en is just the simplest visible proof English is still active —
  // this isn't testing continuous-specific rendering, only that the
  // picker's own validation held.
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
