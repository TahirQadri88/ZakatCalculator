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
      // className on an SVG element is an SVGAnimatedString, not a string, so
      // read the attribute - otherwise a failure prints an unreadable "{}".
      .map(el => `${el.tagName.toLowerCase()}.${el.getAttribute('class') || '(none)'}`);
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
  await expect(label).toHaveCSS('color', 'rgb(12, 74, 85)');   // --primary
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
  await expect(box).toHaveCSS('background-color', 'rgb(213, 236, 235)');
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

test('rate-source line and history re-render on a language switch', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#btnEn').click();
  await page.locator('.calc-hero-card').click();

  // fetchSilverRate writes #rateSourceInfo in the active language. Offline this
  // takes the "no historical data" branch, which is language-dependent too.
  await page.locator('#g_date').fill('2024-08-01');
  await page.locator('#g_date').dispatchEvent('change');
  await page.evaluate(() => fetchSilverRate());
  const info = page.locator('#rateSourceInfo');
  await expect(info).toContainText('Aug 2024');

  await page.locator('#btnUr').click();
  // Both the sentence and the date inside it must convert.
  await expect(info).not.toContainText('Aug 2024');
  await expect(info).toContainText('اگست');

  // The empty-history message is bilingual and refreshes while the modal is open.
  await page.evaluate(() => { setLang('en'); openHistory(); });
  // useInnerText: the hidden sibling span counts toward textContent.
  const hist = page.locator('#history_list');
  await expect(hist).toHaveText('No records.', { useInnerText: true });
  await page.evaluate(() => setLang('ur'));
  await expect(hist).toHaveText('کوئی ریکارڈ محفوظ نہیں۔', { useInnerText: true });
});

test('Nisab is shown whole, never below its true value, and compared exactly', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#btnEn').click();
  await page.locator('.calc-hero-card').click();

  // Per-10g at 5942 gives 363864.312 — a fractional threshold whose .312 would
  // round DOWN. With tola the figure is always rate x 52.5, i.e. .0 or .5, so
  // it cannot exercise this at all.
  await page.locator('#s_unit').selectOption('10g');
  await page.locator('#s_rate').fill('5942');
  await page.locator('#s_rate').dispatchEvent('input');

  const exact = await page.evaluate(() => nisabLimit);
  expect(exact % 1).toBeGreaterThan(0);
  expect(exact % 1).toBeLessThan(0.5);          // the case round() gets wrong

  // Strip thousands separators, then take the trailing number — the currency
  // prefix "Rs." would otherwise contribute its dot as a decimal point.
  const shownText = (await page.locator('#nisabVal').innerText()).replace(/,/g, '');
  const shown = Number(shownText.match(/([\d.]+)\s*$/)[1]);
  expect(shown % 1).toBe(0);                     // whole, like every other amount
  expect(shown).toBeGreaterThanOrEqual(exact);   // never below the real bar
  expect(shown - exact).toBeLessThan(1);         // and never more than a rupee above

  // Wealth at floor(exact) is under the true threshold. If the gate ever read a
  // rounded figure instead, this would come back eligible.
  await page.locator('#step-1 .btn-primary').click();
  await page.locator('#v_gold').fill(String(Math.floor(exact)));
  await page.locator('#step-2 .btn-primary').click();
  await page.locator('#step-3 .btn-primary').click();
  await page.locator('#step-4 .btn-primary').click();
  await expect(page.locator('#elig_status_box')).toHaveClass('is-not-eligible');
  await expect(page.locator('#r_nisab')).not.toHaveText(/\.\d/);
});

test('a whole-number threshold is not pushed up by float noise', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('#btnEn').click();
  await page.locator('.calc-hero-card').click();
  // 3000/tola is exactly 157500, but the float lands on 157500.00000000003.
  await page.locator('#s_rate').fill('3000');
  await page.locator('#s_rate').dispatchEvent('input');
  await expect(page.locator('#nisabVal')).toContainText('157,500');
  await expect(page.locator('#nisabVal')).not.toContainText('157,501');
});

test('icon sprite is out of layout but its icons still render', async ({ page }) => {
  await goUrdu(page);

  // The sprite is a definitions block, not content. If it ever re-enters
  // layout it shows up as phantom overflow — which is how it first broke CI.
  await expect(page.locator('#icon-sprite')).toHaveCSS('display', 'none');

  // But <use> must still resolve from the hidden host: every icon on screen
  // needs a real box, or we have shipped invisible buttons.
  const boxes = await page.locator('.card-icon svg.icon').evaluateAll(
    els => els.map(el => el.getBoundingClientRect()).map(r => [r.width, r.height])
  );
  expect(boxes.length).toBeGreaterThanOrEqual(4);
  for (const [w, h] of boxes) {
    expect(w).toBeGreaterThan(8);
    expect(h).toBeGreaterThan(8);
  }
});

