const { defineConfig, devices } = require('@playwright/test');
const fs = require('fs');

// This dev image ships a pre-installed Chromium that @playwright/test 1.40.0 is
// pinned against (see CLAUDE.md §4). CI runners have no such path and install
// their own browser instead, so only point at it when it actually exists.
const LOCAL_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOptions = fs.existsSync(LOCAL_CHROME)
  ? { executablePath: LOCAL_CHROME }
  : {};

module.exports = defineConfig({
  testDir: './tests',
  // External assets are blocked in tests/fixtures.js, so navigation is ~100ms
  // rather than ~13s and these timeouts are generous.
  timeout: 15000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  workers: 4,
  retries: process.env.CI ? 2 : 1,
  forbidOnly: !!process.env.CI,
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
        launchOptions,
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        launchOptions,
      },
    },
  ],
  webServer: {
    command: 'npx serve . -p 4321 -s',
    port: 4321,
    reuseExistingServer: true,
  },
});
