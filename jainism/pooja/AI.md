# Jaina Pooja FAQ — Current State & Requirements

This document captures the current design decisions in this codebase, and
the requirements for what's still planned but not yet built — intended for
committing alongside the code so future contributors (human or AI) understand
the intent behind each choice, and don't have to guess what's implemented
versus aspirational.

Everything under **"Current State"** exists and is tested today. Everything
under **"Future / Planned"** does not exist yet — it's design intent only,
not a description of present behaviour.

---

## Directory Structure

```
jainism/pooja/
├── index.html, data.json, schema.json, images/
├── app.js                      ← entry point; composes everything below
├── core/                       ← shared by every view
│   ├── blocks.js                 (ID formatting, reference resolution, block indexing)
│   ├── langs.js                  (KNOWN_LANGS — supported languages)
│   ├── media.js / media.css      (video/QR utilities + styles)
│   ├── read-tracking.js / .css   (read/unread state, incl. isBlockTrackable)
│   ├── card-types.css            (card/block colour coding)
│   ├── settings.js               (the one unified `settings` object — schema/validation)
│   ├── layout-signal.js          (`pooja:layout-changed` event — see Paper Size & Font Scaling)
│   ├── paper-size.js / (css lives per-view, see below)  (Dynamic/A4/A3 setting)
│   └── font-scale.js / font-scale.css                   (font-size multiplier setting)
├── header/
│   └── header.js / header.css / header.test.js  ← header UI only (settings dropdown,
│       lang picker, toggle wiring); the settings it toggles live in core/, see below
├── views/
│   ├── continuous/
│   │   └── continuous-view.js / .css / .test.js
│   └── book/
│       └── book-view.js / .css / .test.js
├── test/e2e/                   ← Playwright, mirrors views/ (see below)
│   ├── book/                     (book-view.test.js, book-view-print.test.js,
│   │                              book-view-screenshots.test.js + -snapshots/,
│   │                              book-print-regressions.test.js)
│   ├── continuous/                (continuous-view-print.test.js,
│   │                              continuous-view-screenshots.test.js + -snapshots/,
│   │                              language-filter.test.js, media-visibility.test.js,
│   │                              read-tracking.test.js, reply-excerpt.test.js,
│   │                              site-preview.spec.js)
│   └── core/                     (paper-size-font-scale.test.js, zen-mode.test.js —
│                                  header-level features exercised across both views)
├── data.test.js                ← validates data.json against schema.json
├── babel.config.js, playwright.config.js, package.json
└── AI.md, README.md
```

Grouped by feature (`core/`, `header/`, `views/<name>/`) rather than by file
type (no `src/`) — deliberately: this is a no-build static site shipped as
raw ES modules straight to the browser via `<script type="module">`, and
`src/` is a bundler-project convention that would misleadingly imply a build
step exists. The by-feature grouping instead mirrors how the code is
actually reasoned about: a shared layer, plus one folder per view.

**Deleting or adding a view should cost exactly one folder, not a hunt
through mixed-concern files.** This is true on both sides now:
- *Source*: `book-view.js` and `continuous-view.js` never import from each
  other — only `app.js` (the composition root) imports from both (see
  **Module boundaries** below for the history of this). Removing
  `views/book/` entirely means deleting that folder plus book-related
  lines in `app.js` and `index.html` (one file each, not a search across
  the codebase) — nothing under `core/` or `header/` references book view
  by name.
