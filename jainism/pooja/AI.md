# Jaina Pooja FAQ — Book View Requirements

This document captures the design decisions and requirements for the book view
feature, intended for committing alongside the code so future contributors
understand the intent behind each choice.

---

## File Structure

The codebase is split into focused modules — one concern per file:

| File | Responsibility |
|---|---|
| `app.js` | Entry point; composes all modules; owns `setViewMode()` |
| `header.js` | Settings dropdown, lang picker, media/read-tracking toggles |
| `continuous-view.js` | Continuous scroll view rendering (verbatim from master) |
| `book-view.js` | Book spread view: pagination, card creation, navigation |
| `media.js` | Video/QR utilities (`createVideoCard`, `extractYouTubeId`, etc.) |
| `read-tracking.js` | Pure read/unread state functions |
| `card-types.css` | Card type colours shared by both views (single source of truth) |
| `header.css` | App header, search bar, settings dropdown, view toggle |
| `continuous-view.css` | Card layout, block rows, excerpts — scoped to `#continuous-container` |
| `book-view.css` | Book spread layout, pages, cards, nav — scoped to `#book-container` |
| `media.css` | Video/QR/image styles — scoped to `#continuous-container` |
| `read-tracking.css` | Read tick and progress counter styles |

### CSS Isolation
- All `continuous-view.css` and `media.css` selectors are prefixed with
  `#continuous-container` so they never affect the book view.
- All book-view selectors use `.book-*` class names or `#book-container` scope.
- `card-types.css` is the **only** file that styles both views — it uses
  `#continuous-container .card.X` and `#book-container .book-card.X` selectors.
- `setViewMode()` in `app.js` disables the inactive view's CSS `<link>` element
  so only the active view's stylesheet is parsed at any time.

---

## Views

### Continuous View
- Verbatim rendering logic from `master` branch `script.js`, refactored into ES modules.
- Two-column layout: Kannada (left) | English (right) per block row.
- Media (video thumbnail + QR) in a `col-media` column to the right.
- Excerpt strip shows referenced blocks above each card.

### Book View
- Two-page spread; fixed height matched to viewport.
- Running head (title) at top of each page; footer rule + page number at bottom.
- Cards: white background, left border accent only (print-friendly, minimal ink).
- Navigation: Prev / Next buttons + jump-to-page input (like Acrobat).
- Keyboard navigation: `←`/`→` or `PageUp`/`PageDown`.

---

## Language Picker

- Multi-checkbox dropdown in Settings — same UI for both views.
- Defined in `header.js`; languages sourced from `KNOWN_LANGS` in `book-view.js`.
- At least one language must remain selected (last checkbox cannot be unchecked).
- Selection persisted in `localStorage` as an ordered array of language codes.
- Adding a new language: append to `KNOWN_LANGS` in `book-view.js` and add
  translation data to `data.json` blocks. No other code changes needed.

---

## Book View Pagination

### Algorithm: Two-Pass Real-Height

**Pass 1 — Measure:**
- Every card is rendered into a hidden off-screen probe div at the exact page
  column width (`window.innerWidth/2 - pagePaddingLeft - pagePaddingRight`).
- Video thumbnails are given explicit `height:60px` before measuring so the
  result is stable regardless of network state.
- `getBoundingClientRect().height` gives the real pixel height.
- Blocks that exceed `PAGE_CONTENT_H` are split at line boundaries using
  binary search (see Card Splitting below).

**Pass 2 — Bin-pack:**
- Cards are placed onto pages using real pixel heights + `CARD_GAP` between cards.
- When a block would overflow the current page, greedy fill attempts to split
  it to partially fill the remaining space before starting a new page.

**Dynamic dimensions:**
- `PAGE_CONTENT_H` and probe width are measured from the real DOM at init time
  (after the spread skeleton is built but before the first render).
- The container is briefly force-shown (`visibility:hidden; display:flex`) with
  `void element.offsetHeight` reflows forced at each level before measuring.
- Inline style is reset with `style.display = ''` (empty string) so CSS class
  rules (`#book-container.active { display:flex }`) take over cleanly.

