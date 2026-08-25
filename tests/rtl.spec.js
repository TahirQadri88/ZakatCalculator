// Bidirectional-text and RTL correctness.
//
// Every check here guards a bug that actually shipped and had to be reported
// from a phone screenshot. See DESIGN.md §2 for the rules being enforced.

const { test, expect } = require('./fixtures');

/** Switch the app into Urdu (RTL) and wait for the document to flip. */
async function goUrdu(page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#btnUr').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ur');
}

/** Walk into the calculator and fill a full set of values, in Urdu mode. */
async function calculateInUrdu(page) {
  await page.locator('.calc-hero-card').click();
  await page.locator('#s_rate').fill('3000');       // silver rate -> sets Nisab
  await page.locator('#step-1 .btn-primary').click();

  await page.locator('#v_gold').fill('5000000');    // assets
  await page.locator('#step-2 .btn-primary').click();

  await page.locator('#v_ds').fill('1232344');      // receivables
  await page.locator('#step-3 .btn-primary').click();

  await page.locator('#l_per').fill('0');           // liabilities
  await page.locator('#step-4 .btn-primary').click();

  await expect(page.locator('#step-5')).toBeVisible();
}

// ── DIRECTION WIRING ──────────────────────────────────────────────────────────

test('language toggle drives both dir and lang on the root element', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  await page.locator('#btnUr').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ur');

  await page.locator('#btnEn').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

// ── RULE: never transform a bidi-mirrored glyph (DESIGN.md §2.1) ──────────────

test('mirrored chevrons are not double-flipped by a transform', async ({ page }) => {
  await goUrdu(page);

  const arrows = page.locator('.calc-hero-arrow, .card-arrow');
  const n = await arrows.count();
  expect(n).toBeGreaterThan(0);

  for (let i = 0; i < n; i++) {
    const transform = await arrows.nth(i).evaluate(
      el => getComputedStyle(el).transform
    );
    // A horizontal flip shows up as matrix(-1, ...). The browser already
    // mirrors these glyphs in RTL, so any scaleX(-1) here is a double flip.
    expect(transform === 'none' || !transform.startsWith('matrix(-1')).toBeTruthy();
  }
});

// ── RULE: no row-reverse inside dir=rtl (DESIGN.md §2.2) ──────────────────────

test('RTL rows are not reversed a second time with row-reverse', async ({ page }) => {
  await goUrdu(page);

  const rows = page.locator('.calc-hero-card, .home-card.gold-card, .faq-inline-link');
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);

  for (let i = 0; i < n; i++) {
    const dir = await rows.nth(i).evaluate(el => getComputedStyle(el).flexDirection);
    expect(dir).not.toBe('row-reverse');
  }
});

test('hero card puts its icon on the right and its arrow on the left in RTL', async ({ page }) => {
  await goUrdu(page);

  const icon = await page.locator('.calc-hero-card .card-icon').boundingBox();
  const arrow = await page.locator('.calc-hero-arrow').boundingBox();

  // RTL reading order: icon leads (right edge), arrow trails (left edge).
  expect(icon.x).toBeGreaterThan(arrow.x);
});

// ── RULE: isolate English runs inside Urdu context (DESIGN.md §2.3) ───────────

test('the historical-rates source line keeps its written order in RTL', async ({ page }) => {
  await goUrdu(page);

  const line = page.locator('.hist-rates-card bdi');
  await expect(line).toHaveText('1947 – 2019 · Source: Daily Jang');

  // The visual order must match the logical order: 1947 left of 2019.
  const order = await line.evaluate(el => {
    const range = document.createRange();
    const text = el.firstChild;
    range.setStart(text, 0); range.setEnd(text, 4);          // "1947"
    const a = range.getBoundingClientRect().x;
    range.setStart(text, 7); range.setEnd(text, 11);         // "2019"
    const b = range.getBoundingClientRect().x;
    return { a, b };
  });
  expect(order.a).toBeLessThan(order.b);
});

