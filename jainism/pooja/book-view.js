// book-view.js — Book spread view.
// Two-page spread with fixed page height, pagination, multi-lang, video+QR, print.

import { extractYouTubeId, buildYouTubeThumbnailUrl, buildQrUrl } from './media.js';
import { getReadBlocks, saveReadBlocks, toggleBlockRead, computeProgress } from './read-tracking.js';
import { formatIdForDisplay, resolveReference } from './continuous-view.js';

// ── Known languages ───────────────────────────────────────────────────────
// The single source of truth for all views. header.js imports this to build
// the Settings lang picker. Add new languages here when translations are ready.
export const KNOWN_LANGS = [
    { code: 'kn', label: 'ಕನ್ನಡ', name: 'Kannada' },
    { code: 'en', label: 'English', name: 'English' },
    // Future — add translation data to data.json blocks, then uncomment:
    // { code: 'ta', label: 'தமிழ்', name: 'Tamil', future: true },
    // { code: 'hi', label: 'हिंदी', name: 'Hindi',  future: true },
];

// ── State ─────────────────────────────────────────────────────────────────
const state = {
    data: [],
    blockById: {},
    itemById: {},
    totalBlockCount: 0,
    pages: [],   // array of page-content arrays; index 0 = cover
    currentSpread: 0,    // left-page index (always even)
    activeLangs: ['kn', 'en'],
    allBlocks: [],   // flat ordered list for search
};

// ── Two-pass pagination ────────────────────────────────────────────────────
// Pass 1: render every card into a hidden off-screen container, measure its
//         real pixel height via getBoundingClientRect().
// Pass 2: bin-pack cards into pages using real heights.
//
// This avoids all char-count estimation error (Kannada glyphs vary 2× in width,
// video/image heights are highly content-dependent).
//
// PAGE_CONTENT_H is the available vertical space inside a page:
//   spread height (calc(100vh-182px)) − page padding (14+18px) − running head (≈21px)
// At 816px viewport: 634 − 32 − 21 = 581px. We use 590px for a small buffer.
// PAGE_CONTENT_H and probe width are measured from the real DOM at init time.
// See getPageDimensions() below.
let PAGE_CONTENT_H = 575; // px — fallback if DOM not yet ready; overridden at init
let PROBE_WIDTH = 700; // px — fallback content column width
const CARD_GAP = 4;   // px — margin-bottom between cards

/**
 * Measure the exact available content height and column width from a rendered page.
 * Call this AFTER the book spread is in the DOM (i.e. inside initBookView).
 * Stores results in PAGE_CONTENT_H and PROBE_WIDTH for use by buildPages.
 */
function getPageDimensions() {
    const pg = document.getElementById('book-page-left')
        || document.getElementById('book-page-right');
    if (!pg) return;

    const pgRect = pg.getBoundingClientRect();
    const rh = pg.querySelector('.book-running-head');
    const cs = window.getComputedStyle(pg);
    const padBot = parseFloat(cs.paddingBottom) || 18;
    const padH = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) || 28;

    if (rh) {
        const rhRect = rh.getBoundingClientRect();
        const rhMarginBot = parseFloat(window.getComputedStyle(rh).marginBottom) || 6;
        const contentStart = rhRect.bottom + rhMarginBot;
        const contentEnd = pgRect.bottom - padBot;
        // Subtract a small safety buffer for subpixel/font rendering variance
        PAGE_CONTENT_H = Math.floor(contentEnd - contentStart) - 4;
    }

    // Probe width = page width minus horizontal padding
    PROBE_WIDTH = Math.floor(pgRect.width - padH);
}

// Returns true if a block has an inline image alongside text content.
// These get their own page so the image is never clipped by overflow:hidden.
function hasInlineImage(block) {
    return block.images && block.images.length > 0
        && Object.values(block.content || {}).some(lines =>
            lines.some(l => l.trim() !== '')
        );
}

// Returns true if a block contains ONLY image(s) with no text and no video.
// These blocks (e.g. i_013_b_4 inside an answer item) should be treated like
// standalone image items — placed alone on their own page.
function isImageOnlyBlock(block) {
    return block.images && block.images.length > 0
        && !block.videos?.length
        && !Object.values(block.content || {}).some(lines =>
            lines.some(l => l.trim() !== '')
        );
}

