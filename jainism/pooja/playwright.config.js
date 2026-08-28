const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  // Tell Playwright to ONLY look inside the e2e folder
  testDir: './test/e2e', 
  
  // No default reporter writes an HTML report on its own — without this,
  // playwright-report/ never gets created, so any CI step that tries to
  // upload it as an artifact will always find nothing there.
  // 'open: never' stops it from trying to launch a browser tab in CI.
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  webServer: {
    command: 'npx http-server -p 8080 --silent',
    port: 8080,
    reuseExistingServer: !process.env.CI,
  },
  
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
  },
});