test('result: breakdown is folded away, answer and note stay visible, Save is the only filled action', async ({ page }) => {
  await goUrdu(page);
  await calculateInUrdu(page);

  // The answer and the fiqh note are always on screen.
  await expect(page.locator('#r_total')).toBeVisible();
  await expect(page.locator('#step-5 .advice-box-single-line')).toBeVisible();

  // The breakdown is behind a disclosure and opens on tap.
  const details = page.locator('#resultDetails');
  await expect(details).not.toBeVisible();
  await page.locator('.result-details-toggle').click();
  await expect(details).toBeVisible();
  await expect(page.locator('#r_net')).toBeVisible();

  // One filled button; Edit and Home are quiet text links.
  await expect(page.locator('#step-5 .result-actions .btn-primary')).toHaveCount(1);
  await expect(page.locator('#step-5 .result-links .link-btn')).toHaveCount(2);

  // The status is a slim pill, not a full-width banner.
  const w = await page.locator('#elig_status_box').evaluate(el => el.getBoundingClientRect().width);
  const vw = await page.evaluate(() => document.documentElement.clientWidth);
  expect(w).toBeLessThan(vw * 0.85);
});

// The narrowest phones still in use. A header that needed ~349px pushed the
// whole page sideways at 320px in English; it had gone unnoticed because every
// other check ran at 393-412px.
for (const lang of ['en', 'ur']) {
  test(`no horizontal scroll on any screen at 320px (${lang})`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.locator(lang === 'ur' ? '#btnUr' : '#btnEn').click();

    const over = () => page.evaluate(() => {
      const d = document.documentElement;
      return Math.max(0, d.scrollWidth - d.clientWidth);
    });

    expect(await over(), 'home').toBe(0);
    await page.locator('.calc-hero-card').click();
    expect(await over(), 'step 1').toBe(0);
    await page.locator('#s_rate').fill('3000');
    await page.locator('#s_rate').dispatchEvent('input');
    await page.locator('#step-1 .btn-primary').click();
    expect(await over(), 'step 2').toBe(0);
    await page.locator('#v_gold').fill('5000000');
    await page.locator('#step-2 .btn-primary').click();
    expect(await over(), 'step 3').toBe(0);
    await page.locator('#v_ds').fill('1232344');
    await page.locator('#step-3 .btn-primary').click();
    expect(await over(), 'step 4').toBe(0);
    await page.locator('#l_per').fill('250000');
    await page.locator('#step-4 .btn-primary').click();
    expect(await over(), 'result').toBe(0);
  });
}

test('controls meet the touch floor on a 360px phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await goUrdu(page);
  await page.locator('.calc-hero-card').click();
  const h = sel => page.locator(sel).first().evaluate(el => el.getBoundingClientRect().height);
  expect(await h('#btnUr')).toBeGreaterThanOrEqual(32);          // was 20px
  expect(await h('#step-1 .top-back-btn')).toBeGreaterThanOrEqual(40);   // was 27px
  expect(await h('.adj-btn')).toBeGreaterThanOrEqual(40);         // was 32px
  expect(await h('#step-1 .btn-primary')).toBeGreaterThanOrEqual(44);
  expect(await h('#step-1 .accordion-header')).toBeGreaterThanOrEqual(44);
  // Stepper labels were 10.4px.
  const fs = await page.locator('.prog-label').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(fs).toBeGreaterThanOrEqual(11.5);
});

test('only the step bar stays pinned while scrolling a step', async ({ page }) => {
  // The whole header used to stay pinned: 189px, 26% of a 360x740 phone.
  await page.setViewportSize({ width: 360, height: 740 });
  await goUrdu(page);
  await page.locator('.calc-hero-card').click();
  await page.locator('#s_rate').fill('3000');
  await page.locator('#s_rate').dispatchEvent('input');
  await page.locator('#step-1 .btn-primary').click();

  const pinned = () => page.evaluate(() =>
    Math.max(0, document.querySelector('header').getBoundingClientRect().bottom));

  expect(await pinned()).toBeGreaterThan(150);          // full header at the top
  await page.evaluate(() => window.scrollTo(0, 700));
  await expect.poll(pinned).toBeLessThan(80);            // just the step bar
  await expect(page.locator('#progressBarWrap')).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(pinned).toBeGreaterThan(150);        // title and toggle return
});

