// book-view.js — Book spread view powered by CSS Multi-column Layout.

import { createVideoCard } from '../../core/media.js';
import { getReadBlocks, isBlockTrackable, countTrackableBlocks, updateProgressDisplay } from '../../core/read-tracking.js';
import { buildReadTick } from '../../core/read-tick.js';
import { buildShareButton } from '../../core/share-ui.js';
import { formatIdForDisplay, resolveReference, buildBlockIndex, classifyInsert, langsWithText, imageUrl } from '../../core/blocks.js';

const state = {
    data: [],
    blockById: {},
    itemById: {},
    totalBlockCount: 0,
    currentSpread: 0,
    activeLangs: ['kn', 'en']
};

// ── Pages per spread ──────────────────────────────────────────────────────
// Two on a normal screen (a real double-page spread), one on a phone in
// Dynamic paper size. Must stay in step with the `@media screen and (max-width: 700px)` block at the
// end of book-view.css. matchMedia is missing in jsdom (the unit tests), where
// this falls back to the desktop two-page behaviour.
const SINGLE_PAGE_QUERY = '(max-width: 700px)';

function pagesPerSpread() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 2;
    if (!window.matchMedia(SINGLE_PAGE_QUERY).matches) return 2;
    // A4 / A3 are a deliberate real-paper preview: keep the two-page spread
    // (and let it scroll sideways) exactly as on desktop. Only Dynamic adapts.
    const paper = document.body && document.body.dataset ? document.body.dataset.paperSize : 'dynamic';
    return (paper === 'a4' || paper === 'a3') ? 2 : 1;
}

// The saved position means something different in each mode (a spread of two
// pages vs a single page), so each mode keeps its own.
function storageKey(ppp = pagesPerSpread()) {
    return ppp === 1 ? 'bookPage' : 'bookSpread';
}

function saveSpread() {
    localStorage.setItem(storageKey(), state.currentSpread);
}

