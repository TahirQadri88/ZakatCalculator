const { test, expect } = require('./fixtures');

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

test('FAQ card opens the FAQ overlay from home, leaving home underneath', async ({ page }) => {
  await page.locator('.home-card.gold-card').click();

  // Overlay is open and shows the FAQ content
  await expect(page.locator('#faqModal')).toBeVisible();
  await expect(page.locator('#faqModal .faq-item')).toHaveCount(10);
  await expect(page.locator('#faqModal .faq-item').first()).toBeVisible();

  // We must NOT have navigated into the calculator
  await expect(page.locator('#step-2')).not.toBeVisible();

  // Overlay covers the viewport, anchored at the top
  const box = await page.locator('#faqModal').boundingBox();
  expect(box.y).toBeLessThanOrEqual(1);
  expect(box.width).toBeGreaterThan(page.viewportSize().width * 0.9);
});

test('FAQ overlay closes on X and returns to home', async ({ page }) => {
  await page.locator('.home-card.gold-card').click();
  await expect(page.locator('#faqModal')).toBeVisible();

  await page.locator('#faqModal .faq-close-btn').click();
  await expect(page.locator('#faqModal')).not.toBeVisible();
  await expect(page.locator('#home-screen')).toBeVisible();
});

test('FAQ overlay closes on backdrop click', async ({ page }) => {
  await page.locator('.home-card.gold-card').click();
  await expect(page.locator('#faqModal')).toBeVisible();

  await page.locator('#faqModal').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('#faqModal')).not.toBeVisible();
});

test('FAQ overlay opens from step 2 and returns there on close', async ({ page }) => {
  // Walk into the calculator: home → step 1 → step 2
  await page.locator('.calc-hero-card').click();
  await page.locator('#s_rate').fill('3000');
  await page.locator('#step-1 .btn-primary').click();
  await expect(page.locator('#step-2')).toBeVisible();

  // Type a value so we can prove form state survives the overlay
  await page.locator('#v_gold').fill('50000');

  await page.locator('.faq-inline-link').click();
  await expect(page.locator('#faqModal')).toBeVisible();

  await page.locator('#faqModal .faq-close-btn').click();
  await expect(page.locator('#faqModal')).not.toBeVisible();

  // Back on step 2 with the entered value intact
  await expect(page.locator('#step-2')).toBeVisible();
  await expect(page.locator('#v_gold')).toHaveValue('50,000');
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
  await page.locator('#histRatesModal .hist-close-btn').click();
  await expect(page.locator('#histRatesModal')).not.toBeVisible();
});