/**
 * Render all blocks into a hidden off-screen div, measure their real heights,
 * then bin-pack into pages of PAGE_CONTENT_H px.
 * Returns the pages array (same structure as before).
 */
/**
 * Measure a single card entry in the probe div, returning its pixel height.
 * Sets fixed dimensions on async-loaded images/videos before measuring so the
 * result is stable regardless of network state.
 */
function measureEntry(probe, entry, activeLangs, readBlocks) {
    const card = createBookCard(entry, activeLangs, readBlocks);
    // Fix async video thumbnails: CSS sets height:60px, so explicitly set here
    // so layout is stable without network load.
    card.querySelectorAll('.book-vid-img').forEach(img => {
        img.style.height = '60px';
        img.style.width = 'auto';
    });
    // Standalone image pages (isImageItem/isImageOnlyBlock) skip measurement (height=0),
    // so any .book-image here is an inline image in a text card — let it render at
    // natural size (width:100% in CSS, height:auto) for accurate measurement.
    probe.appendChild(card);
    const h = Math.ceil(card.getBoundingClientRect().height);
    probe.removeChild(card);
    return h;
}

/**
 * Split a block whose content exceeds PAGE_CONTENT_H into multiple page-entries,
 * each holding a contiguous slice of the kn/en line arrays.
 * Lines are split in parallel (kn[i] always pairs with en[i]).
 * Returns an array of page-entry objects ready for bin-packing.
 */
function splitBlockIntoEntries(item, block, showExcerpt, activeLangs, probe, readBlocks) {
    const knLines = block.content?.kn || [];
    const enLines = block.content?.en || [];
    const maxLen = Math.max(knLines.length, enLines.length);

    if (maxLen === 0) {
        // No text content (video/image only) — return as single entry
        return [{ item, block, showExcerpt }];
    }

    const entries = [];
    let lineStart = 0;
    let firstChunk = true;

    while (lineStart < maxLen) {
        // Binary-search for the largest line slice that fits in PAGE_CONTENT_H
        let lo = 1, hi = maxLen - lineStart, bestEnd = 1;

        while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            const slicedBlock = {
                ...block,
                content: {
                    ...block.content,
                    kn: knLines.slice(lineStart, lineStart + mid),
                    en: enLines.slice(lineStart, lineStart + mid),
                },
            };
            const entry = { item, block: slicedBlock, showExcerpt: firstChunk && showExcerpt };
            const h = measureEntry(probe, entry, activeLangs, readBlocks);
            if (h <= PAGE_CONTENT_H) {
                bestEnd = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }

        // Avoid infinite loop if even a single line overflows (very long line)
        if (bestEnd === 0) bestEnd = 1;

        const slicedBlock = {
            ...block,
            // Preserve a unique id for each split chunk so DOM ids don't clash
            id: lineStart === 0 ? block.id : block.id + '_split' + lineStart,
            content: {
                ...block.content,
                kn: knLines.slice(lineStart, lineStart + bestEnd),
                en: enLines.slice(lineStart, lineStart + bestEnd),
            },
            // Videos and images only appear in the first chunk
            videos: firstChunk ? block.videos : undefined,
            images: firstChunk ? block.images : undefined,
        };
        entries.push({ item, block: slicedBlock, showExcerpt: firstChunk && showExcerpt });

        lineStart += bestEnd;
        firstChunk = false;
    }

    return entries;
}