// ── Card factory (VERBATIM from your original code) ───────────────────────
function createBookCard(entry, activeLangs, readBlocks) {
    const { item, block, showExcerpt } = entry;

    const card = document.createElement('div');
    card.className = `book-card ${item.type}${block.type && block.type !== item.type ? ' ' + block.type : ''}`;
    card.id = `book-${block.id}`;

    if (showExcerpt && item.references) {
        item.references.forEach(refId => {
            const refBlock = resolveReference(refId, state.blockById, state.itemById);
            if (!refBlock) return;
            const strip = document.createElement('div');
            strip.className = 'book-excerpt';
            const refLabel = document.createElement('span');
            refLabel.className = 'book-ref';
            refLabel.textContent = `Ref: ${formatIdForDisplay(refBlock)}`;
            strip.appendChild(refLabel);
            const previewLines = refBlock.content?.[activeLangs[0]] || [];
            if (previewLines.length) {
                const preview = document.createElement('span');
                preview.className = 'book-excerpt-preview';
                const text = previewLines.join(' ');
                preview.textContent = text.length > 80 ? text.slice(0, 80) + '…' : text;
                strip.appendChild(preview);
            }
            card.appendChild(strip);
        });
    }

    const bid = document.createElement('span');
    bid.className = 'book-bid';
    bid.textContent = formatIdForDisplay(block);
    card.appendChild(bid);

    const langLines = langsWithText(block, activeLangs);
    langLines.forEach((lang, i) => {
        const line = document.createElement('div');
        line.className = `book-lang-line lang-${lang}`;
        line.dataset.lang = lang;
        line.textContent = block.content[lang].join('\n');
        card.appendChild(line);
        if (i < langLines.length - 1) {
            const sep = document.createElement('div');
            sep.className = 'book-lang-sep';
            card.appendChild(sep);
        }
    });

    // Same markup as continuous view (.media-wrap > .video-card + .qr-code),
    // so the play badge, thumbnail and QR are styled by one set of rules;
    // only the LAYOUT differs per view (see ".book-card .media-wrap" in
    // book-view.css). Visibility follows the body.show-videos / show-qrs
    // classes, exactly as in continuous view.
    (block.videos || []).forEach(v => card.insertAdjacentHTML('beforeend', createVideoCard(v.url)));

    if (block.images && block.images.length > 0) {
        block.images.forEach(img => {
            const wrap = document.createElement('div');
            wrap.className = 'book-image-wrap';
            const imgEl = document.createElement('img');
            imgEl.src = imageUrl(img.src);
            imgEl.alt = img.caption?.[activeLangs[0]] || img.caption?.kn || img.caption?.en || '';
            imgEl.className = 'book-image';
            wrap.appendChild(imgEl);

            const availCaps = Object.entries(img.caption || {}).filter(([, v]) => v && v.trim());
            if (availCaps.length > 0) {
                const langsToShow = activeLangs.filter(lang => img.caption?.[lang]?.trim());
                (langsToShow.length > 0 ? langsToShow : [availCaps[0][0]]).forEach(lang => {
                    const cap = img.caption[lang];
                    if (!cap) return;
                    const capEl = document.createElement('p');
                    capEl.className = `book-image-caption lang-${lang}`;
                    capEl.textContent = cap;
                    wrap.appendChild(capEl);
                });
            }
            card.appendChild(wrap);
        });
    }

    // Read tick — only for trackable blocks (has text or video). A block
    // with neither (e.g. an inline image-only block) has nothing to mark
    // read; see read-tracking.js's isBlockTrackable for the shared rule.
    if (isBlockTrackable(block)) {
        card.appendChild(buildReadTick(block, {
            isRead: readBlocks.has(block.id),
            totalBlockCount: state.totalBlockCount,
        }));
    }

    card.appendChild(buildShareButton({ blockId: block.id }));

    return card;
}
// ── View population ───────────────────────────────────────────────────────
function populateBookColumns() {
    const columns = document.getElementById('book-columns');
    if (!columns) return;
    columns.innerHTML = '';
    const readBlocks = getReadBlocks(localStorage);

    state.data.forEach(item => {
        // --- 0. HANDLE "insert" ITEMS ---
        // The front cover, section dividers, plain standalone photos and
        // pure blank pages are one item type; core/blocks.js's
        // classifyInsert() tells them apart (title / photo / blank). Each is
        // forced onto its own column, so it never shares a page with
        // anything else.
        if (item.type === 'insert') {
            const { block: insertBlock, image: imgData, kind, showId } =
                classifyInsert(item, state.activeLangs);
            const titleStyle = kind === 'title'; // block.content present -> big style

            const card = document.createElement('div');
            card.className = `book-card ${titleStyle ? 'title-style-page' : 'standalone-image'}`;
            card.id = `book-${item.id}`;

            // Same id badge every normal card gets (see createBookCard's
            // `bid` below) — suppressed only by `hideId: true` (meant for
            // the front cover), matching continuous view's id-badge rule
            // exactly. An earlier version never rendered this badge at all
            // for inserts, in either style, which was a book-view-only
            // regression once continuous view's badge was restored.
            if (showId) {
                const bid = document.createElement('span');
                bid.className = 'book-bid';
                bid.textContent = formatIdForDisplay(insertBlock);
                card.appendChild(bid);
            }

            if (imgData) {
                const wrap = document.createElement('div');
                wrap.className = titleStyle ? 'book-image-wrap title-style-image-wrap' : 'book-image-wrap';
                const imgEl = document.createElement('img');
                imgEl.src = imageUrl(imgData.src);
                imgEl.className = titleStyle ? 'book-image title-style-image' : 'book-image';
                wrap.appendChild(imgEl);

                if (!titleStyle) {
                    // Small per-image caption — the old plain "images" look.
                    state.activeLangs.forEach(lang => {
                        const capText = imgData.caption?.[lang];
                        if (capText && capText.trim()) {
                            const capEl = document.createElement('p');
                            capEl.className = `book-image-caption lang-${lang}`;
                            capEl.textContent = capText;
                            wrap.appendChild(capEl);
                        }
                    });
                }

                card.appendChild(wrap);
            }

            // block.content.<lang> is an array of lines/paragraphs, so an
            // insert's title-style text can span multiple lines just as
            // easily as a single short title.
            if (titleStyle) {
                const textWrap = document.createElement('div');
                textWrap.className = 'title-style-text-wrap';
                const ruleTop = document.createElement('div');
                ruleTop.className = 'title-style-text-rule';
                textWrap.appendChild(ruleTop);
                state.activeLangs.forEach(lang => {
                    (insertBlock?.content?.[lang] || []).forEach(line => {
                        if (!line.trim()) return;
                        const lineEl = document.createElement('div');
                        lineEl.className = `title-style-text-line lang-${lang}`;
                        lineEl.textContent = line;
                        textWrap.appendChild(lineEl);
                    });
                });
                const ruleBottom = document.createElement('div');
                ruleBottom.className = 'title-style-text-rule';
                textWrap.appendChild(ruleBottom);
                card.appendChild(textWrap);
            }

            columns.appendChild(card);
            return;
        }

        // --- 1. HANDLE STANDARD Q&A / SHLOKA CARDS ---
        const refs = item.references || [];
        item.blocks.forEach((block, blockIdx) => {
            const showExcerpt = blockIdx === 0 && refs.length > 0;
            const entry = { item, block, showExcerpt };
            columns.appendChild(createBookCard(entry, state.activeLangs, readBlocks));
        });
    });
}

