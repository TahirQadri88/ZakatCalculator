const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  // External assets are blocked in tests/fixtures.js, so navigation is ~100ms
  // rather than ~13s and these timeouts are generous.
  timeout: 15000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  workers: 4,
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
      },
    },
  ],
  webServer: {
    command: 'npx serve . -p 4321 -s',
    port: 4321,
    reuseExistingServer: true,
  },
});
