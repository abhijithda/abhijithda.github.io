const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  // Look for files ending in .spec.js right next to our product code
  testMatch: '*.spec.js', 
  
  // Start a local server just for testing
  webServer: {
    command: 'npx http-server -p 8080 --silent',
    port: 8080,
    reuseExistingServer: !process.env.CI,
  },
  
  use: {
    baseURL: 'http://localhost:8080',
    headless: true, // Runs silently in the background
  },
});