test('desktop: steps use two aligned columns and accordions open from the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await goUrdu(page);
  await page.locator('.calc-hero-card').click();
  await page.locator('#s_rate').fill('3000');
  await page.locator('#s_rate').dispatchEvent('input');
  await page.locator('#step-1 .btn-primary').click();

  // Two columns, and every input in a column shares one left and right edge.
  const edges = await page.evaluate(() => {
    const ins = [...document.querySelectorAll('#step-2 > .field-card > input')].map(e => e.getBoundingClientRect());
    return { lefts: new Set(ins.map(r => Math.round(r.left))).size, rights: new Set(ins.map(r => Math.round(r.right))).size };
  });
  expect(edges.lefts).toBe(2);
  expect(edges.rights).toBe(2);

  // Clickable divs are reachable and operable without a mouse.
  const acc = page.locator('#step-2 .accordion-header').first();
  await expect(acc).toHaveAttribute('tabindex', '0');
  await expect(acc).toHaveAttribute('role', 'button');
  await acc.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#priceDef')).toBeVisible();
});

test('step inputs meet the 48px comfort height', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.locator('.calc-hero-card').click();
  const hs = await page.locator('#step-1 .field-card > input').evaluateAll(els => els.filter(e => e.offsetParent).map(e => e.getBoundingClientRect().height));
  expect(Math.min(...hs)).toBeGreaterThanOrEqual(48);
});

// ── Owner's phone screenshot, English result screen ──────────────────────────
async function toResultEn(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.calc-hero-card').click();
  await page.locator('#s_rate').fill('3000');
  await page.locator('#s_rate').dispatchEvent('input');
  await page.locator('#step-1 .btn-primary').click();
  await page.locator('#v_gold').fill('5000000');
  for (const s of [2, 3, 4]) await page.locator(`#step-${s} .btn-primary`).click();
  await expect(page.locator('#step-5')).toBeVisible();
}

test('English Hijri date on the result reads day first, not "… AH 3"', async ({ page }) => {
  await toResultEn(page);
  const el = page.locator('#rpt_date_hijri');
  const text = await el.innerText();
  const day = text.match(/^\d+/)[0];
  // The day must be painted to the left of the month name.
  const [dayX, monthX] = await el.evaluate((e, day) => {
    const t = e.firstChild, r = document.createRange();
    r.setStart(t, 0); r.setEnd(t, day.length); const a = r.getBoundingClientRect().left;
    r.setStart(t, day.length + 1); r.setEnd(t, day.length + 3); const b = r.getBoundingClientRect().left;
    return [a, b];
  }, day);
  expect(dayX).toBeLessThan(monthX);
});

test('step bar dots are evenly spaced whatever the label widths', async ({ page }) => {
  for (const lang of ['en', 'ur']) {
    await toResultEn(page);
    if (lang === 'ur') await page.locator('#btnUr').click();
    const xs = await page.locator('.prog-dot').evaluateAll(d => d.map(e => { const r = e.getBoundingClientRect(); return r.left + r.width / 2; }));
    const gaps = xs.slice(1).map((x, i) => Math.abs(x - xs[i]));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(2);
  }
});

test('result "Financial summary" toggle reads left-to-right in English', async ({ page }) => {
  await toResultEn(page);
  const h = page.locator('.result-details-toggle');
  const box = await h.boundingBox();
  const label = await h.locator('span.en').boundingBox();
  expect(label.x - box.x).toBeLessThan(box.x + box.width - (label.x + label.width));
});

test('Urdu result date line reads label, date, then Hijri from the right', async ({ page }) => {
  await toResultEn(page);
  await page.locator('#btnUr').click();
  const x = async s => { const b = await page.locator(s).boundingBox(); return b.x + b.width / 2; };
  const label = await x('.report-dateline span.ur');
  const greg = await x('#rpt_date_greg');
  const hijri = await x('#rpt_date_hijri');
  expect(label).toBeGreaterThan(greg);
  expect(greg).toBeGreaterThan(hijri);
});

test('English asides inside Urdu blocks use the English font', async ({ page }) => {
  await goUrdu(page);
  const fams = await page.evaluate(() => [...document.querySelectorAll('.urdu-subtitle, .urdu-body')]
    .filter(e => /^[\x00-\x7F]+$/.test(e.textContent.trim()) && e.textContent.trim())
    .map(e => [e.textContent.trim().slice(0, 25), getComputedStyle(e).fontFamily.split(',')[0]]));
  expect(fams.length).toBeGreaterThan(0);
  for (const [t, f] of fams) expect(f, t).toContain('Outfit');
});

test('records title does not run under the close button in Urdu', async ({ page }) => {
  await goUrdu(page);
  await page.evaluate(() => openHistory());
  const t = await page.locator('.hist-modal-header .urdu-label-main').boundingBox();
  const c = await page.locator('.close-modal').boundingBox();
  const overlap = t.x < c.x + c.width && c.x < t.x + t.width && t.y < c.y + c.height && c.y < t.y + t.height;
  expect(overlap).toBe(false);
});