### Card Splitting
- Any block whose measured height exceeds `PAGE_CONTENT_H` is split at line
  boundaries: `kn[]` and `en[]` arrays are sliced in parallel (line `i` in kn
  always pairs with line `i` in en).
- Binary search finds the largest slice that fits on one page.
- Videos and images only appear in the first chunk.
- Split chunk IDs: `blockId_splitN` (e.g. `a_017_b_9_split13`).
- Single-line blocks that exceed the page cannot be split — they overflow and
  are clipped by `overflow:hidden`. This is accepted by design.

### Image Pagination Rules
- **`item.type === 'images'`** (standalone image items): always placed alone on a
  dedicated page. The page height is 100% image + caption. No surrounding text.
- **Image-only blocks** (`block.images && !text && !video`) inside non-image items
  (e.g. `i_013_b_4` inside `a_013`): treated as large inline blocks — measured
  at natural height and bin-packed with surrounding text. They do NOT get a
  dedicated page (that would waste the opposite spread page).
- **Inline images** (image + text in same block): placed alone on their own page
  so the image is never clipped by `overflow:hidden`.

---

## Card Type Colours (`card-types.css`)

Card colours convey semantic meaning consistently across both views:

| Type | Border | Background |
|---|---|---|
| `question` | `#c0392b` (red) | `#ffebee` (continuous) / none (book) |
| `answer` | `#27ae60` (green) | `#f1f8e9` (continuous) / none (book) |
| `note` | `#b38f4f` (tan) | `#fdfaf2` |
| `shloka` | `#d4a017` (gold) | `#fffde7` |
| `mantra` | `#e65100` (orange) | `#fff3e0` |
| `images` | `#607d8b` (grey) | none |

The `card.className` in book view includes both `item.type` and `block.type`
so a shloka block inside an answer item gets classes `book-card answer shloka`.

---

## Media in Book View

- **Video**: thumbnail (16:9, 60px height) on the left + QR code (60×60px) on
  the right. One row per video. "Scan to watch" label removed — QR is self-evident.
- **QR codes**: generated at 200px resolution source so they're scannable from
  a printed page.
- **Images** (standalone page): fill full page width at natural aspect ratio,
  `object-fit:contain`. Caption sits immediately below the image.
- **Images** (inline in text card): fill card width at natural aspect ratio,
  flow below the text content.

---

## Print

- `@media print` hides the interactive spread and nav.
- `#book-print-container` (hidden on screen) holds all spreads pre-rendered.
  `renderPrintBook()` is called at init and after any lang change.
- Each `.book-print-spread` triggers a CSS page break (`page-break-after:always`).
- QR codes enlarge to 80px for better printability.
- Video thumbnails rendered in greyscale to save ink.

---

## Read Tracking

- Read ticks are visible in book view (can be hidden via Settings toggle).
- Tick state is shared with continuous view (same `localStorage` key).
- `computeProgress()` updates the header `✓ N/total read` counter.

---

## Search

- Search bar is always visible in both views.
- Continuous view: filters cards (hides non-matching).
- Book view: jumps to the first spread containing a matching block.

---

## Scroll / State Persistence

| Key | Value |
|---|---|
| `viewMode` | `'continuous'` or `'book'` |
| `bookSpread` | Current spread index (even number) |
| `activeLangs` | JSON array of active language codes |
| `displaySettings` | `{videos, qrs, readTracking}` booleans |
| `scrollPosition` | Continuous view scroll Y |
| `readBlocks` | JSON array of read block IDs |

---

## Known Limitations / Accepted Behaviour

- **Single-line blocks** (1 kn + 1 en line) cannot be split. Pages containing
  only such blocks may have 100-200px unused space — this is normal book variation.
- **`a_017_b_9`** is a single block that is larger than one full page (long list).
  It is split at the halfway point; remaining content overflows and is clipped.
  Accepted: the user said card splitting at sentence level is acceptable.
- **Two missing images** (`Adinatha Swami Bawangaja.png`,
  `Adinatha Swami Charana Bawangaja.png`) return 404 — the files are not in the
  `images/` directory. Book view handles this gracefully (broken image icon).
