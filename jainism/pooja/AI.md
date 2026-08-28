# Jaina Pooja FAQ — Master Branch: Current State & Requirements

This document captures the current design decisions on `master`, and the
requirements for what's still planned but not yet built — intended for
committing alongside the code so future contributors (human or AI) understand
the intent behind each choice, and don't have to guess what's implemented
versus aspirational.

Everything under **"Current State"** exists and is tested today. Everything
under **"Future / Planned"** does not exist yet — it's design intent only,
carried over from earlier planning, not a description of present behaviour.

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `app.js` | Entry point; composes modules; owns `setViewMode()` | ✅ Current |
| `header.js` | Settings dropdown, lang picker, media/read-tracking toggles, unified settings storage | ✅ Current |
| `continuous-view.js` | Continuous scroll view rendering (verbatim from original `script.js`) | ✅ Current |
| `blocks.js` | Pure data-model helpers: `formatIdForDisplay`, `buildBlockIndex`, `resolveReference` | ✅ Current |
| `langs.js` | `KNOWN_LANGS` — single source of truth for supported languages | ✅ Current |
| `media.js` | Video/QR utilities (`createVideoCard`, `extractYouTubeId`, `escapeHtml`, `linkify`, etc.) | ✅ Current |
| `read-tracking.js` | Pure read/unread state functions, incl. `isBlockTrackable` | ✅ Current |
| `card-types.css` | Card type colours — single source of truth, written to be shared by any future view | ✅ Current |
| `header.css` | App header, search bar, settings dropdown, view toggle, lang picker | ✅ Current |
| `continuous-view.css` | Card layout, block rows, excerpts — scoped to `#continuous-container` | ✅ Current |
| `media.css` | Video/QR/image styles — scoped to `#continuous-container` | ✅ Current |
| `read-tracking.css` | Read tick and progress counter styles | ✅ Current |
| `book-view.js` | Book spread view: pagination, card creation, navigation | 🔜 Future |
| `book-view.css` | Book spread layout, pages, cards, nav — scoped to `#book-container` | 🔜 Future |

### Module boundaries (why things live where they do)
- `blocks.js` and `langs.js` exist specifically so a future `book-view.js`
  doesn't have to import from `continuous-view.js`/`header.js` directly, or
  duplicate their own copies — a book view needs the exact same ID
  formatting, reference resolution, block indexing, and language list that
  continuous view already uses.
- `read-tracking.js`'s `isBlockTrackable(block)` is the single place that
  decides whether a block gets a read-tick at all (see **Read Tracking**
  below) — any future view calls this rather than re-deriving the rule.
- `card-types.css` was extracted out of `continuous-view.css` early,
  specifically so it's ready to be shared the moment a second view exists.

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

### Book View — 🔜 Future
Not implemented. `index.html` already has the view-toggle buttons
(`Book` / `Continuous`) and `app.js` has a `setViewMode()` stub with a
comment marking where `book-view.js` gets wired in — but there is no
`#book-container`, and clicking "Book" today just hides continuous view and
shows a blank page. See the original book-view branch design notes for the
intended pagination algorithm, card splitting, and print pipeline — none of
that has been ported to master yet.

---

## Language Picker — ✅ Current

- Searchable, collapsible multi-select in Settings — same UI intended for
  both views once book view exists.
- Collapsed by default, showing a summary (e.g. "Kannada, English"); clicking
  the trigger opens a panel with a search box and checkbox list.
- Defined in `header.js`; languages sourced from `KNOWN_LANGS` in `langs.js`.
- At least one language must remain selected — unchecking the last active
  language reverts instead of leaving zero active.
- A selection made while the list is search-filtered is preserved once the
  search is cleared (languages currently hidden by the filter keep their
  prior checked state rather than being silently dropped).
- Selection persisted as part of the unified `settings` object (see
  **Settings Persistence** below), not its own key.
- Adding a new language: append to `KNOWN_LANGS` in `langs.js` and add
  translation data to `data.json` blocks. No other code changes needed.

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

This replaced an earlier two-key design (`displaySettings` +
`activeLangs`) — consolidated because there was no real reason for the split,
and it made "save everything with one call" impossible. No backward-compat
migration was built for the old keys (single-user project, nothing to
preserve).

---

## Read Tracking — ✅ Current

- `isBlockTrackable(block)` in `read-tracking.js` is the single rule for
  whether a block can be marked read at all:
  - Has text in either language → trackable.
  - Has no text but has a video → **still trackable** (a video can run long;
    marking it "watched" is meaningful even with no accompanying text).
  - Has neither text nor video (e.g. a standalone image) → **not
    trackable** — no read-tick is rendered, and it's excluded from the
    denominator of the `✓ N/total read` progress counter.
- `computeProgress(readSet, totalBlockCount)` computes the counter; the
  `totalBlockCount` passed in already excludes non-trackable blocks.