- *Tests*: `test/e2e/` mirrors `views/` for exactly this reason —
  `test/e2e/book/` holds every book-view-specific Playwright test,
  `test/e2e/continuous/` every continuous-view-specific one. Deleting
  `views/book/` means deleting `test/e2e/book/` too, full stop — no
  book-view assertions live outside that folder. `test/e2e/core/` is the
  deliberate exception: paper size, font scale, and zen mode are
  header-level settings whose effect spans both views by design, so their
  tests legitimately need to exercise both in one file rather than being
  split in a way that would just duplicate setup — same reasoning as
  `core/` existing alongside `views/` on the source side. Playwright's
  default `testMatch` already recursively discovers tests in subfolders,
  so this reorganization needed no `playwright.config.js` changes.

  **Getting this categorization right took a second pass.**
  `read-tracking.test.js` and `language-filter.test.js` initially landed
  in `continuous/` because that's the only view their test bodies happened
  to exercise at the time — the wrong test for the job. Most of what they
  actually verify (localStorage persistence of read state, the Settings
  visibility toggle, the base print CSS rule, the language-picker's
  trigger/search/"at least one active"/persistence/click-outside behavior)
  is the shared `header.js`/`core/read-tracking.js` mechanism itself, not
  continuous-view rendering — it's the exact same DOM and code regardless
  of which view happens to be showing, with continuous view used only as
  the simplest vehicle to reach it. Deleting `continuous/` would have
  silently deleted that coverage, with nothing under `book/` filling the
  gap (book view's own tests only ever checked its own rendering
  reaction, never the shared mechanism underneath). Split: the
  mechanism/settings tests moved to `test/e2e/core/read-tracking.test.js`
  and `test/e2e/core/language-filter.test.js`; each `continuous/` file
  kept only the tests that actually exercise continuous-specific
  rendering (progress-counter updates, sibling-block independence, column
  removal on a language change, continuous's own print rendering).
  `media-visibility.test.js` was checked against the same question and
  found to genuinely belong in `continuous/` — its tests exercise
  `.image-card`, a class that exists only in `continuous-view.js`; book
  view's media-visibility has its own separate tests in `book/`.
  The test: would this test still make sense, unchanged, if the *other*
  view didn't exist? If yes, it's testing something shared and belongs in
  `core/`; if the assertions are about that view's own specific markup or
  behavior, it belongs with that view.

`header/` is kept deliberately thin — it's specifically the header **UI**
(the settings dropdown, the lang picker, wiring the toggle controls), not a
place for cross-cutting logic to accumulate just because its control lives
in the header. A setting whose *effect* is used/rendered across views
belongs in `core/` even though `header.js` wires its control — same
precedent as `read-tracking.js` (its checkbox lives in `header.js`, but the
actual read/unread logic and `updateProgressDisplay()` live in `core/`).
Paper size and font scale followed an earlier, wrong instinct of nesting
them under `header/` since that's where their controls are — moved to
`core/` once that mismatch was noticed, matching `read-tracking.js`'s
precedent instead.

Every module resolves its own imports with relative paths (`../../core/x.js`
etc.) — there's no bundler to abstract that away, so adding a new file or
moving one means updating every path that touches it by hand. Verified by a
static check (every `import`/`require`/`<link>`/`<script src>` path resolves
to a real file) as part of building this structure.

---

## File Structure & Responsibility

| File | Responsibility | Status |
|---|---|---|
| `app.js` | Entry point; composes modules; owns `setViewMode()` | ✅ Current |
| `header/header.js` | Settings dropdown, lang picker, media/read-tracking toggle wiring | ✅ Current |
| `views/continuous/continuous-view.js` | Continuous scroll view rendering (verbatim from original `script.js`) | ✅ Current |
| `views/book/book-view.js` | Book spread view: pagination (CSS columns), card creation, navigation | ✅ Current |
| `core/blocks.js` | Pure data-model helpers: `formatIdForDisplay`, `buildBlockIndex`, `resolveReference` — shared by both views | ✅ Current |
| `core/langs.js` | `KNOWN_LANGS` — single source of truth for supported languages | ✅ Current |
| `core/media.js` | Video/QR utilities (`createVideoCard`, `extractYouTubeId`, `escapeHtml`, `linkify`, etc.) | ✅ Current |
| `core/read-tracking.js` | Pure read/unread state functions, incl. `isBlockTrackable` — shared by both views | ✅ Current |
| `core/settings.js` | The one unified `settings` object — schema, defaults, validation (`loadSettings`/`saveSettings`) for every persisted preference | ✅ Current |
| `core/layout-signal.js` | `notifyLayoutChanged()` — tells book view to re-measure pagination when a layout-affecting setting changes outside a window resize | ✅ Current |
| `core/paper-size.js` | Paper size (Dynamic/A4/A3): applies `body[data-paper-size]` + the printed `@page` rule, wires the Settings `<select>` | ✅ Current |
| `core/font-scale.js` | Font-size scaling multiplier: applies `--font-scale`, wires the increase/decrease control | ✅ Current |
| `core/card-types.css` | Card type colours — single source of truth for both views | ✅ Current |
| `core/font-scale.css` | `:root { --font-scale: 1 }` — single source of truth read by both screen and `@media print` rules in both views | ✅ Current |
| `header/header.css` | App header, search bar, settings dropdown, view toggle, lang picker, paper-size/font-scale control chrome | ✅ Current |
| `views/continuous/continuous-view.css` | Card layout, block rows, excerpts — scoped to `#continuous-container`; also the paper-size width cap and font-scale sizing for this view's content | ✅ Current |
| `views/book/book-view.css` | Book spread layout, pages, cards, nav, print reflow — scoped to `#book-container`; also the paper-size physical width and font-scale sizing for this view's content | ✅ Current |
| `core/media.css` | Video/QR/image styles — scoped to `#continuous-container` (continuous view only; book view has its own media styles inline in `book-view.css`) | ✅ Current |
| `core/read-tracking.css` | Read tick and progress counter styles | ✅ Current |

### Module boundaries (why things live where they do)
- `blocks.js` and `langs.js` were extracted specifically so `book-view.js`
  wouldn't have to import from `continuous-view.js`/`header.js` directly, or
  duplicate its own copies. Before this, `book-view.js` defined its own
  `KNOWN_LANGS` (which `header.js` then imported *from* `book-view.js` — an
  inverted dependency) and imported `formatIdForDisplay`/`resolveReference`
  straight out of `continuous-view.js`. Both fixed as part of the book-view
  merge: `book-view.js` now imports from `core/` like everything else, and
  no longer defines or re-exports `KNOWN_LANGS` at all (it never actually
  used the constant internally — `activeLangs` always arrives as a
  parameter — it was only there to be the thing `header.js` pulled from).
- `read-tracking.js`'s `isBlockTrackable(block)` is the single place that
  decides whether a block gets a read-tick at all — both views call this
  rather than each re-deriving the rule (see **Read Tracking** below).
- `card-types.css` needs **no container-id scoping** (e.g.
  `#continuous-container .card.X`) — continuous view's `.card`/`.block-row`
  and book view's `.book-card` are already distinct class names, so there's
  nothing to collide. An earlier draft of this file did add that scoping;
  removed as unnecessary complexity once actually checked against the real
  class names in use.
- `settings.js` / `paper-size.js` / `font-scale.js` / `layout-signal.js`
  live in `core/`, not `header/` — see the note under **Directory
  Structure** above. `header.js` imports and re-exports all of them so
  `app.js` still has one import path (`./header/header.js`) for everything
  header-related; it doesn't need to know these live in `core/` internally.
- `paper-size.js`/`font-scale.js` each import `loadSettings`/`saveSettings`
  from `settings.js` rather than reading `localStorage` directly — same
  "one unified object" rule as everything else (see **Settings
  Persistence**). `settings.js` itself has no dependency on either of
  them — it owns the schema; they own how their one field is applied.

---

## Views

### Continuous View — ✅ Current
- Verbatim rendering logic from the original `script.js`, refactored into ES
  modules with no behaviour change.
- Two-column layout: Kannada (left) | English (right) per block row, or a
  single column when only one language is active.
- Media (video thumbnail + QR) in a `col-media` column to the right.
- Excerpt strip (`.reply-excerpt`) shows referenced blocks above a card when
  `item.references` points at earlier content.
- Search bar filters (hides non-matching) `.card` elements.

### Book View — ✅ Current
- Two-page spread rendered via **native CSS multi-column layout**
  (`column-count`/`column-width` on `#book-columns`), not a JS-driven
  measure-and-bin-pack algorithm — see **Pagination** below for why this
  matters relative to earlier design intent.
- Running head (title) at top of each page; footer with page numbers at the
  bottom.
- Cards: white background, left border accent only (`card-types.css`),
  print-friendly.
- Navigation: Prev/Next buttons, jump-to-page input (Acrobat-style — jumping
  to an even page number lands on the spread starting one page earlier), and
  `←`/`→`/`PageUp`/`PageDown` keyboard navigation.
- A standalone image item (`item.type === 'images'`) renders as a single
  centered page — never enters the regular card-creation path at all.
- `setViewMode()` in `app.js` toggles both `#continuous-container`/
  `#book-container` visibility and disables the inactive view's own
  `<link id="css-continuous">`/`<link id="css-book">` stylesheet, so only the
  active view's CSS is parsed at a time. `card-types.css` is loaded
  unconditionally (both views need it, always).
- Views are activated lazily, not both rendered eagerly at boot: `app.js`'s
  `activateView(mode)` is the single render path, called once for the
  initial view on boot and again on every toggle click — a view not yet
  opened simply hasn't rendered anything yet, and gets built fresh (with
  current data/settings) the first time it's switched to. This replaced an
  earlier design that rendered both views unconditionally at boot — once
  every toggle click re-renders fresh anyway (see the read-tracking
  cross-view-sync fix below), eagerly building the inactive view at boot
  was wasted work that got thrown away the moment (if ever) it was opened.