// ── Reading position, by content ─────────────────────────────────────────
// A page number means nothing across layouts (a phone page holds far less than
// a desktop spread), so besides the page index we remember WHICH CARD the reader
// is looking at: the first card that starts on the current spread, or, when the
// spread only holds the tail of a long card, the last card that started before
// it. After the layout changes (rotate, resize) we jump to the spread that now
// contains that card. Uses offsetLeft, like searchBookView, which ignores the
// sliding transform.
function findAnchorId(columns, spreadWidth, spreadIndex) {
    if (!columns || !(spreadWidth > 0)) return null;
    const start = spreadIndex * spreadWidth;
    const end = start + spreadWidth;
    let before = null;
    for (const card of columns.querySelectorAll('.book-card')) {
        const left = card.offsetLeft;
        if (left >= start - 1 && left < end) return card.id || null;
        if (left < start) before = card;
        else break;
    }
    return before ? (before.id || null) : null;
}

// ── Spread rendering & Navigation ─────────────────────────────────────────
export function renderCurrentSpread() {
    const columns = document.getElementById('book-columns');
    const spread = document.getElementById('book-spread');
    const info = document.getElementById('book-spread-info');
    
    // Grab our new footer elements
    const leftNum = document.getElementById('book-page-num-left');
    const rightNum = document.getElementById('book-page-num-right');
    
    if (!columns || !spread) return;

    const spreadWidth = spread.clientWidth;
    const totalSpreads = Math.max(1, Math.ceil(columns.scrollWidth / spreadWidth));

    if (state.currentSpread >= totalSpreads) state.currentSpread = totalSpreads - 1;
    if (state.currentSpread < 0) state.currentSpread = 0;

    columns.style.transform = `translateX(-${state.currentSpread * spreadWidth}px)`;
    state.anchorId = findAnchorId(columns, spreadWidth, state.currentSpread);

    // Cover spread (spread 0, when present) is a title page: no running
    // head/footer, no page number — matching how a real printed book
    // treats its title page. Numbering for every spread after it shifts
    // back by one spread so the first real content page still reads "1".
    const onCoverSpread = state.hasCoverPage && state.currentSpread === 0;
    spread.classList.toggle('cover-spread', onCoverSpread);
    const spreadOffset = state.hasCoverPage ? 1 : 0;
    const ppp = pagesPerSpread();
    const numberedSpreads = Math.max(0, totalSpreads - spreadOffset);
    const totalNumberedPages = numberedSpreads * ppp;

    // Actual page numbers (first numbered spread = pages 1 & 2, or just 1 on
    // a phone, where each spread is a single page)
    const leftPage = ((state.currentSpread - spreadOffset) * ppp) + 1;
    const rightPage = leftPage + 1;

    if (leftNum) leftNum.textContent = onCoverSpread ? '' : leftPage;
    if (rightNum) rightNum.textContent = (onCoverSpread || ppp === 1) ? '' : rightPage;
    if (info) info.textContent = onCoverSpread ? '' : `(of ${totalNumberedPages})`;

    // Sync the input box with the current page ---
    const jumpInput = document.getElementById('book-jump-input');
    // Only update if the user isn't currently typing in it
    if (jumpInput && document.activeElement !== jumpInput) {
        jumpInput.value = onCoverSpread ? '' : leftPage;
    }

    const prevBtn = document.getElementById('book-prev');
    const nextBtn = document.getElementById('book-next');
    if (prevBtn) prevBtn.disabled = state.currentSpread <= 0;
    if (nextBtn) nextBtn.disabled = state.currentSpread >= totalSpreads - 1;

}

export function goToPrevSpread() {
    if (state.currentSpread <= 0) return;
    state.currentSpread--;
    renderCurrentSpread();
    saveSpread();
}

export function goToNextSpread() {
    state.currentSpread++;
    renderCurrentSpread();
    saveSpread();
}

