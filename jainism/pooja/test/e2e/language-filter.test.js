const { test, expect } = require('@playwright/test');

test('Language Selector filters content correctly', async ({ page }) => {
  await page.goto('/');

  // --- STATE 1: ALL ---
  // Default is 'all'. Ensure both are present.
  await expect(page.locator('.col-en').first()).toBeVisible();
  await expect(page.locator('.col-kn').first()).toBeVisible();

  // --- STATE 2: ENGLISH ---
  await page.selectOption('#lang-select', 'en');
  await expect(page.locator('.col-en').first()).toBeVisible();
  // Check that Kannada column is gone (not just hidden, but removed by renderChat)
  await expect(page.locator('.col-kn')).toHaveCount(0); 
  await expect(page.locator('.col-en').first()).toContainText(/All are equal/i);

  // --- STATE 3: KANNADA ---
  await page.selectOption('#lang-select', 'kn');
  await expect(page.locator('.col-kn').first()).toBeVisible();
  // Check that English column is gone
  await expect(page.locator('.col-en')).toHaveCount(0);
  await expect(page.locator('.col-kn').first()).toContainText(/ಎಲ್ಲಾ ದೇವರು ಒಂದೇ/i);
});