test('result date line isolates the Gregorian and Hijri halves', async ({ page }) => {
  await goUrdu(page);
  await calculateInUrdu(page);

  const greg = page.locator('#rpt_date_greg');
  const hijri = page.locator('#rpt_date_hijri');

  // Gregorian half stays LTR and in dd/mm/yyyy order.
  await expect(greg).toHaveText(/^\d{2}\/\d{2}\/\d{4}$/);
  await expect(greg).toHaveCSS('direction', 'ltr');

  // Hijri half is Urdu, RTL, and isolated so it can't reorder its neighbour.
  await expect(hijri).toHaveCSS('direction', 'rtl');
  await expect(hijri).toHaveCSS('unicode-bidi', 'isolate');
  await expect(hijri).not.toHaveText('');
});

test('the rate-fetch button renders its markup while loading, in Urdu', async ({ page }) => {
  await goUrdu(page);
  await page.locator('.calc-hero-card').click();

  // A past Zakat date takes the fetching(dateLabel) branch — the string that
  // carries <bdi> markup. Today's date takes a plain-text branch instead.
  await page.locator('#g_date').fill('2024-08-01');
  await page.locator('#g_date').dispatchEvent('change');

  // Sample synchronously: the network call fails fast offline and the catch
  // restores the idle label, so racing it is unreliable. Invoking the handler
  // and reading the DOM immediately is deterministic.
  const state = await page.evaluate(() => {
    fetchSilverRate();
    const el = document.getElementById('fetchRateTxt');
    return { text: el.textContent, bdiCount: el.querySelectorAll('bdi').length };
  });

  // Rendered as markup: a real <bdi> element, and no literal tags in the text.
  expect(state.bdiCount).toBeGreaterThan(0);
  expect(state.text).not.toMatch(/<\/?bdi>/i);
});

test('no raw markup leaks into the page as visible text', async ({ page }) => {
  await goUrdu(page);

  // Translation strings carry <bdi> tags; msg() must render them, not print
  // them. This catches innerText/textContent regressions anywhere on screen.
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/<\s*bdi\s*\/?>/i);
  expect(body).not.toMatch(/<\/\s*bdi\s*>/i);
});

// ── LAYOUT INTEGRITY ──────────────────────────────────────────────────────────

test('no horizontal overflow anywhere in Urdu mode', async ({ page }) => {
  await goUrdu(page);

  const overflow = await page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')]
      .filter(el => {
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        if (s.position === 'fixed') return false;          // overlays
        if (el.scrollWidth > el.clientWidth) return false;  // own scroller
        return el.getBoundingClientRect().right > docWidth + 1;
      })
      .slice(0, 5)
      .map(el => el.className || el.tagName);
  });

  expect(overflow).toEqual([]);
});

test('Urdu text has enough line-height for Nastaliq descenders', async ({ page }) => {
  await goUrdu(page);

  const tight = await page.evaluate(() => {
    return [...document.querySelectorAll('.urdu-label-main, .card-title-ur, .faq-q, .faq-a')]
      .filter(el => el.offsetParent !== null)
      .filter(el => {
        const s = getComputedStyle(el);
        const lh = parseFloat(s.lineHeight);
        const fs = parseFloat(s.fontSize);
        return Number.isFinite(lh) && Number.isFinite(fs) && lh / fs < 1.2;
      })
      .slice(0, 5)
      .map(el => `${el.className}: ${getComputedStyle(el).lineHeight}`);
  });

  expect(tight).toEqual([]);
});

test('Urdu text is never letter-spaced', async ({ page }) => {
  await goUrdu(page);

  const spaced = await page.evaluate(() => {
    return [...document.querySelectorAll('.urdu-label-main, .card-title-ur, .urdu-subtitle, .faq-q, .faq-a')]
      .filter(el => el.offsetParent !== null)
      .filter(el => {
        const ls = getComputedStyle(el).letterSpacing;
        return ls !== 'normal' && parseFloat(ls) > 0;
      })
      .slice(0, 5)
      .map(el => `${el.className}: ${getComputedStyle(el).letterSpacing}`);
  });

  expect(spaced).toEqual([]);
});