- The `.media-only` CSS class (presentational — no text at all, so the block
  lays out without a language column) is a separate, narrower concept from
  trackability: a video-only block gets `.media-only` styling but *is*
  trackable, since "no text" and "nothing worth marking read" aren't the
  same question.
- Read state persists in `localStorage` under `readBlocks`, independent of
  the unified `settings` key.

---

## Card Type Colours (`card-types.css`) — ✅ Current

| Type | Border | Background |
|---|---|---|
| `question` | `#d32f2f` (red) | `#ffebee` |
| `answer` | `#4caf50` (green) | `#f1f8e9` |
| `images` | `#607d8b` (grey) | `#fafafa` |
| `mantra` (block-level) | `rgb(255, 0, 0)` | `rgb(249, 126, 3)` |
| `note` (block-level) | `#b38f4f` (tan) | `#fdfaf2` |
| `shloka` (block-level) | `#fbc02d` (gold) | `#fff9c4` |

Written now, with a future second view in mind: `card-types.css` has no
`#continuous-container` scoping on its selectors (`.card.question`,
`.block-row.mantra`, etc.) specifically so a future `#book-container .book-card`
variant can reuse the same colour rules without duplicating them — that
scoping decision hasn't been tested against a real second view yet, since
none exists.

---

## Testing — ✅ Current

- **Unit** (Jest + jsdom, via `babel.config.js` for ES module syntax):
  `data.test.js`, `blocks.test.js`, `continuous-view.test.js`,
  `header.test.js`, `media.test.js`, `read-tracking.test.js`.
- **E2E** (Playwright): `display-options-screenshots.test.js`,
  `language-filter.test.js`, `media-visibility.test.js`, `print.test.js`,
  `read-tracking.test.js`, `reply-excerpt.test.js`, `site-preview.spec.js`.
- `playwright.config.js` explicitly sets `reporter: [['html', {open:'never'}], ['list']]`
  — without this, no reporter writes an HTML report at all (Playwright's
  built-in default doesn't), which silently breaks any CI step that tries to
  upload `playwright-report/` as an artifact.
- Screenshot baselines are Linux-only (`*-linux.png`) by convention, generated
  via a dedicated `update-snapshots.yml` GitHub Actions workflow
  (`workflow_dispatch`, choice of committing directly or uploading as a
  reviewable artifact) rather than locally — keeps baselines consistent
  regardless of which OS a contributor develops on.

---

## Known Gaps / Accepted Behaviour

- **Book view does not exist.** The toggle button, the `setViewMode()` stub,
  and `card-types.css`'s unscoped selectors are all preparation for it, not
  evidence it's built.
- **No migration path** for anyone who had settings saved under the old
  `displaySettings`/`activeLangs` keys before the unified `settings` key was
  introduced — accepted as fine for a single-user project.
- Caption/user-authored text inserted via `innerHTML` in a few places
  (e.g. media captions) is not HTML-escaped — low real risk since `data.json`
  is author-controlled content, not user input, but worth knowing if that
  assumption ever changes.

---

## Future / Planned (not built — carried over from earlier design work)

Everything below is intent, not current behaviour. Treat it as a starting
point for book view's eventual implementation, subject to change once real
constraints (actual page dimensions, actual content) are in front of us.

### Book View
- Two-page spread; fixed height matched to viewport.
- Running head (title) at top of each page; footer rule + page number at
  bottom.
- Cards: white background, left border accent only (print-friendly, minimal
  ink).
- Navigation: Prev / Next buttons + jump-to-page input (like Acrobat).
- Keyboard navigation: `←`/`→` or `PageUp`/`PageDown`.

### Book View Pagination
- Two-pass real-height algorithm: measure every card in an off-screen probe
  at true column width, then bin-pack onto pages using real pixel heights.
- Card splitting at line boundaries (`kn[]`/`en[]` sliced in parallel) via
  binary search, for any block taller than one page.
- Standalone image items (`item.type === 'images'`) always get a dedicated
  page; image-only blocks *inside* another item are bin-packed inline instead
  (no dedicated page — see original design notes for the `i_013_b_4` example
  of why).

### Print (book view)
- `@media print` hides the interactive spread and nav.
- A hidden `#book-print-container` pre-renders every spread; each triggers a
  page break.
- QR codes enlarge to 80px; video thumbnails render greyscale to save ink.

### Search (book view)
- Continuous view's search already filters/hides cards — that part is
  current. Book view's search jumping to the first matching spread is not
  built, since book view itself isn't built.

### State Persistence (book view additions)
| Key | Value |
|---|---|
| `bookSpread` | Current spread index — not yet used; no book view to persist a spread for |

(`viewMode`, `readBlocks` already exist and are current — see above. `settings`
replaces the old `activeLangs`/`displaySettings` keys shown in earlier design
docs.)