function buildPages(data, activeLangs) {
    // ── Set up probe div for measuring card heights ────────────────────────
    const probe = document.createElement('div');
    probe.style.cssText = [
        'position:fixed',
        'top:-9999px',
        'left:0',
        'width:' + PROBE_WIDTH + 'px',
        'visibility:hidden',
        'pointer-events:none',
        'overflow:visible',
    ].join(';');
    document.body.appendChild(probe);

    const readBlocks = getReadBlocks(localStorage);

    // ── Pass 1: flatten data into measurable entries ───────────────────────
    // For blocks that exceed PAGE_CONTENT_H, split them at line boundaries.
    // Image items and inline-image blocks bypass splitting (handled separately).
    const allEntries = []; // { item, block, showExcerpt, height, isImageItem, hasInlineImg }

    data.forEach(item => {
        const refs = item.references || [];
        const isImageItem = item.type === 'images';

        item.blocks.forEach((block, blockIdx) => {
            const showExcerpt = blockIdx === 0 && refs.length > 0;
            const hasInlineImg = hasInlineImage(block);

            // isImageOnlyBlock: image-only blocks within non-image items (e.g. i_013_b_4
            // inside an answer). These flow inline in the page at natural height —
            // giving them a dedicated page wastes the opposite half of the spread.
            // Only item.type==='images' gets a dedicated page.
            if (isImageItem || hasInlineImg) {
                allEntries.push({ item, block, showExcerpt, height: 0, isImageItem, hasInlineImg });
                return;
            }

            // Measure unsplit first
            const h = measureEntry(probe, { item, block, showExcerpt }, activeLangs, readBlocks);

            if (h <= PAGE_CONTENT_H) {
                allEntries.push({ item, block, showExcerpt, height: h, isImageItem: false, hasInlineImg: false });
            } else {
                // Block is too tall for one page — split at line boundaries
                const chunks = splitBlockIntoEntries(item, block, showExcerpt, activeLangs, probe, readBlocks);
                chunks.forEach(chunk => {
                    const ch = measureEntry(probe, chunk, activeLangs, readBlocks);
                    allEntries.push({ ...chunk, height: ch, isImageItem: false, hasInlineImg: false });
                });
            }
        });
    });

    // Note: probe stays in DOM through Pass 2 for greedy-fill measurements,
    // then is removed after bin-packing completes.

    // ── Pass 2: bin-pack entries into pages ────────────────────────────────
    const pages = [[]];
    let pageUsed = 0;

    function newPage() { pages.push([]); pageUsed = 0; }

    allEntries.forEach(entry => {
        const { item, block, showExcerpt, height, isImageItem, hasInlineImg } = entry;

        // ── Standalone image items: own dedicated page ────────────────────
        // No alignLeft — just flush current page and place image alone.
        // The mantra/next-content flows naturally on the next page after.
        if (isImageItem) {
            if (pageUsed > 0) newPage();
            pages[pages.length - 1].push({ item, block, showExcerpt: false });
            newPage();
            return;
        }

        // ── Blocks with inline images: own page ───────────────────────────
        if (hasInlineImg) {
            if (pageUsed > 0) newPage();
            pages[pages.length - 1].push({ item, block, showExcerpt });
            newPage();
            return;
        }

        // ── Normal / split entries: pack by real pixel height ─────────────
        const needed = height + (pageUsed > 0 ? CARD_GAP : 0);
        if (pageUsed + needed > PAGE_CONTENT_H && pageUsed > 0) {
            // Greedy fill: try to split the next block to partially fill remaining
            // space before starting a new page. Works even if blocks have only 1 line
            // per language — with many languages selected, even 1 line from each lang
            // can fill significant space.
            const remaining = PAGE_CONTENT_H - pageUsed - CARD_GAP;
            const knLines = block.content?.kn || [];
            const enLines = block.content?.en || [];
            const maxLen = Math.max(knLines.length, enLines.length);

            let didGreedyFill = false;
            if (remaining >= 20 && maxLen >= 1) {
                // Binary search: find largest line-count that fits in remaining space
                let lo = 1, hi = maxLen, bestFit = 0;
                while (lo <= hi) {
                    const mid = Math.floor((lo + hi) / 2);
                    const sliced = {
                        ...block, content: {
                            ...block.content,
                            kn: knLines.slice(0, mid), en: enLines.slice(0, mid)
                        }
                    };
                    const h = measureEntry(probe, { item, block: sliced, showExcerpt }, activeLangs, readBlocks);
                    if (h <= remaining) { bestFit = mid; lo = mid + 1; }
                    else hi = mid - 1;
                }
                if (bestFit > 0 && bestFit < maxLen) {
                    // Partial block fits on current page
                    const partBlock = {
                        ...block, id: block.id + '_fill',
                        content: {
                            ...block.content,
                            kn: knLines.slice(0, bestFit), en: enLines.slice(0, bestFit)
                        },
                        videos: undefined, images: undefined
                    };
                    const partH = measureEntry(probe, { item, block: partBlock, showExcerpt }, activeLangs, readBlocks);
                    pages[pages.length - 1].push({ item, block: partBlock, showExcerpt });
                    pageUsed += partH + CARD_GAP;
                    newPage();
                    const restBlock = {
                        ...block, id: block.id + '_rest',
                        content: {
                            ...block.content,
                            kn: knLines.slice(bestFit), en: enLines.slice(bestFit)
                        },
                        videos: block.videos, images: block.images
                    };
                    const restH = measureEntry(probe, { item, block: restBlock, showExcerpt: false }, activeLangs, readBlocks);
                    pages[pages.length - 1].push({ item, block: restBlock, showExcerpt: false });
                    pageUsed += restH;
                    didGreedyFill = true;
                    return;
                }
            }
            if (!didGreedyFill) newPage();
        }
        pages[pages.length - 1].push({ item, block, showExcerpt });
        pageUsed += height + (pageUsed > 0 ? CARD_GAP : 0);
    });

    document.body.removeChild(probe); // now safe to remove — Pass 2 complete

    if (pages.length % 2 !== 0) pages.push([]);
    return pages;
}

