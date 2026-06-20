const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  // Tell Playwright to ONLY look inside the e2e folder
  testDir: './test/e2e', 
  
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