- Default view on first load is **book** — `app.js` falls back to
  `localStorage.getItem('viewMode') || 'book'`, and the static HTML
  (`#book-container` starts with `class="active"`, `#continuous-container`
  starts `display:none`, the Book toggle button starts `active`) matches
  that default too, so there's no flash of continuous view before JS runs.

---

## Language Picker — ✅ Current

- Searchable, collapsible multi-select in Settings — same UI, same markup,
  used by both views (book view has no lang picker of its own).
- Collapsed by default, showing a summary (e.g. "Kannada, English"); clicking
  the trigger opens a panel with a search box and checkbox list.
- Defined in `header/header.js`; languages sourced from `KNOWN_LANGS` in
  `core/langs.js`.
- At least one language must remain selected — unchecking the last active
  language reverts instead of leaving zero active.
- A selection made while the list is search-filtered is preserved once the
  search is cleared.
- Selection persisted as part of the unified `settings` object (see below).
- Adding a new language: append to `KNOWN_LANGS` in `core/langs.js` and add
  translation data to `data.json` blocks. No other code changes needed —
  both views read `activeLangs` generically.

---

## Settings Persistence — ✅ Current

All settings — languages, videos, QR codes, read-tracking, paper size, font
scale — live under one `localStorage` key (`settings`), as a single object,
schema owned by `core/settings.js`:

```json
{
  "langs": ["kn", "en"], "videos": true, "qrs": false, "readTracking": false,
  "paperSize": "dynamic", "fontScale": 1
}
```

- `loadSettings()` reads it, filling in defaults for anything missing/invalid.
- `saveSettings(partial)` merges whatever's passed in with what's already
  saved and writes the result back — any single control persists its own
  change (`saveSettings({ qrs: true })`) without needing to know about, or
  risk clobbering, the others.
- `getActiveLangs()`/`saveActiveLangs()` and `applySettings()` (both in
  `header/header.js`) are thin wrappers over this for callers that only
  care about one slice; `core/paper-size.js` and `core/font-scale.js` are
  the equivalent wrappers for their own field.
- Book view doesn't read `settings` directly — `app.js` calls
  `getActiveLangs()` fresh each time a view is activated (boot or toggle
  click) and passes the result into `initBookView`/`renderContinuousView`,
  and both views' media toggles wire through the same `toggle-videos`/
  `toggle-qrs` checkboxes (book view additionally listens for their
  `change` event to call `applyBookMediaVisibility()`).

No backward-compat migration was built for an even older two-key design
(`displaySettings` + `activeLangs`) that predates the unified `settings`
key — accepted as fine for a single-user project, nothing to preserve.

---

## Paper Size & Font Scaling — ✅ Current

Two related Settings-dropdown controls, both persisted in the one unified
`settings` object above (`paperSize`, `fontScale`) — see `core/paper-size.js`
and `core/font-scale.js`.

**Paper size** (`Dynamic` / `A4` / `A3`), applied via `body[data-paper-size]`:
- *Continuous view*: a live width cap previewing print width only — cosmetic,
  **not** real pagination (no page numbers/breaks appear on screen either way).
- *Book view*: **real** physical pagination — the wider container genuinely
  changes how much content fits per spread (via the `cqi`/`cqh`-based
  `clamp()` sizing in `book-view.css`), so the total page count changes too.
- `Dynamic` (the default) is fully responsive on screen in both views,
  identical to the pre-paper-size behaviour, but **always prints as A4** —
  same as choosing `A4` explicitly. Only `A3` changes the printed sheet. A
  printer can't be handed "whatever fits your screen" as a paper size.