export function jumpToPage(pageNumber) {
    // Translate the desired (real, numbered) Page Number back into a
    // Spread Index — offset by the cover's own spread when present, since
    // "page 1" is the first spread *after* the unnumbered cover. Typing 0
    // (the cover has no number of its own to type) jumps to the cover.
    const spreadOffset = state.hasCoverPage ? 1 : 0;
    if (state.hasCoverPage && pageNumber <= 0) {
        state.currentSpread = 0;
    } else {
        state.currentSpread = spreadOffset + Math.max(0, Math.floor((pageNumber - 1) / pagesPerSpread()));
    }
    renderCurrentSpread();
    saveSpread();
}

/**
 * Turns to the spread that holds a block's card and flashes it, so a link from
 * elsewhere (the AI assistant's citations) lands in the view the reader is
 * already using. Returns false when the book has no card for it (e.g. the
 * block has no text in the selected languages).
 */
export function jumpToBlock(blockId) {
    const columns = document.getElementById('book-columns');
    const spread = document.getElementById('book-spread');
    if (!columns || !spread) return false;
    const card = document.getElementById(`book-${blockId}`);
    if (!card) return false;
    const spreadWidth = spread.clientWidth;
    if (!(spreadWidth > 0)) return false;
    state.currentSpread = Math.max(0, Math.floor(card.offsetLeft / spreadWidth));
    renderCurrentSpread();
    saveSpread();
    card.classList.add('jump-highlight');
    setTimeout(() => card.classList.remove('jump-highlight'), 1800);
    return true;
}

// ── Search ────────────────────────────────────────────────────────────────
export function searchBookView(query) {
    if (!query.trim()) return;
    const q = query.toLowerCase();
    const cards = document.querySelectorAll('#book-columns .book-card');

    for (let card of cards) {
        if (card.textContent.toLowerCase().includes(q)) {
            // Find which CSS column this card landed in natively
            const spreadWidth = document.getElementById('book-spread').clientWidth;
            const spreadIndex = Math.floor(card.offsetLeft / spreadWidth);

            state.currentSpread = Math.max(0, spreadIndex);
            renderCurrentSpread();
            saveSpread();
            return;
        }
    }
}

// ── Print ─────────────────────────────────────────────────────────────────
// (Video / QR visibility needs no code here: it is the body.show-videos /
// body.show-qrs classes that header.js's updateMediaVisibility() maintains,
// same as continuous view.)

// Stub function to prevent errors from your existing app.js calls
export function renderPrintBook() { }

export function onBookLangChange(activeLangs) {
    state.activeLangs = activeLangs;
    populateBookColumns();
    // Allow CSS engine to reflow the columns before resetting bounds
    setTimeout(renderCurrentSpread, 100);
}

// ── Init ──────────────────────────────────────────────────────────────────
export function initBookView(data, activeLangs, containerId = 'book-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    state.data = data;
    state.activeLangs = activeLangs;
    state.containerId = containerId;
    ({ blockById: state.blockById, itemById: state.itemById } = buildBlockIndex(data));
    state.totalBlockCount = countTrackableBlocks(data);
    // A cover item, when present, is always the very first entry and always
    // occupies exactly one spread (image page + title page) — see
    // populateBookColumns. Page numbering treats it like a real book's
    // title page: unnumbered, with the first real content page starting
    // at "1" rather than "3".
    state.hasCoverPage = data[0]?.type === 'insert';

    // Added the static footers to the HTML!
    container.innerHTML = `
        <div class="book-shell">
            <div class="book-spread" id="book-spread">
                <div class="book-spine"></div>
                <div class="book-static-head left">ಜೈನ ಪೂಜಾ ವಿಚಾರ ಸಂಕಲನ</div>
                <div class="book-static-head right">Jaina Pooja Vichara Sankalana</div>

                <div class="book-columns" id="book-columns"></div>

                <div class="book-static-foot left" id="book-page-num-left"></div>
                <div class="book-static-foot right" id="book-page-num-right"></div>
            </div>

            <div class="book-nav">
                <button class="book-nav-btn" id="book-prev">← Prev</button>
                <div class="book-jump">
                    <span class="book-jump-label">Page</span>
                    <input type="number" id="book-jump-input" min="1" placeholder="1" title="Jump to page">
                    <span class="book-jump-label" id="book-spread-info"></span>
                    <button class="book-jump-go" id="book-jump-go">Go</button>
                </div>
                <button class="book-nav-btn" id="book-next">Next →</button>
            </div>
        </div>`;

    document.getElementById('book-prev').addEventListener('click', goToPrevSpread);
    document.getElementById('book-next').addEventListener('click', goToNextSpread);

    const jumpInput = document.getElementById('book-jump-input');
    const jumpGo = document.getElementById('book-jump-go');
    const doJump = () => { const v = parseInt(jumpInput.value, 10); if (!isNaN(v)) jumpToPage(v); };
    jumpGo.addEventListener('click', doJump);
    jumpInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJump(); });

    jumpInput.addEventListener('focus', () => {
        jumpInput.value = ''; 
    });
    jumpInput.addEventListener('blur', () => {
        if (jumpInput.value === '') {
            const spreadOffset = state.hasCoverPage ? 1 : 0;
            jumpInput.value = ((state.currentSpread - spreadOffset) * pagesPerSpread()) + 1;
        }
    });

    populateBookColumns();
    updateProgressDisplay(getReadBlocks(localStorage), state.totalBlockCount);
    state.mode = pagesPerSpread();
    state.currentSpread = parseInt(localStorage.getItem(storageKey()) || '0', 10);
    if (!Number.isFinite(state.currentSpread) || state.currentSpread < 0) state.currentSpread = 0;
    attachSwipe(document.getElementById('book-spread'));

    setTimeout(renderCurrentSpread, 150);
}

