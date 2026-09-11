// Visual regression baselines.
//
// These exist to make large no-op refactors safe. Extracting inline styles into
// classes, swapping physical properties for logical ones, and folding hex
// literals into tokens should all be invisible to the user — if a screenshot
// moves by a pixel, something changed that shouldn't have.
//
// Skipped on CI: this dev image and the ubuntu-22.04 runner rasterise text
// differently, so baselines captured here would not match there. The guard is
// for local refactoring, not for the deploy gate.
//
//   npm run test:visual              # compare against baselines
//   npm run test:visual -- --update-snapshots
//
const { test, expect } = require('./fixtures');

test.skip(!!process.env.CI, 'Baselines are host-specific; local refactor guard only.');

// Every value here is fixed so the render is byte-stable across runs. The Zakat
// date in particular must be pinned — it defaults to today, and a rolling date
// would change the Hijri line and invalidate every baseline overnight.
const FIXED = {
  date: '2026-08-18',
  name: 'Test',
  silverRate: '3000',
  gold: '5000000',
  receivable: '1232344',
  liability: '250000',
};

async function freeze(page) {
  await page.addStyleTag({
    content: `
      /* Nothing mid-flight when we capture. */
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      /* fullPage screenshots are stitched by scrolling, and a sticky element
         re-renders at each scroll offset — the header never settles and the
         comparison retries until it times out. Pin it in place instead. */
      header, .sticky-header, .progress-bar-wrap {
        position: static !important;
      }
    `,
  });
}

async function open(page, lang) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.locator(lang === 'ur' ? '#btnUr' : '#btnEn').click();
  await freeze(page);
}

/** Fill the whole calculator with fixed values, ending on the result screen. */
async function fillAll(page) {
  await page.locator('.calc-hero-card').click();
  await page.locator('#u_name').fill(FIXED.name);
  await page.locator('#g_date').fill(FIXED.date);
  await page.locator('#g_date').dispatchEvent('change');
  await page.locator('#s_rate').fill(FIXED.silverRate);
  await page.locator('#s_rate').dispatchEvent('input');
  await page.locator('#step-1 .btn-primary').click();

  await page.locator('#v_gold').fill(FIXED.gold);
  await page.locator('#step-2 .btn-primary').click();

  await page.locator('#v_ds').fill(FIXED.receivable);
  await page.locator('#step-3 .btn-primary').click();

  await page.locator('#l_per').fill(FIXED.liability);
  await page.locator('#step-4 .btn-primary').click();
  await expect(page.locator('#step-5')).toBeVisible();
}

for (const lang of ['en', 'ur']) {
  test(`${lang}: home screen`, async ({ page }) => {
    await open(page, lang);
    await expect(page).toHaveScreenshot(`${lang}-home.png`, { fullPage: true });
  });

  test(`${lang}: all five calculator steps`, async ({ page }) => {
    await open(page, lang);
    await page.locator('.calc-hero-card').click();
    await page.locator('#u_name').fill(FIXED.name);
    await page.locator('#g_date').fill(FIXED.date);
    await page.locator('#g_date').dispatchEvent('change');
    await page.locator('#s_rate').fill(FIXED.silverRate);
    await page.locator('#s_rate').dispatchEvent('input');
    await expect(page).toHaveScreenshot(`${lang}-step1.png`, { fullPage: true });

    await page.locator('#step-1 .btn-primary').click();
    await page.locator('#v_gold').fill(FIXED.gold);
    await expect(page).toHaveScreenshot(`${lang}-step2.png`, { fullPage: true });

    await page.locator('#step-2 .btn-primary').click();
    await page.locator('#v_ds').fill(FIXED.receivable);
    await expect(page).toHaveScreenshot(`${lang}-step3.png`, { fullPage: true });

    await page.locator('#step-3 .btn-primary').click();
    await page.locator('#l_per').fill(FIXED.liability);
    await expect(page).toHaveScreenshot(`${lang}-step4.png`, { fullPage: true });

    await page.locator('#step-4 .btn-primary').click();
    await expect(page.locator('#step-5')).toBeVisible();
    await expect(page).toHaveScreenshot(`${lang}-step5-result.png`, { fullPage: true });
  });

  test(`${lang}: overlays`, async ({ page }) => {
    await open(page, lang);

    await page.locator('.home-card.gold-card').click();
    await expect(page.locator('#faqModal')).toBeVisible();
    await expect(page).toHaveScreenshot(`${lang}-overlay-faq.png`);
    await page.locator('#faqModal .faq-close-btn').click();

    await page.locator('.home-card').filter({ hasText: /My Zakat Records|میرا ریکارڈ/ }).click();
    await expect(page.locator('#historyModal')).toBeVisible();
    await expect(page).toHaveScreenshot(`${lang}-overlay-history.png`);
    await page.locator('.close-modal').click();

    await page.locator('.hist-rates-card').click();
    await expect(page.locator('#histRatesModal')).toBeVisible();
    await expect(page).toHaveScreenshot(`${lang}-overlay-rates.png`);
  });
}