- A4/A3 use a genuine fixed `width` (not `max-width`) on the relevant
  container — **not** `max-width` + `width:100%`. A `max-width` lets the box
  shrink to fit whatever the viewport happens to be, and browser zoom
  changes the effective CSS-pixel viewport — with `max-width`, this made the
  page content silently reflow on zoom, and made A4 vs A3 indistinguishable
  once both exceeded the viewport anyway (both collapse to "100% of
  viewport"). A fixed physical width removes both problems: it never
  shrinks, scrolling horizontally instead, like a real print preview does.
- Since `@page` can't be scoped to a body attribute/class in plain CSS, the
  effective print size is written as text into the `#print-page-size
  <style>` element in `index.html` by `applyPaperSize()` — `A3` only for the
  `a3` choice, `A4` otherwise. Orientation follows whichever view is
  active (book = landscape two-page spread, continuous = portrait single
  column), re-applied on every view toggle (`app.js`'s `setViewMode()`).

**Font scaling**, applied via the `--font-scale` CSS custom property:
- A **multiplier**, not an absolute override (e.g. 110% means "1.1× each
  element's own base size", not "set every element to some fixed size") —
  so it composes correctly with paper-size width capping: bigger text within
  a fixed physical width naturally reflows to more lines/pages.
- Default value lives once in `core/font-scale.css`'s `:root` rule;
  `applyFontScale()` overrides it with an inline style on `<html>`. Both
  screen and `@media print` rules in `continuous-view.css`/`book-view.css`
  read this **same** property (every content font-size there is
  `calc(Npx * var(--font-scale))`, including inside `clamp()`), so print
  can never silently drift out of sync with what's shown on screen.
- Shared identically across both views — one control, not per-view.
- Deliberately **not** applied to header/nav chrome (menu, buttons, book
  nav controls) — only to actual pooja content.

**Re-layout signal**: book view's pagination (spread width, current
translateX, total page count) is normally only re-measured on the browser's
native `resize` event. A paper-size or font-scale change resizes/rescales
the page just like a resize would, but doesn't fire one on its own — both
`applyPaperSize()` and `applyFontScale()` call `core/layout-signal.js`'s
`notifyLayoutChanged()`, which dispatches a `pooja:layout-changed` event
that `book-view.js` listens for alongside `resize`, so pagination doesn't go
stale after either setting changes.

**Why `.book-spread` needed `container-type: size`, not `inline-size`**: the
standalone/inline image height caps in `book-view.css` use `cqh`
(container-query height), which needs *block-axis* containment to resolve.
The container previously only had `container-type: inline-size` (enough for
the `cqi`-based font `clamp()`s, which only need the inline axis), so `cqh`
was silently invalid — most visibly as leftover blank space under a tall
standalone image once A3's different proportions made the mismatch obvious.
`.book-spread` already gets a definite, content-independent height from its
`aspect-ratio`, so switching to full `container-type: size` was safe.

**Why `.book-shell` centers with `margin: 0 auto`, not the parent's
`align-items: center`**: once A4/A3 makes `.book-shell` wider than the
viewport, `#book-container` needs to scroll it horizontally. Centering an
overflowing item via the parent's box-alignment (`align-items`/
`justify-content: center`) has a well-known cross-browser quirk: only the
*end*-side overflow becomes reachable by scrolling — the *start* side is
clipped and unreachable no matter how far you scroll, because the browser's
scrollable-overflow calculation for centered flex/grid items only accounts
for the end direction. `margin: auto` centering on the child itself doesn't
have this bug (this is the standard, documented workaround). Continuous
view was never affected — `#continuous-container` was already centered with
`margin: 40px auto`, not flex `align-items`.

---

## Focus / Zen Mode — ✅ Current

A header button (`#zen-mode-btn`, "⛶ Focus") that hides the entire
`.app-header` (search, view toggle, settings) via a `body.zen-mode` class,
and best-effort requests real browser Fullscreen so the browser's own
chrome (tabs, address bar) gets out of the way too. Works identically from
both views.

- **Not persisted** — unlike every other setting in this doc, this is a
  transient reading mode for the current visit, not saved to the unified
  `settings` object. `requestFullscreen()` requires a fresh user gesture on
  every page load regardless, so there'd be nothing meaningful to restore.
- Fullscreen is genuinely best-effort: the request can be denied or
  unsupported (embedded in an iframe, no user gesture, browser policy) —
  wrapped in try/catch, and the header still hides either way, so the core
  distraction-free effect never depends on Fullscreen actually succeeding.
- Since the header (containing the enter button) is hidden while active, a
  small floating `#zen-exit-btn` (fixed top-right) is the way back — shown
  only while `body.zen-mode` is set.
- A second floating control, `#zen-peek-btn` (a small centered tab), toggles
  `body.zen-header-visible` to show/hide the header **without** leaving zen
  mode or dropping Fullscreen — added because the exit button alone was
  all-or-nothing, too heavy just to glance at Settings. `#zen-exit-btn` is
  hidden while peeked open (it would otherwise overlap the revealed
  header's own controls); `Escape` still works regardless.
- Three ways to fully exit, all kept in sync: the exit button; `Escape`
  (handled explicitly, for when Fullscreen was never actually entered — the
  browser only auto-exits *real* fullscreen on Escape on its own); and
  exiting real Fullscreen some other way (F11, browser UI) — a
  `fullscreenchange` listener removes `body.zen-mode` (and any peeked-open
  header state with it) too, so the header can't end up permanently hidden
  with no visible way back in.
- `body.zen-mode #book-container { min-height: 100vh; }` reclaims the 60px
  the header would otherwise have occupied, rather than leaving a dead gap
  at the top — continuous view has no equivalent header-height assumption
  to correct.

---

## Read Tracking — ✅ Current

- `isBlockTrackable(block)` in `core/read-tracking.js` is the single rule
  for whether a block can be marked read at all, used identically by both
  views:
  - Has text in either language → trackable.
  - Has no text but has a video → **still trackable** (a video can run long;
    marking it "watched" is meaningful even with no accompanying text).
  - Has neither text nor video (e.g. an inline image-only block) → **not
    trackable** — no read-tick is rendered, and it's excluded from the
    denominator of the `✓ N/total read` progress counter.
- Book view previously rendered a tick on every block unconditionally
  (including inline image-only blocks) — this was a real inconsistency with
  continuous view's rule, fixed as part of this merge by having
  `createBookCard` check `isBlockTrackable(block)` before rendering a tick,
  and `initBookView`'s `totalBlockCount` filtering the same way.
- A standalone image *item* (`item.type === 'images'`) never had a tick
  either way — it never goes through `createBookCard` at all, so this was
  already correct before the fix above.
- `computeProgress(readSet, totalBlockCount)` computes the counter.
- Read state persists in `localStorage` under `readBlocks`, shared between
  both views (marking something read in book view shows as read in
  continuous view and vice versa — same key, same block IDs).

---

## Card Type Colours (`core/card-types.css`) — ✅ Current

| Type | Continuous border/bg | Book border/bg |
|---|---|---|
| `question` (item) | `#d32f2f` / `#ffebee` | `#c0392b` |
| `answer` (item) | `#4caf50` / `#f1f8e9` | `#27ae60` |
| `images` (item) | `#607d8b` / `#fafafa` | `#607d8b` |
| `note` (block) | `#b38f4f` / `#fdfaf2` | `#b38f4f` / `#fdfaf2` |
| `mantra` (block) | `rgb(255,0,0)` / `rgb(249,126,3)` | `rgb(255,0,0)` / `rgb(249,126,3)` — kept identical to continuous, unlike the rest of this table |
| `shloka` (block) | `#fbc02d` / `#fff9c4` | `#d4a017` / `#fffde7` |

Book view intentionally uses lighter tints and thinner borders (3px vs.
4-5px) than continuous view — print-friendly, minimal ink, per the original
book-view design intent (mantra is the deliberate exception noted above).
No container-id scoping needed (see **Module boundaries** above).

**Item type vs. block type — two different colour roles, not one.**
`question`/`answer`/`images` only ever apply to an *item* (a Q&A pair or an
images group); `note`/`mantra`/`shloka` only ever apply to a *block*
nested inside one. Continuous view keeps these as two genuinely separate
DOM elements — the outer `.card.X` (item) and, nested inside it, the
`.block-row.X` (block) — so both colours are simply, independently visible:
the item's border at the true left edge, the block's own border a little
further in, wherever that block happens to sit.

Book view flattens both into a **single** element's className:
`book-card ${item.type}${block.type !== item.type ? ' ' + block.type : ''}`
— e.g. a mantra block inside an answer item becomes one `<div class="book-card answer mantra">`.
Two colour rules on one element can't both set `border-left-color` — only
the one later in the stylesheet would win, silently dropping the other
(this is what had drifted: an answer+mantra card only ever showed mantra's
colour, never answer's, and an answer+images card similarly lost answer's
green to `.book-card.images`'s own colour). Fixed without touching the
merged-classes structure in `book-view.js`:
- The three **item**-type rules keep `border-left-color` (the true border,
  at the left edge) — `.images` is additionally guarded with
  `:not(.question):not(.answer)`, since continuous view has no
  `.block-row.images` equivalent (an images block nested in a
  question/answer gets no extra colour of its own there either — book view
  now matches, rather than letting `.book-card.images` win the cascade
  over the real item colour whenever "images" happens to also be the block
  type).
- The three **block**-type rules (`note`/`mantra`/`shloka`) use
  `box-shadow: inset 5px 0 0 0 <colour>` instead of `border-left-color` — a
  second, adjacent colour strip just inside the real border, the standard
  CSS trick for a second "border" without a second element. Since it's a
  different property than `border-left-color`, it can never compete with
  the item's own border colour — both are visible side by side, same as
  continuous view's two real nested elements, rather than one flatly
  overwriting the other.

---

## Pagination (Book View) — ✅ Current, simpler than originally designed

The actual implementation uses **native CSS multi-column layout**
(`column-count`/`column-width` on `#book-columns`, sliding via
`transform: translateX()` per spread) — the browser handles reflow
automatically. This is **not** the two-pass real-height-measurement +
binary-search card-splitting algorithm described in earlier design notes
(see **Future / Planned** below) — that was never built. The simpler CSS
approach works correctly for navigation/pagination purposes, but:
- There is no card-splitting — a block taller than one page is not split at
  a line boundary; CSS columns handle overflow by pushing the whole block to
  the next column/page instead.
- There is no per-block height measurement or bin-packing; the browser's own
  column layout decides where breaks fall.
- Standalone image items (`item.type === 'images'`) still get a guaranteed
  dedicated page — that part of the original design *is* implemented, via
  `.standalone-image` styling in `book-view.css`, independent of the
  column-layout mechanism.

---

## Print (Book View) — ✅ Current, but different mechanism than documented

`@media print` in `book-view.css` hides `.app-header`, `#continuous-container`,
`#back-to-message`, and `.book-nav`, then forces `.book-columns` to
**keep** `column-count: 2` (not reflow to a single column — the two
print-facing columns are the same "left page / right page" structure as a
screen spread, just no longer JS-paginated) while removing the JS sliding
(`transform: none`) and letting height flow freely (`height: auto`) across
as many physical sheets as the content needs — this alone makes the
*entire* book print as one flowing document, not just the currently-visible
spread.

This is **not** the `#book-print-container`/`renderPrintBook()` pre-render
pipeline described in earlier design notes. That pipeline was never built —
`renderPrintBook()` is (and remains) an empty stub, and no
`#book-print-container` element exists in `index.html`. It isn't needed:
the CSS-reflow approach above already satisfies the actual requirement
("print the entire book, not just the current page") on its own.

**Screen spread count and print sheet count are not expected to match,
and there's no fixed ratio between them (not 1:1, not 2:1).** Screen
pagination and print pagination are two genuinely independent layout
engines with different dimensions feeding them, not the same measurement
reused twice:
- Screen (`Dynamic`/`A4`) sizes `.book-shell` to simulate an *open book* —
  two A4 portrait pages side by side (~420mm) — with a fixed
  `aspect-ratio` governing its height. Print instead renders on the
  *actual* physical sheet (`@page { size: A4 landscape }`, ~297×210mm
  minus margins), auto-height, no aspect-ratio constraint.
- Screen's column gap (56px, `#book-columns`'s base rule) and print's
  (`25mm` ≈ 94.5px, print-only) differ.
- Font sizing is shared (`--font-scale`, applied identically per **Paper
  Size & Font Scaling** above), but it interacts with the two different
  widths above differently, and screen's `cqi`/`cqh`-driven sizing is
  disabled entirely for print (`container-type: normal`).

Given all of that, there was never an engineered guarantee that, say,
halving the screen spread count would predict the print sheet count — they
can reasonably diverge, and by how much isn't something resolvable from
source alone; it depends on real browser font-metrics at print time, which
this sandbox has no way to render and measure directly. The one thing that
*is* guaranteed, and is the actual requirement per REQUIREMENTS.md: the
entire book prints, completely, regardless of how many sheets it takes.

**Four real bugs found and fixed so far, all from screen-focused CSS
leaking into print without a strong-enough print-side override:**
- `#book-container { overflow-x: auto; }` (added for the on-screen A4/A3
  horizontal-scroll fix — see **Paper Size & Font Scaling** above) clips a
  *printed* page to whatever was scrolled into view on screen — browsers
  don't "unroll" a scrollable region onto extra pages, they just clip to
  it. Fixed with `#book-container { overflow: visible !important; }` inside
  `@media print`.
- Moving mantra/note/shloka's colour from `border-left-color` to
  `box-shadow` (see **Card Type Colours** above — needed so it doesn't
  compete with the item type's own border colour) put that colour under
  "background graphics" for print purposes, same category as
  `background-color`, which several browsers suppress by default unless
  the print dialog's "Background graphics" option is explicitly checked.
  Fixed with a blanket `* { print-color-adjust: exact !important; }` inside
  `@media print`, so both the pre-existing tinted backgrounds and the newer
  box-shadow strips print consistently regardless of that browser setting
  — `border-left-color`-based borders (the item-type colour) were never
  affected by this, since borders aren't "background".
- **An active A3/A4 screen setting was leaking its physical width into
  print.** `body[data-paper-size="a4"] .book-shell { width: 420mm; }` (and
  the `a3` equivalent) lives outside any `@media` query — deliberately, so
  it also establishes the default before print's own rules are evaluated —
  but that also means it matches during print, and its selector has higher
  specificity than the print block's own `.book-shell { width: 100% }`
  reset. Neither had `!important`, so specificity decided it regardless of
  which one was inside `@media print` — the screen-preview's physical width
  silently won, shrinking everything on the actual printed page to fit a
  size meant for on-screen preview, not the paper. Fixed by adding
  `!important` to the print block's reset, so it always wins regardless of
  what paper size was selected on screen.
- **A standalone image was capped to the same flat height as a small
  inline image, losing its "fill most of the page" sizing entirely** —
  and the first fix for this overshot in the other direction, losing the
  caption instead. Print's `.book-image { max-height: 140mm !important; }`
  — a bare selector, meant as a safe fallback for small inline images —
  has `!important`, which beats the standalone-specific
  `.book-columns .standalone-image .book-image { max-height: 75cqh; }`
  (no `!important`) regardless of the latter's higher specificity:
  `!important` always wins over non-`!important`, no matter how specific
  the losing selector is. (That screen-only `75cqh` value is moot in print
  anyway, since `cqh` needs containment print disables — see the note on
  `container-type` above.) The first fix gave standalone images their own
  `!important`, more-specific override at `220mm` — which is *larger than
  A4 landscape's actual usable height* (210mm − 2×15mm margin = 180mm). A
  `break-inside: avoid` card taller than a full physical page can't
  actually be kept unbroken (there's no page left to avoid breaking onto),
  and what browsers do with that impossible request is silently clip
  whatever comes after the point where the page ends — the caption, being
  last in the card, disappeared specifically in print despite rendering
  fine on screen. Recalibrated to `150mm` for the image / `170mm` for the
  card (comfortably under A4's real 180mm once the caption and card
  padding are added), with a `body[data-paper-size="a3"]` override raising
  both to `230mm`/`250mm` for A3 landscape's genuinely larger usable height
  (297mm − 30mm = 267mm) — the same paper-size-aware pattern already used
  for width elsewhere in this file.

---

## Testing — ✅ Current

- **Unit** (Jest + jsdom, via `babel.config.js` for ES module syntax):
  `data.test.js` (root), `core/blocks.test.js`, `core/media.test.js`,
  `core/read-tracking.test.js`, `core/settings.test.js`,
  `core/paper-size.test.js`, `core/font-scale.test.js`, `header/header.test.js`,
  `views/continuous/continuous-view.test.js`, `views/book/book-view.test.js`.
- **E2E** (Playwright, `test/e2e/` — mirrors `views/`, see **Directory
  Structure** above for why):
  - `test/e2e/book/`: `book-view.test.js`, `book-view-print.test.js`
    (includes Dynamic/A4/A3 print screenshots), `book-view-screenshots.test.js`
    (+ `-snapshots/`), `book-print-regressions.test.js`.
  - `test/e2e/continuous/`: `continuous-view-print.test.js` (includes
    Dynamic/A4/A3 print screenshots), `continuous-view-screenshots.test.js`
    (+ `-snapshots/`), `language-filter.test.js`, `media-visibility.test.js`,
    `read-tracking.test.js`, `reply-excerpt.test.js`, `site-preview.spec.js`.
  - `test/e2e/core/`: `paper-size-font-scale.test.js`, `zen-mode.test.js`,
    `read-tracking.test.js`, `language-filter.test.js` — see the note below
    on the last two; they were originally miscategorized into `continuous/`.
- `playwright.config.js` explicitly sets `reporter: [['html', {open:'never'}], ['list']]`
  — without this, no reporter writes an HTML report at all (Playwright's
  built-in default doesn't). `testDir`/`testMatch` needed no changes for the
  `book`/`continuous`/`core` split — Playwright recursively discovers
  `*.test.js`/`*.spec.js` under `testDir` by default.
- Screenshot baselines are Linux-only (`*-linux.png`), generated via a
  dedicated `update-snapshots.yml` GitHub Actions workflow rather than
  locally, so they're consistent regardless of contributor OS. The
  paper-size print screenshots specifically exist because a real bug (an
  active A3/A4 screen setting leaking its width into print — see **Print
  (Book View)** below) shipped undetected precisely because nothing ever
  visually compared print output with a non-default paper size selected;
  every other check only covered the numbers in isolation.

---

## Known Gaps / Accepted Behaviour

- **Pagination and print both work via simpler mechanisms than originally
  designed** (native CSS columns; CSS reflow rather than a pre-render
  pipeline) — see the two sections above. Functionally sufficient for the
  current requirements; not what earlier design notes described.
- **No migration path** for settings saved under the old
  `displaySettings`/`activeLangs` keys — accepted as fine for a single-user
  project.
- Caption/user-authored text inserted via `innerHTML` in a few places is not
  HTML-escaped — low real risk since `data.json` is author-controlled
  content, not user input.
- Search in book view (`searchBookView`) jumps to the first spread
  containing a text match by scanning rendered `.book-card` elements'
  `offsetLeft` — works, but has no highlighting of the matched text itself
  (unlike continuous view's filter, which the user visually confirms by
  what's left on screen).

---

## Future / Planned (not built)

### Book View Pagination (original design, superseded above)
Two-pass real-height algorithm — measure every card in an off-screen probe
at true column width, then bin-pack onto pages using real pixel heights;
card splitting at line boundaries via binary search for any block taller
than one page. Superseded by the simpler CSS-column approach that's actually
shipped — revisit only if a real case shows up where CSS columns' overflow
behaviour (pushing a whole tall block to the next page rather than
splitting it) is genuinely a problem in practice.

### Print (original design, superseded above)
A hidden `#book-print-container` pre-rendering every spread with explicit
page breaks, QR codes enlarged to 80px, greyscale video thumbnails. Superseded
by the CSS-reflow approach that's actually shipped, which already satisfies
the core requirement without needing a separate render pass.
