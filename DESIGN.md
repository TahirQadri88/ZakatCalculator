# DESIGN.md — Design System & Bidirectional Text Rules

The app is bilingual English / Urdu, and the primary audience reads it in
**Urdu, on a phone, right-to-left**. Nearly every visual bug this project has
had was a direction bug, not a taste bug. §2 is therefore the most important
section in this file.

---

## 1. Design principles

**Intentionality.** Every visual decision should be deliberate. If you can't say
why a value is what it is, it's probably a default that snuck in.

**Hierarchy first.** The Zakat result is the most important thing on the result
screen and should dominate it. Field labels support inputs; they don't compete
with them.

**Restraint.** This is a religious-obligation calculator for a broad audience.
It should read as calm, trustworthy, and uncluttered — not vibrant or playful.
Fewer colors, fewer sizes, fewer effects.

**Systems over one-offs.** A new inline `style="…"` is a decision no rule can
govern. Add a class. Reuse a token.

**Respect the script.** Nastaliq is not Latin type with different glyphs. It
needs more vertical room, no letter-spacing, and larger optical sizing.

---

## 2. Bidirectional text — the rules that keep getting broken

Every rule below exists because it was violated and shipped.

### 2.1 Never `transform` a bidi-mirrored glyph
Characters like `›` `‹` `«` `»` `(` `)` are in Unicode's **bidi-mirrored** class.
The browser flips them automatically inside `dir="rtl"`. Adding
`transform: scaleX(-1)` flips them *back*, producing an arrow pointing the wrong
way.

```css
/* WRONG — cancels the browser's own mirroring */
html[dir="rtl"] .card-arrow { transform: scaleX(-1); }

/* RIGHT — do nothing, it already mirrors */
```

### 2.2 Never `row-reverse` inside `dir="rtl"`
`flex-direction: row` in an RTL container **already** flows right-to-left.
Adding `row-reverse` reverses the reversal and puts everything back on the wrong
side.

```css
/* WRONG */
html[dir="rtl"] .calc-hero-card { flex-direction: row-reverse; }

/* RIGHT — `row` is already correct in RTL */
```

### 2.3 Isolate every English run inside Urdu context
An unisolated Latin/digit run in an RTL paragraph gets reordered by the Unicode
bidi algorithm. `1947 – 2019 · Source: Daily Jang` renders as
`Source: Daily Jang · 2019 – 1947`.

```html
<!-- WRONG -->
<div>1947 – 2019 · Source: Daily Jang</div>

<!-- RIGHT -->
<div><bdi>1947 – 2019 · Source: Daily Jang</bdi></div>
```

Applies to: dates, year ranges, currency amounts, source credits, version
strings, URLs, anything with digits and Latin mixed together.

For mixed-direction *lines* built from two runs (e.g. Gregorian + Hijri date),
give each its own element with an explicit `direction` and
`unicode-bidi: isolate` rather than concatenating into one string.

### 2.4 `start`/`end`, not `right`/`left`
Use logical properties so the layout follows direction automatically.

| Use | Not |
|---|---|
| `text-align: start` / `end` | `text-align: left` / `right` |
| `margin-inline-start` | `margin-left` |
| `padding-inline-end` | `padding-right` |
| `border-inline-start` | `border-left` |
| `inset-inline-start` | `left` |

Watch the *value*, not just the property: in RTL, `end` means **left**. A title
that should hug a right-hand icon wants `start`, not `end`.

The exception is content that is intrinsically LTR regardless of UI language —
`input[type="date"]` must stay `direction: ltr`.

### 2.5 Toasts and injected strings
Translation strings contain markup (`<bdi>…</bdi>`). `msg()` uses `innerHTML`
so those render. Never switch it to `innerText`/`textContent` — the tags appear
as literal text on screen.

The converse: never pass untrusted or user-entered text through `innerHTML`.
User-supplied values (the name field) go through `innerText`.

---

## 2.6 Extracting an inline style can *change* the rendering

An inline `style="…"` beats every selector except `!important`. So an inline
declaration may be silently overriding a conflicting rule elsewhere in the
sheet — and moving it into a class hands the win to that other rule.

