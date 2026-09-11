// Shared test fixtures.
//
// The CI/dev sandbox has no direct outbound network. Every external asset the
// page requests — Google Fonts, googletagmanager, the Mehr Nastaleeq font on
// jsdelivr — therefore hangs until it times out, and `page.goto` waits for
// `load`. Measured cost: 12894ms per navigation vs 106ms with them blocked.
//
// Those assets never actually load here, so aborting them changes nothing
// about what renders — the page already falls back to system fonts. It only
// removes the wait.
const base = require('@playwright/test');

const EXTERNAL = new RegExp([
  'googletagmanager', 'google-analytics', 'analytics\\.google', 'doubleclick',
  'fonts\\.googleapis', 'fonts\\.gstatic',
  'cdn\\.jsdelivr', 'goldpricez', 'api\\.coinbase', 'exchangerate-api',
].join('|'));

exports.test = base.test.extend({
  page: async ({ page }, use) => {
    await page.route(EXTERNAL, route => route.abort());
    await use(page);
  },
});

exports.expect = base.expect;