test('typography: Urdu text uses an Urdu face, English glosses the English face, Nastaliq has room', async ({ page }) => {
  await goUrdu(page);
  await page.locator('.calc-hero-card').click();
  await page.locator('#s_rate').fill('3000');
  await page.locator('#s_rate').dispatchEvent('input');
  const issues = await page.evaluate(() => {
    const AR = /[؀-ۿ]/, URDU = /Mehr|Nastaliq|Gulzar|Scheherazade|Amiri/i, out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!el.offsetParent) continue;
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
      if (!own) continue;
      const cs = getComputedStyle(el), fam = cs.fontFamily;
      if (AR.test(own) && !/[A-Za-z]{3,}/.test(own) && !URDU.test(fam)) out.push('latin face: ' + own.slice(0, 20));
      if (AR.test(own) && parseFloat(cs.letterSpacing) > 0) out.push('letter-spacing: ' + own.slice(0, 20));
    }
    for (const h of document.querySelectorAll('#step-1 .accordion-header, #step-1 .sub-acc-header')) {
      const cs = getComputedStyle(h);
      if (h.offsetParent && parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) < 1.6) out.push('tight: ' + h.textContent.trim().slice(0, 20));
    }
    return out;
  });
  expect(issues).toEqual([]);
  // Urdu spelling uses Urdu letters (ک ۃ ی), not Arabic look-alikes (ك ة ي).
  const arabicForms = await page.evaluate(() => (document.body.innerText.match(/[كةي]/g) || []).length);
  expect(arabicForms).toBe(0);
});

test('no English sentence is laid out right-to-left in Urdu mode (punctuation would jump ends)', async ({ page }) => {
  await goUrdu(page);
  const scan = () => page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => {
    if (!el.offsetParent) return false;
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').trim();
    return own.length > 12 && /[A-Za-z]{3,}/.test(own) && /[.,:)%]\s*$|\(/.test(own) &&
      !/[؀-ۿ]/.test(own) && getComputedStyle(el).direction === 'rtl';
  }).map(el => (el.getAttribute('class') || el.tagName) + ': ' + el.textContent.trim().slice(0, 30)));
  const found = new Set((await scan()));
  await page.locator('.calc-hero-card').click();
  await page.locator('#s_rate').fill('3000');
  await page.locator('#s_rate').dispatchEvent('input');
  await page.locator('.read-first-btn').click();
  (await scan()).forEach(x => found.add(x));
  for (const s of [1, 2, 3, 4]) {
    await page.locator(`#step-${s} .btn-primary`).click();
    (await scan()).forEach(x => found.add(x));
  }
  await page.locator('.result-details-toggle').click();
  (await scan()).forEach(x => found.add(x));
  expect([...found]).toEqual([]);
});

test('accordion headings keep their label as one piece (no stray flex items)', async ({ page }) => {
  await goUrdu(page);
  // A flex header lays each child out separately; an inline <bdi> as a direct
  // child pushed "(Shares)" to the middle of the bar.
  const bad = await page.evaluate(() => [...document.querySelectorAll('.accordion-header, .sub-acc-header')]
    .filter(h => [...h.children].some(c => getComputedStyle(c).display === 'inline' || c.tagName === 'BDI'))
    .map(h => h.textContent.trim().slice(0, 30)));
  expect(bad).toEqual([]);
});

test('step 3 Urdu names sit above their boxes, as labels, box at full width', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await goUrdu(page);
  await page.locator('.calc-hero-card').click();
  await page.locator('#s_rate').fill('3000');
  await page.locator('#s_rate').dispatchEvent('input');
  await page.locator('#step-1 .btn-primary').click();
  await page.locator('#step-2 .btn-primary').click();
  const rows = await page.evaluate(() => [...document.querySelectorAll('#step-3 .field-card')].map(card => {
    const name = card.querySelector(':scope > .urdu-subtitle'), box = card.querySelector(':scope > input');
    if (!name || !box) return null;
    const n = name.getBoundingClientRect(), b = box.getBoundingClientRect(), cs = getComputedStyle(name);
    return { t: name.textContent.trim().slice(0, 20), above: n.bottom <= b.top + 1,
      lines: Math.round(n.height / parseFloat(cs.lineHeight)), fullWidth: b.width > 280, size: parseFloat(cs.fontSize) };
  }).filter(Boolean));
  expect(rows.length).toBe(6);
  for (const r of rows) {
    expect(r.above, r.t).toBe(true);
    expect(r.lines, r.t).toBeLessThanOrEqual(2); // 1 with Mehr; the test fallback face is wider
    expect(r.fullWidth, r.t).toBe(true);
    expect(r.size, r.t).toBeGreaterThanOrEqual(14);
  }
});