// ── Card factory ──────────────────────────────────────────────────────────
function createBookCard(entry, activeLangs, readBlocks) {
    const { item, block, showExcerpt } = entry;

    const card = document.createElement('div');
    card.className = `book-card ${item.type}${block.type && block.type !== item.type ? ' ' + block.type : ''}`;
    card.id = `book-${block.id}`;

    // Reply-excerpt strip
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

    // Block ID
    const bid = document.createElement('span');
    bid.className = 'book-bid';
    bid.textContent = formatIdForDisplay(block);
    card.appendChild(bid);

    // Language lines with separators
    const langLines = activeLangs.filter(lang =>
        block.content?.[lang]?.some(l => l.trim() !== '')
    );
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

    // Videos: one row per video (thumbnail left, QR right)
    if (block.videos && block.videos.length > 0) {
        block.videos.forEach(v => {
            const videoId = extractYouTubeId(v.url);
            if (!videoId) return;

            const row = document.createElement('div');
            row.className = 'book-vid-row';

            // Thumbnail
            const thumbWrap = document.createElement('div');
            thumbWrap.className = 'book-vid-thumb';
            const thumbImg = document.createElement('img');
            thumbImg.src = buildYouTubeThumbnailUrl(videoId);
            thumbImg.alt = 'Watch video';
            thumbImg.className = 'book-vid-img';
            const playLink = document.createElement('a');
            playLink.href = v.url;
            playLink.target = '_blank';
            playLink.className = 'book-vid-play';
            thumbWrap.appendChild(thumbImg);
            thumbWrap.appendChild(playLink);

            // QR — 200px source so it's scannable at print resolution
            const qrWrap = document.createElement('div');
            qrWrap.className = 'book-vid-qr';
            const qrImg = document.createElement('img');
            qrImg.src = buildQrUrl(v.url, 200);
            qrImg.alt = 'Scan to watch';
            qrImg.className = 'book-qr-img';
            qrWrap.appendChild(qrImg);

            row.appendChild(thumbWrap);
            row.appendChild(qrWrap);
            card.appendChild(row);
        });
    }

    // Images: full-width within the half-page column
    if (block.images && block.images.length > 0) {
        block.images.forEach(img => {
            const wrap = document.createElement('div');
            wrap.className = 'book-image-wrap';
            const imgEl = document.createElement('img');
            imgEl.src = img.src.includes('://') ? img.src : `images/${img.src}`;
            imgEl.alt = img.caption?.[activeLangs[0]] || img.caption?.kn || img.caption?.en || '';
            imgEl.className = 'book-image';
            wrap.appendChild(imgEl);
            card.appendChild(wrap);

            // Captions go BELOW the image wrap (not inside it) so overflow:hidden
            // on the wrap never clips them. Fall back to any available lang if the
            // active languages have no caption for this image.
            const availCaps = Object.entries(img.caption || {}).filter(([, v]) => v && v.trim());
            if (availCaps.length > 0) {
                const langsToShow = activeLangs.filter(lang => img.caption?.[lang]?.trim());
                (langsToShow.length > 0 ? langsToShow : [availCaps[0][0]]).forEach(lang => {
                    const cap = img.caption[lang];
                    if (!cap) return;
                    const capEl = document.createElement('p');
                    capEl.className = `book-image-caption lang-${lang}`;
                    capEl.textContent = cap;
                    card.appendChild(capEl); // sibling of wrap, not child
                });
            }
        });
    }

    // Read tick
    const isRead = readBlocks.has(block.id);
    const tick = document.createElement('button');
    tick.type = 'button';
    tick.className = `read-tick${isRead ? ' read' : ''}`;
    tick.title = isRead ? 'Marked as read' : 'Mark as read';
    tick.setAttribute('aria-label', tick.title);
    tick.textContent = isRead ? '✓' : '';
    tick.onclick = (e) => {
        e.stopPropagation();
        const newSet = toggleBlockRead(block.id, getReadBlocks(localStorage));
        saveReadBlocks(newSet, localStorage);
        const nowRead = newSet.has(block.id);
        tick.classList.toggle('read', nowRead);
        tick.textContent = nowRead ? '✓' : '';
        tick.title = nowRead ? 'Marked as read' : 'Mark as read';
        tick.setAttribute('aria-label', tick.title);
        const { read, total } = computeProgress(newSet, state.totalBlockCount);
        const el = document.getElementById('read-progress');
        if (el) el.textContent = `✓ ${read}/${total} read`;
    };
    card.appendChild(tick);

    return card;
}