This happened with `#nisabVal`. The stylesheet said `1.8rem/900`; the inline
style said `1.6rem/800`. The inline won, so `1.6rem` is what users saw. Lifting
those declarations into a class let the **ID** rule take over, the number grew,
and everything below it shifted down the page.

Before extracting, grep for the element's id and classes to find competing
rules. When one exists, fold the values that were actually rendering into that
rule rather than adding a weaker class beside it. An ID selector will always
outrank the class you just wrote.

This is exactly why the visual baselines exist — run `npm run test:visual`
after every extraction batch.

---

## 3. Tokens

Defined in `:root` in `index.html`. **Use the variable, not the hex.**

### Color
| Token | Value | Use for |
|---|---|---|
| `--primary` | `#064E3B` | primary green; field labels, headings, key UI |
| `--primary-dark` | `#043629` | headers, panels |
| `--primary-light` | `#ECFDF5` | tinted backgrounds, hover |
| `--accent` | `#C5A059` | gold; the Zakat amount, emphasis |
| `--accent-dark` | `#A07840` | gold hover/border |
| `--label-gold` | `#B45309` | English field labels |
| `--slate` | `#1F2937` | body text |
| `--text-muted` | `#6B7280` | secondary text, **placeholders** |
| `--bg` | `#F3F4F6` | page background |
| `--white` | `#FFFFFF` | cards |
| `--border` | `#E5E7EB` | dividers, card borders |
| `--danger` | `#991B1B` | **liabilities and errors only** |
| `--danger-light` | `#FEF2F2` | error backgrounds |
| `--blue` / `--blue-light` | `#1E40AF` / `#EFF6FF` | receivables |

**`--danger` carries meaning.** It marks money owed or something wrong. It was
once used for all Urdu field labels, which made an ordinary form look like a
page of errors. Normal labels are `--primary`.

### Type
| Token | Stack |
|---|---|
| `--font-english` | `'Outfit', system-ui, sans-serif` |
| `--font-urdu` | `'Mehr Nastaleeq', 'Noto Nastaliq Urdu', 'Scheherazade New', serif` |

Arabic scripture (the Bismillah) uses **Scheherazade New** — it is Arabic, not
Urdu, and should not render in Nastaliq.

Sizing:
- Urdu runs roughly **0.1–0.15rem larger** than English at the same rank; Nastaliq
  is optically smaller.
- `line-height` **≥ 1.5** on any Urdu text — Nastaliq descenders clip below that.
- **Never** apply `letter-spacing` to Urdu or Arabic. It breaks the cursive join.

### Shape & depth
`--radius: 10px` · `--shadow-sm` · `--shadow-md`. Cards use `--shadow-sm`;
overlays and the hero CTA go heavier.

---

## 4. Accessibility floor

- Body and label text ≥ 4.5:1 against its background.
- Placeholders use `--text-muted` (`#6B7280`) at `opacity: 1`. Browser-default
  placeholder grey is too faint on a phone outdoors — that was a real bug.
- Tap targets ≥ 44×44 px.
- Every overlay closes three ways: X button, backdrop click, `Escape`.
- Overlays lock body scroll on open and restore it on close.

---

## 5. Before you call a visual change done

1. Look at it **in Urdu, at phone width**. That's the primary surface.
2. Grep for the same pattern elsewhere in the file — these bugs travel in packs.
3. Add or extend a test in `tests/rtl.spec.js`.
4. Bump `CACHE_NAME` in `sw.js` and the footer version badge, or the fix won't
   reach anyone.

---

## 6. Known debt

Tracked honestly so it isn't rediscovered as a surprise:

- ~~inline `style="…"` attributes~~ — **done.** All 95 extracted into classes;
  `index.html` now has zero. Keep it that way: add a class, not an attribute.
- ~45 physical `text-align: left/right` vs ~5 logical `start/end`; no
  `margin-inline`/`padding-inline`/`border-inline` anywhere yet.
- 48 distinct hex literals against 21 tokens — the token system is bypassed.
- 54 distinct `font-size` values; there is no formal type scale.

Migrating these is safe, mechanical, and covered by both the functional suite
and the visual baselines. Do it opportunistically when touching a region —
don't do a big-bang refactor.
