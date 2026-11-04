const { defineConfig, devices } = require('@playwright/test');
const fs = require('fs');

// Pick up whatever Chromium this image ships. The revision and even the folder
// layout change between image builds - it was chromium-1194/chrome-linux, it is
// now chromium-1243/chrome-linux64 - so discover the binary instead of pinning a
// path. Falls back to Playwright's own browser when none is present (CI).
const glob = ['chrome-linux64/chrome', 'chrome-linux/chrome'];
const localChrome = (() => {
  let base;
  try { base = fs.readdirSync('/opt/pw-browsers'); } catch { return null; }
  for (const dir of base.filter(d => d.startsWith('chromium-')).sort().reverse()) {
    for (const rel of glob) {
      const p = `/opt/pw-browsers/${dir}/${rel}`;
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
})();
const launchOptions = localChrome ? { executablePath: localChrome } : {};

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