// ── Page rendering ────────────────────────────────────────────────────────
function renderPage(pageEl, pageIndex, activeLangs, readBlocks) {
    // Remove previous cards, keep running-head and page-num
    pageEl.querySelectorAll('.book-card').forEach(el => el.remove());
    (state.pages[pageIndex] || []).forEach(entry =>
        pageEl.appendChild(createBookCard(entry, activeLangs, readBlocks))
    );
}

// ── Spread rendering ──────────────────────────────────────────────────────
export function renderCurrentSpread() {
    const leftEl = document.getElementById('book-page-left');
    const rightEl = document.getElementById('book-page-right');
    const leftNum = document.getElementById('book-page-num-left');
    const rightNum = document.getElementById('book-page-num-right');
    const info = document.getElementById('book-spread-info');
    if (!leftEl || !rightEl) return;

    const readBlocks = getReadBlocks(localStorage);
    const leftIdx = state.currentSpread;
    const rightIdx = state.currentSpread + 1;
    const totalPages = state.pages.length;

    renderPage(leftEl, leftIdx, state.activeLangs, readBlocks);
    renderPage(rightEl, rightIdx, state.activeLangs, readBlocks);

    if (leftNum) leftNum.textContent = leftIdx + 1;
    if (rightNum) rightNum.textContent = rightIdx + 1;
    if (info) {
        info.textContent = `pp. ${leftIdx + 1}–${rightIdx + 1} of ${totalPages}`;
    }

    const prevBtn = document.getElementById('book-prev');
    const nextBtn = document.getElementById('book-next');
    if (prevBtn) prevBtn.disabled = state.currentSpread <= 0;
    if (nextBtn) nextBtn.disabled = rightIdx >= totalPages - 1;

    applyBookMediaVisibility();
}

// ── Navigation ────────────────────────────────────────────────────────────
export function goToPrevSpread() {
    if (state.currentSpread <= 0) return;
    state.currentSpread = Math.max(0, state.currentSpread - 2);
    renderCurrentSpread();
    localStorage.setItem('bookSpread', state.currentSpread);
}

export function goToNextSpread() {
    if (state.currentSpread + 2 >= state.pages.length) return;
    state.currentSpread += 2;
    renderCurrentSpread();
    localStorage.setItem('bookSpread', state.currentSpread);
}