// ── READABILITY ───────────────────────────────────────────────────────────────

test('placeholders are legible, not browser-default faint', async ({ page }) => {
  await goUrdu(page);
  await page.locator('.calc-hero-card').click();

  const { color, opacity } = await page.locator('#s_rate').evaluate(el => {
    const s = getComputedStyle(el, '::placeholder');
    return { color: s.color, opacity: s.opacity };
  });

  expect(parseFloat(opacity)).toBe(1);

  // Relative luminance must be dark enough to read on white.
  const [r, g, b] = color.match(/\d+/g).map(Number);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  expect(lum).toBeLessThan(0.55);
});

test('field labels are not styled as errors', async ({ page }) => {
  await goUrdu(page);
  await page.locator('.calc-hero-card').click();
  await page.locator('#s_rate').fill('3000');   // step 1 gates on a Nisab value
  await page.locator('#step-1 .btn-primary').click();
  await expect(page.locator('#step-2')).toBeVisible();

  // --danger (#991B1B) means "money owed" or "something is wrong". Ordinary
  // Urdu field labels rendered in it once, making the form look like errors.
  const label = page.locator('#step-2 .urdu-label-main').first();
  await expect(label).toHaveCSS('color', 'rgb(6, 78, 59)');   // --primary
});

// ── RESULT PRESENTATION ───────────────────────────────────────────────────────

test('all result amounts display as whole numbers', async ({ page }) => {
  await goUrdu(page);
  await calculateInUrdu(page);

  for (const id of ['#r_total', '#p_now', '#p_def']) {
    const text = await page.locator(id).innerText();
    expect(text, `${id} should carry no decimal part`).not.toMatch(/\.\d/);
  }
});

// ── ENGLISH MODE ──────────────────────────────────────────────────────────────

test('UI chrome added by us is bilingual, not Urdu-only in English mode', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#btnEn').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.locator('.calc-hero-card').click();
  await page.locator('#s_rate').fill('3000');
  await page.locator('#step-1 .btn-primary').click();
  await expect(page.locator('#step-2')).toBeVisible();

  // The step-2 FAQ entry point is our own chrome (not fiqh content), so it
  // must read in English when the app is in English.
  // useInnerText so the hidden Urdu span doesn't count — textContent would
  // include it even while display:none.
  const link = page.locator('.faq-inline-link');
  await expect(link).toContainText('Zakat FAQs', { useInnerText: true });
  await expect(link).not.toContainText('عام سوالات', { useInnerText: true });
});

test('eligibility status box styles both outcomes', async ({ page }) => {
  await goUrdu(page);

  // Above Nisab -> eligible
  await calculateInUrdu(page);
  const box = page.locator('#elig_status_box');
  await expect(box).toHaveClass('is-eligible');
  await expect(box).toHaveCSS('background-color', 'rgb(209, 250, 229)');
  await expect(box).toContainText('صاحبِ نصاب');

  // Below Nisab -> not eligible. Go back and zero the assets out.
  await page.locator('#step-5 .top-back-btn').click();
  await page.locator('#step-4 .btn-prev').click();
  await page.locator('#step-3 .btn-prev').click();
  await page.locator('#v_gold').fill('1');
  await page.locator('#step-2 .btn-primary').click();
  await page.locator('#v_ds').fill('0');
  await page.locator('#step-3 .btn-primary').click();
  await page.locator('#step-4 .btn-primary').click();

  await expect(box).toHaveClass('is-not-eligible');
  await expect(box).toHaveCSS('background-color', 'rgb(254, 226, 226)');
  await expect(box).toContainText('نصاب سے کم');
});