// ── Touch: swipe left/right to turn the page ──────────────────────────────
// Only a clearly horizontal drag counts (wider than 50px and more sideways
// than down), so reading by scrolling, pinch-zoom and text selection are
// untouched. touch-action: pan-y on .book-spread (CSS) leaves vertical
// scrolling to the browser.
const SWIPE_MIN_PX = 50;

export function attachSwipe(el) {
    if (!el) return;
    let startX = 0, startY = 0, tracking = false;
    el.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) { tracking = false; return; }
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        tracking = true;
    }, { passive: true });
    el.addEventListener('touchend', e => {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        if (dx < 0) goToNextSpread(); else goToPrevSpread();
    }, { passive: true });
    el.addEventListener('touchcancel', () => { tracking = false; }, { passive: true });
}

// Crossing the phone breakpoint (rotate, resize, fold) changes what one
// "spread" is and re-flows every page. Keep the reader on the same CONTENT:
// land on the spread that now holds the card they were reading (state.anchorId,
// recorded by renderCurrentSpread under the old layout).
function syncModeAfterResize() {
    const ppp = pagesPerSpread();
    if (state.mode && state.mode !== ppp) {
        state.mode = ppp;
        const spread = document.getElementById('book-spread');
        const anchor = state.anchorId ? document.getElementById(state.anchorId) : null;
        if (anchor && spread && spread.clientWidth > 0) {
            state.currentSpread = Math.max(0, Math.floor(anchor.offsetLeft / spread.clientWidth));
        }
        saveSpread();
    }
    renderCurrentSpread();
}

// Auto-recalculate the sliding distance if user resizes the window
window.addEventListener('resize', () => {
    setTimeout(syncModeAfterResize, 150);
});

// A paper-size or font-scale change resizes/rescales the page just like a
// window resize would (see header.js's notifyLayoutChanged()), but doesn't
// fire a native 'resize' event on its own — listen for the explicit signal
// too so pagination (spread width, total page count) doesn't go stale.
window.addEventListener('pooja:layout-changed', () => {
    setTimeout(syncModeAfterResize, 150);
});

// Registered once, at module scope — NOT inside initBookView. That function
// can run more than once in a session (e.g. re-rendering on every view-toggle
// click, so read-state stays in sync between views — see app.js), and a
// listener registered inside it would stack a new one on every call instead
// of replacing the last, causing a single arrow-key press to advance
// multiple spreads at once. state.containerId is set by the most recent
// initBookView call; checked dynamically here rather than captured in a
// closure at registration time, for the same reason.
document.addEventListener('keydown', e => {
    const c = document.getElementById(state.containerId || 'book-container');
    if (!c || !c.classList.contains('active')) return;
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') goToPrevSpread();
    if (e.key === 'ArrowRight' || e.key === 'PageDown') goToNextSpread();
});

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        initBookView, renderCurrentSpread,
        goToPrevSpread, goToNextSpread, jumpToPage, searchBookView,
        onBookLangChange, renderPrintBook, attachSwipe,
    });
}