export function jumpToPage(pageNumber) {
    const idx = Math.max(0, Math.min(state.pages.length - 1, pageNumber));
    state.currentSpread = idx % 2 === 0 ? idx : idx - 1;
    renderCurrentSpread();
    localStorage.setItem('bookSpread', state.currentSpread);
}

// ── Search ────────────────────────────────────────────────────────────────
// Jump to the first spread containing a block whose text matches the query.
export function searchBookView(query) {
    if (!query.trim()) return;
    const q = query.toLowerCase();
    for (let pageIdx = 0; pageIdx < state.pages.length; pageIdx++) {
        const found = (state.pages[pageIdx] || []).some(({ block }) => {
            return state.activeLangs.some(lang =>
                (block.content?.[lang] || []).some(line => line.toLowerCase().includes(q))
            );
        });
        if (found) {
            state.currentSpread = pageIdx % 2 === 0 ? pageIdx : pageIdx - 1;
            renderCurrentSpread();
            localStorage.setItem('bookSpread', state.currentSpread);
            return;
        }
    }
}

// ── Media visibility ──────────────────────────────────────────────────────
export function applyBookMediaVisibility() {
    const showVideos = document.getElementById('toggle-videos')?.checked ?? true;
    const showQrs = document.getElementById('toggle-qrs')?.checked ?? false;

    document.querySelectorAll('.book-vid-row').forEach(row => {
        row.style.display = (!showVideos && !showQrs) ? 'none' : 'flex';
    });
    document.querySelectorAll('.book-vid-thumb').forEach(el => {
        el.style.display = showVideos ? '' : 'none';
    });
    document.querySelectorAll('.book-vid-qr').forEach(el => {
        el.style.display = showQrs ? '' : 'none';
    });

    // Also apply to print container
    document.querySelectorAll('#book-print-container .book-vid-row').forEach(row => {
        row.style.display = (!showVideos && !showQrs) ? 'none' : 'flex';
    });
    document.querySelectorAll('#book-print-container .book-vid-thumb').forEach(el => {
        el.style.display = showVideos ? '' : 'none';
    });
    document.querySelectorAll('#book-print-container .book-vid-qr').forEach(el => {
        el.style.display = showQrs ? '' : 'none';
    });
}

// ── Full-book print rendering ─────────────────────────────────────────────
// Renders ALL spreads into #book-print-container which is only visible in
// @media print. This makes Ctrl+P / browser print produce the entire book,
// not just the current spread.
export function renderPrintBook() {
    const printContainer = document.getElementById('book-print-container');
    if (!printContainer) return;

    printContainer.innerHTML = '';
    const readBlocks = getReadBlocks(localStorage);

    // Render pairs of pages as spreads
    for (let i = 0; i < state.pages.length; i += 2) {
        const spread = document.createElement('div');
        spread.className = 'book-print-spread';

        const leftPage = buildPrintPage(i, readBlocks, 'left');
        const rightPage = buildPrintPage(i + 1, readBlocks, 'right');
        spread.appendChild(leftPage);
        spread.appendChild(rightPage);
        printContainer.appendChild(spread);
    }

    applyBookMediaVisibility();
}

function buildPrintPage(pageIndex, readBlocks, side) {
    const pageEl = document.createElement('div');
    pageEl.className = `book-page ${side}`;

    const head = document.createElement('div');
    head.className = `book-running-head ${side}`;
    head.textContent = side === 'left'
        ? 'ಜೈನ ಪೂಜಾ ವಿಚಾರ ಸಂಕಲನ'
        : 'Jaina Pooja Vichara Sankalana';
    pageEl.appendChild(head);

    (state.pages[pageIndex] || []).forEach(entry =>
        pageEl.appendChild(createBookCard(entry, state.activeLangs, readBlocks))
    );

    const num = document.createElement('div');
    num.className = 'book-page-num';
    num.textContent = pageIndex + 1;
    pageEl.appendChild(num);

    return pageEl;
}