test('advice-box accent leads the Urdu text it contains', async ({ page }) => {
  await goUrdu(page);
  await page.locator('.calc-hero-card').click();
  await page.locator('#s_rate').fill('3000');
  await page.locator('#step-1 .btn-primary').click();
  await page.locator('#step-2 .btn-primary').click();

  // These boxes always hold Urdu and pin direction:rtl, so their accent must
  // sit on the inline-start edge — the right — where the text begins. Using
  // border-left here would leave it trailing the text instead.
  const box = page.locator('#step-3 .advice-box-single-line').first();
  await expect(box).toHaveCSS('border-right-width', '4px');
  await expect(box).toHaveCSS('border-left-width', '0px');
});

test('shares fiqh accordion opens and cites its source', async ({ page }) => {
  await goUrdu(page);
  await page.locator('.calc-hero-card').click();
  await page.locator('#s_rate').fill('3000');
  await page.locator('#step-1 .btn-primary').click();

  const body = page.locator('#sharesFiqh');
  await expect(body).not.toBeVisible();

  await page.locator('.accordion-header', { hasText: 'حِصص' }).click();
  await expect(body).toBeVisible();

  // Both rulings and the citation must be present.
  await expect(body).toContainText('Fixed Assets');
  await expect(body).toContainText('Market Value');
  await expect(body).toContainText('مالِ تجارت');
  await expect(body.locator('.fiqh-source')).toContainText('مفتی منیب الرحمٰن');

  // At-a-glance summary leads, covering all three cases.
  await expect(body.locator('.fiqh-glance')).toContainText('آسان الفاظ میں');
  await expect(body.locator('.fiqh-glance .fiqh-case')).toHaveCount(3);

  // The published ruling is visually marked as a quotation, and attributed
  // before it rather than only after.
  await expect(body.locator('.fiqh-attrib')).toContainText('مفتی منیب الرحمٰن صاحب لکھتے ہیں');
  await expect(body.locator('blockquote.fiqh-quote .fiqh-source')).toBeVisible();

  // The 2.5% conclusion belongs to method 2, not to both methods.
  await expect(body.locator('.fiqh-summary ol li').nth(1)).toContainText('ڈھائی فیصد');

  // The quoted passage spells it Dividend.
  await expect(body).toContainText('Dividend');
  await expect(body).not.toContainText('Divident');

  // Summary follows the citation and lists both valuation methods.
  const summary = body.locator('.fiqh-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('خلاصہ');
  await expect(summary).toContainText('Listed');
  await expect(summary).toContainText('Unlisted Shares');
  await expect(summary).toContainText('درج اور موجود نہیں کیے گئے');   // owner's gloss
  await expect(summary.locator('ol li')).toHaveCount(2);
  await expect(summary).toContainText('Total Assets');
});

test('result screen re-renders its language-dependent parts on a switch', async ({ page }) => {
  // Calculate in English, then switch to Urdu while the result is on screen.
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#btnEn').click();
  await page.locator('.calc-hero-card').click();
  await page.locator('#g_date').fill('2026-08-25');
  await page.locator('#g_date').dispatchEvent('change');
  await page.locator('#s_rate').fill('3000');
  await page.locator('#step-1 .btn-primary').click();
  await page.locator('#step-2 .btn-primary').click();
  await page.locator('#step-3 .btn-primary').click();
  await page.locator('#step-4 .btn-primary').click();

  const hijri = page.locator('#rpt_date_hijri');
  await expect(hijri).toContainText('Rabi-I');

  await page.locator('#btnUr').click();

  // Must become Urdu; a stale English string here bidi-reorders on screen into
  // "Rabi-I 1448 AH11" with the digits drawn as Urdu glyphs.
  await expect(hijri).toContainText('ربیع الاول');
  await expect(hijri).not.toContainText('Rabi-I');
  await expect(page.locator('#elig_status_box')).toContainText('نصاب');
});
