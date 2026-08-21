const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
});

// ── HOME SCREEN ────────────────────────────────────────────────────────────────

test('home screen loads with bismillah and hero card', async ({ page }) => {
  await expect(page.locator('.bismillah')).toBeVisible();
  await expect(page.locator('.calc-hero-card')).toBeVisible();
  await expect(page.locator('.calc-hero-card')).toContainText('Calculate Zakat');
  await expect(page.locator('#home-screen')).toBeVisible();
});

test('all home cards visible', async ({ page }) => {
  await expect(page.locator('.calc-hero-card')).toBeVisible();        // Calculate Zakat hero
  await expect(page.locator('.home-card').filter({ hasText: 'App Language' })).toBeVisible();
  await expect(page.locator('.home-card').filter({ hasText: 'My Zakat Records' })).toBeVisible();
  await expect(page.locator('.home-card').filter({ hasText: 'Zakat FAQs' })).toBeVisible();
  await expect(page.locator('.home-card').filter({ hasText: 'Historical Gold Rates' })).toBeVisible();
});

// ── LANGUAGE TOGGLE ────────────────────────────────────────────────────────────

test('language toggle switches between EN and Urdu', async ({ page }) => {
  // EN is default
  await expect(page.locator('#btnEn')).toHaveClass(/active/);
  await expect(page.locator('.calc-hero-card .card-title-en')).toBeVisible();

  // Switch to Urdu
  await page.locator('#btnUr').click();
  await expect(page.locator('#btnUr')).toHaveClass(/active/);
  await expect(page.locator('.calc-hero-card .card-title-ur')).toBeVisible();
  await expect(page.locator('.calc-hero-card .card-title-en')).not.toBeVisible();

  // Switch back to EN
  await page.locator('#btnEn').click();
  await expect(page.locator('.calc-hero-card .card-title-en')).toBeVisible();
  await expect(page.locator('.calc-hero-card .card-title-ur')).not.toBeVisible();
});

// ── NAVIGATION ─────────────────────────────────────────────────────────────────

test('Calculate Zakat hero navigates to step 1', async ({ page }) => {
  await page.locator('.calc-hero-card').click();
  await expect(page.locator('#home-screen')).not.toBeVisible();
  await expect(page.locator('#step-1')).toBeVisible();
  await expect(page.locator('.progress-bar-wrap')).toBeVisible();
});

test('back button from step 1 returns to home', async ({ page }) => {
  await page.locator('.calc-hero-card').click();
  await expect(page.locator('#step-1')).toBeVisible();
  await page.locator('.top-back-btn').first().click();
  await expect(page.locator('#home-screen')).toBeVisible();
  await expect(page.locator('#step-1')).not.toBeVisible();
});

// ── FAQ ────────────────────────────────────────────────────────────────────────

test('FAQ card opens step-2 with FAQ accordion visible and near top of viewport', async ({ page }) => {
  await page.locator('.home-card.gold-card').click();

  // Step-2 should be visible, home should be hidden
  await expect(page.locator('#step-2')).toBeVisible();
  await expect(page.locator('#home-screen')).not.toBeVisible();

  // FAQ content accordion should be open
  await expect(page.locator('#faqContent')).toBeVisible();

  // Wait for smooth scroll to settle
  await page.waitForTimeout(500);

  // The FAQ header must be in the viewport (not scrolled past)
  const faqHeader = page.locator('#faqContent').locator('..').locator('.accordion-header').last();
  const headerBox = await faqHeader.boundingBox();
  const viewportHeight = page.viewportSize().height;

  expect(headerBox.y).toBeGreaterThanOrEqual(0);        // not above viewport
  expect(headerBox.y).toBeLessThan(viewportHeight);     // not below viewport
});

// ── HISTORY MODAL ──────────────────────────────────────────────────────────────

test('history modal overlays screen (not below content)', async ({ page }) => {
  await page.locator('.home-card').filter({ hasText: 'My Zakat Records' }).click();

  const modal = page.locator('#historyModal');
  await expect(modal).toBeVisible();

  // Modal must cover the full viewport as a fixed overlay
  const modalBox = await modal.boundingBox();
  const viewport = page.viewportSize();

  expect(modalBox.x).toBe(0);
  expect(modalBox.y).toBe(0);
  expect(modalBox.width).toBeCloseTo(viewport.width, 0);
  expect(modalBox.height).toBeCloseTo(viewport.height, 0);

  // Modal content (the white card) must be visible within viewport
  const modalContent = page.locator('.modal-content');
  await expect(modalContent).toBeVisible();
  const contentBox = await modalContent.boundingBox();
  expect(contentBox.y).toBeGreaterThan(0);
  expect(contentBox.y + contentBox.height).toBeLessThanOrEqual(viewport.height + 5);
});

test('history modal closes on X button', async ({ page }) => {
  await page.locator('.home-card').filter({ hasText: 'My Zakat Records' }).click();
  await expect(page.locator('#historyModal')).toBeVisible();
  await page.locator('.close-modal').click();
  await expect(page.locator('#historyModal')).not.toBeVisible();
});

test('history modal closes on backdrop click', async ({ page }) => {
  await page.locator('.home-card').filter({ hasText: 'My Zakat Records' }).click();
  await expect(page.locator('#historyModal')).toBeVisible();
  // Click outside the modal-content (the backdrop area)
  await page.locator('#historyModal').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#historyModal')).not.toBeVisible();
});

// ── NAME FIELD OPTIONAL ────────────────────────────────────────────────────────

test('can proceed from step 1 without entering name (name is optional)', async ({ page }) => {
  await page.locator('.calc-hero-card').click();
  await expect(page.locator('#step-1')).toBeVisible();

  // Enter silver rate so nisab can be calculated
  await page.locator('#s_rate').fill('2800');
  await page.locator('#s_unit').selectOption('tola');
  // Trigger nisab calculation
  await page.locator('#s_rate').dispatchEvent('input');

  // Navigate without entering name
  await page.locator('button.btn.btn-primary').first().click();

  // Should move to step-2 without an error toast about name
  await expect(page.locator('#step-2')).toBeVisible();
  await expect(page.locator('#step-1')).not.toBeVisible();
});

// ── HISTORICAL RATES MODAL ─────────────────────────────────────────────────────

test('historical rates modal opens and closes', async ({ page }) => {
  await page.locator('.home-card').filter({ hasText: 'Historical Gold Rates' }).click();
  await expect(page.locator('#histRatesModal')).toBeVisible();
  await page.locator('.hist-close-btn').click();
  await expect(page.locator('#histRatesModal')).not.toBeVisible();
});