// ── Lang change ───────────────────────────────────────────────────────────
// Called by header.js initLangPicker when active langs change.
export function onBookLangChange(activeLangs) {
    state.activeLangs = activeLangs;
    state.pages = buildPages(state.data, activeLangs);
    // Ensure spread index is still in range
    if (state.currentSpread >= state.pages.length) {
        state.currentSpread = Math.max(0, state.pages.length - 2);
    }
    renderCurrentSpread();
    renderPrintBook();
    localStorage.setItem('bookSpread', state.currentSpread);
}

// ── Init ──────────────────────────────────────────────────────────────────
export function initBookView(data, activeLangs, containerId = 'book-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    state.data = data;
    state.activeLangs = activeLangs;
    state.blockById = {};
    state.itemById = {};
    data.forEach(item => {
        state.itemById[item.id] = item;
        item.blocks.forEach(b => { state.blockById[b.id] = b; });
    });
    state.totalBlockCount = data.reduce((s, item) => s + item.blocks.length, 0);

    // pages built below after DOM measurement — skip pre-build here

    // Restore saved spread position (will be applied again after re-paginate)
    const saved = parseInt(localStorage.getItem('bookSpread') || '0', 10);

    // Build the interactive spread skeleton
    container.innerHTML = `
        <div class="book-shell">
            <div class="book-spread" id="book-spread">
                <div class="book-spine"></div>

                <div class="book-page left" id="book-page-left">
                    <div class="book-running-head left">ಜೈನ ಪೂಜಾ ವಿಚಾರ ಸಂಕಲನ</div>
                    <div class="book-page-num" id="book-page-num-left"></div>
                </div>

                <div class="book-page right" id="book-page-right">
                    <div class="book-running-head right">Jaina Pooja Vichara Sankalana</div>
                    <div class="book-page-num" id="book-page-num-right"></div>
                </div>
            </div>

            <div class="book-nav">
                <button class="book-nav-btn" id="book-prev">← Prev</button>
                <div class="book-jump">
                    <span class="book-jump-label">p.</span>
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

    // Keyboard navigation (only when book view is active)
    document.addEventListener('keydown', e => {
        const c = document.getElementById(containerId);
        if (!c || !c.classList.contains('active')) return;
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') goToPrevSpread();
        if (e.key === 'ArrowRight' || e.key === 'PageDown') goToNextSpread();
    });

    // Measure real page dimensions. The container may be hidden (display:none)
    // at this point because setViewMode() runs after init. We briefly force-show
    // it to get valid getBoundingClientRect() values, then hide it again.
    const wasHidden = container.style.display === 'none' || !container.classList.contains('active');
    if (wasHidden) {
        container.style.visibility = 'hidden';
        container.style.display = 'flex';
        // Force reflow on container AND its children so getBoundingClientRect() returns real values.
        // Reading offsetHeight on the container alone isn't enough — child elements
        // need their own reflow triggered too.
        void container.offsetHeight;
        const spread = container.querySelector('.book-spread');
        const pg = container.querySelector('.book-page');
        void (spread ? spread.offsetHeight : 0);
        void (pg ? pg.offsetHeight : 0);
    }
    getPageDimensions();
    if (wasHidden) {
        container.style.display = ''; // empty string removes inline style so CSS class rules apply
        container.style.visibility = '';
    }

    // Re-paginate now that we have real dimensions, then render
    state.pages = buildPages(data, activeLangs);
    if (state.pages.length % 2 !== 0) state.pages.push([]);
    // Restore spread position after repagination
    const savedSpread2 = parseInt(localStorage.getItem('bookSpread') || '0', 10);
    if (!isNaN(savedSpread2) && savedSpread2 < state.pages.length) {
        state.currentSpread = savedSpread2 % 2 === 0 ? savedSpread2 : savedSpread2 - 1;
    }

    renderCurrentSpread();

    // Render print book after a short delay so the interactive view appears first
    setTimeout(renderPrintBook, 500);
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        KNOWN_LANGS, buildPages, initBookView, renderCurrentSpread,
        goToPrevSpread, goToNextSpread, jumpToPage, searchBookView,
        applyBookMediaVisibility, onBookLangChange, renderPrintBook,
    });
}
