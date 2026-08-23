# CLAUDE.md — Working Agreement for the Zakat Calculator

Read this before touching anything. It exists so each session starts aligned
instead of re-deriving conventions and getting them wrong.

Design conventions live in **DESIGN.md**. This file covers project invariants,
architecture, and the release workflow.

---

## 1. Hard constraints — never violate

### Islamic jurisprudence (fiqh) logic is frozen
The calculation logic, Nisab methodology, Zakat rates, and the receivables /
liabilities classification rules are a **matter of Islamic jurisprudence, not
engineering**. Do not change them, "improve" them, or refactor them into
something equivalent-looking. Presentation may change; the arithmetic and the
rules may not.

Specifically off-limits without an explicit instruction from the project owner:

| Value | Where | Meaning |
|---|---|---|
| `0.025` | `calculate()` | Zakat rate (2.5%) |
| `612.36` | `calcNisab()` | Nisab in grams of silver (52.5 tola) |
| `11.664` | `calcNisab()`, rate fetch | grams per tola |
| `31.1035` | `calcNisab()`, rate fetch | grams per troy ounce |
| `net >= nisabLimit` gate | `calculate()` | eligibility test |
| `payNow` / `payDef` split | `calculate()` | core vs receivables apportionment |
| Dayn qawī / mutawassiṭ / ḍaʿīf rules | step 3 markup | receivable classifications |

Rounding **for display** is fine (and is what `Math.ceil` is doing on the result
screen). Rounding inside the calculation is not.

### Storage key is frozen
```js
const STOR_KEY = 'z_history_v30';
```
Changing it silently destroys every saved record on every user's device. If the
stored shape must change, migrate in place — read the old shape, upgrade, write
back under the same key.

### Git identity
Commits are authored as `Claude <noreply@anthropic.com>`.
Never put a model name or identifier in a commit message, PR, or code comment.

---

## 2. Architecture

Single-file vanilla PWA. No framework, no build step, no bundler.

```
index.html   ~2700 lines — markup + <style> + <script>, the entire app
sw.js        service worker, cache-first
firebase.json  hosting config + security headers (CSP, HSTS, X-Frame-Options)
tests/       Playwright specs
```

**Screens** are five `#step-1` … `#step-5` divs plus `#home-screen`, toggled by
adding/removing `.hidden`. Overlays (`#historyModal`, `#histRatesModal`,
`#faqModal`) are `position: fixed` and sit *above* whatever screen is showing —
they do not change screen state.

**Language** is switched by `setLang(l)`, which sets:
```js
document.documentElement.dir  = l === 'ur' ? 'rtl' : 'ltr';
document.documentElement.lang = l === 'ur' ? 'ur'  : 'en';
```
All bilingual CSS keys off `html[lang="…"]` and `html[dir="…"]`. There is no
per-element language state — do not invent one.

---

## 3. Release workflow

1. Work on branch `claude/tender-keller-vmrapr`. Never push elsewhere without
   explicit permission.
2. **Whenever `index.html` markup changes, bump both:**
   - `CACHE_NAME` in `sw.js` (`zakat-calc-vNN` → `vNN+1`)
   - the footer version badge in `index.html` (`>vNN<`)

   Skipping this ships the change to a service worker that keeps serving the old
   cached markup, and the user reports "your fix didn't work."
3. Run `npm test` before every push. All specs must pass.
4. Push to `claude/tender-keller-vmrapr`; Firebase auto-deploys to
   <https://zakathisab.web.app>.

Do not open a pull request unless asked.

---

## 4. Testing

```bash
npm test          # full suite, chromium + mobile (Pixel 5)
```

Playwright is pinned to `1.40.0` against the pre-installed Chromium at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Do not run
`playwright install` and do not upgrade `@playwright/test` — newer versions
expect a browser revision that isn't in this image.

`tests/home.spec.js` covers navigation and overlays.
`tests/rtl.spec.js` covers bidirectional-text correctness — see DESIGN.md §2 for
why that file exists and what each check is guarding against.

**When you fix a visual or directional bug, add the regression test first.**
Historically these bugs were caught by the owner sending screenshots; every one
that reaches them is a test we failed to write.

---

## 5. Working style for this project

- The owner reviews on a **mobile phone in Urdu mode**. That is the primary
  surface. Check it first, not the desktop English view.
- Fix the *class* of bug, not the instance. If a bidi issue appears in one
  place, grep for the same pattern everywhere before reporting done.
- Prefer a CSS rule over an inline `style="…"`. Inline styles are how this
  codebase accumulated 95 ungovernable one-off decisions.
- Report honestly. If something is unverified, say so.

---

## 6. CI

Every push to `main` or `claude/tender-keller-vmrapr` runs the test suite
**before** Firebase deploys. The deploy job carries `needs: test`, so a failing
test means the live site is never touched and keeps serving the last good
version. Pull requests are gated the same way before a preview channel is
created.

CI also runs `scripts/check-cache-bump.sh`, which fails the build if
`index.html` changed without bumping both `CACHE_NAME` in `sw.js` and the
footer version badge — see §3. That rule is easy to forget and impossible to
notice, because the symptom is "the fix didn't work" rather than an error.

`playwright.config.js` points at the image's pre-installed Chromium only when
that path exists; on a CI runner it falls back to a browser Playwright installs
itself. Do not hardcode the path again.
