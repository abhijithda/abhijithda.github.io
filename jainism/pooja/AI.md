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
│   └── card-types.css            (card/block colour coding)
├── header/
│   └── header.js / header.css / header.test.js
├── views/
│   ├── continuous/
│   │   └── continuous-view.js / .css / .test.js
│   └── book/
│       └── book-view.js / .css / .test.js
├── test/e2e/                   ← Playwright, unaffected by the folders above
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
| `header/header.js` | Settings dropdown, lang picker, media/read-tracking toggles, unified settings storage | ✅ Current |
| `views/continuous/continuous-view.js` | Continuous scroll view rendering (verbatim from original `script.js`) | ✅ Current |
| `views/book/book-view.js` | Book spread view: pagination (CSS columns), card creation, navigation | ✅ Current |
| `core/blocks.js` | Pure data-model helpers: `formatIdForDisplay`, `buildBlockIndex`, `resolveReference` — shared by both views | ✅ Current |
| `core/langs.js` | `KNOWN_LANGS` — single source of truth for supported languages | ✅ Current |
| `core/media.js` | Video/QR utilities (`createVideoCard`, `extractYouTubeId`, `escapeHtml`, `linkify`, etc.) | ✅ Current |
| `core/read-tracking.js` | Pure read/unread state functions, incl. `isBlockTrackable` — shared by both views | ✅ Current |
| `core/card-types.css` | Card type colours — single source of truth for both views | ✅ Current |
| `header/header.css` | App header, search bar, settings dropdown, view toggle, lang picker | ✅ Current |
| `views/continuous/continuous-view.css` | Card layout, block rows, excerpts — scoped to `#continuous-container` | ✅ Current |
| `views/book/book-view.css` | Book spread layout, pages, cards, nav, print reflow — scoped to `#book-container` | ✅ Current |
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

All settings — languages, videos, QR codes, read-tracking — live under one
`localStorage` key (`settings`), as a single object:

```json
{ "langs": ["kn", "en"], "videos": true, "qrs": false, "readTracking": false }
```

- `loadSettings()` reads it, filling in defaults for anything missing/invalid.
- `saveSettings(partial)` merges whatever's passed in with what's already
  saved and writes the result back — any single control persists its own
  change (`saveSettings({ qrs: true })`) without needing to know about, or
  risk clobbering, the others.
- `getActiveLangs()`/`saveActiveLangs()` and `applySettings()` are thin
  wrappers over this for callers that only care about one slice.
- Book view doesn't read `settings` directly — `app.js` calls
  `getActiveLangs()` once at boot and passes the result into `initBookView`,
  and both views' media toggles wire through the same `toggle-videos`/
  `toggle-qrs` checkboxes (book view additionally listens for their
  `change` event to call `applyBookMediaVisibility()`).

No backward-compat migration was built for an even older two-key design
(`displaySettings` + `activeLangs`) that predates the unified `settings`
key — accepted as fine for a single-user project, nothing to preserve.

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

| Type | Continuous border/bg | Book border |
|---|---|---|
| `question` | `#d32f2f` / `#ffebee` | `#c0392b` |
| `answer` | `#4caf50` / `#f1f8e9` | `#27ae60` |
| `images` | `#607d8b` / `#fafafa` | `#607d8b` |
| `note` | `#b38f4f` / `#fdfaf2` | `#b38f4f` / `#fdfaf2` |
| `mantra` | `rgb(255,0,0)` / `rgb(249,126,3)` | `#e65100` / `#fff3e0` |
| `shloka` | `#fbc02d` / `#fff9c4` | `#d4a017` / `#fffde7` |

Book view intentionally uses lighter tints and thinner borders (3px vs.
4-5px) than continuous view — print-friendly, minimal ink, per the original
book-view design intent. No container-id scoping needed (see **Module
boundaries** above).

The `book-card` className includes both `item.type` and `block.type` when
they differ, so a shloka block inside an answer item gets classes
`book-card answer shloka` and picks up both colour rules.

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
`#back-to-message`, and `.book-nav`, then forces `#book-container` itself to
reflow to a single column (`column-count: 1`, `transform: none`,
`height: auto`) — this alone makes the *entire* book print as one flowing
document, not just the currently-visible spread.

This is **not** the `#book-print-container`/`renderPrintBook()` pre-render
pipeline described in earlier design notes. That pipeline was never built —
`renderPrintBook()` is (and remains) an empty stub, and no
`#book-print-container` element exists in `index.html`. It isn't needed:
the CSS-reflow approach above already satisfies the actual requirement
("print the entire book, not just the current page") on its own.

---

## Testing — ✅ Current

- **Unit** (Jest + jsdom, via `babel.config.js` for ES module syntax):
  `data.test.js` (root), `core/blocks.test.js`, `core/media.test.js`,
  `core/read-tracking.test.js`, `header/header.test.js`,
  `views/continuous/continuous-view.test.js`, `views/book/book-view.test.js`.
- **E2E** (Playwright, all still flat under `test/e2e/` — unaffected by the
  `core`/`header`/`views` reorg): `display-options-screenshots.test.js`,
  `language-filter.test.js`, `media-visibility.test.js`, `print.test.js`,
  `read-tracking.test.js`, `reply-excerpt.test.js`, `site-preview.spec.js`,
  `book-view.test.js`, `book-view-screenshots.test.js`.
- `playwright.config.js` explicitly sets `reporter: [['html', {open:'never'}], ['list']]`
  — without this, no reporter writes an HTML report at all (Playwright's
  built-in default doesn't).
- Screenshot baselines are Linux-only (`*-linux.png`), generated via a
  dedicated `update-snapshots.yml` GitHub Actions workflow rather than
  locally, so they're consistent regardless of contributor OS.

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
