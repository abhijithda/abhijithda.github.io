// book-view.js — Book spread view powered by CSS Multi-column Layout.

import { extractYouTubeId, buildYouTubeThumbnailUrl, buildQrUrl } from '../../core/media.js';
import { getReadBlocks, saveReadBlocks, toggleBlockRead, isBlockTrackable, updateProgressDisplay } from '../../core/read-tracking.js';
import { formatIdForDisplay, resolveReference } from '../../core/blocks.js';

const state = {
    data: [],
    blockById: {},
    itemById: {},
    totalBlockCount: 0,
    currentSpread: 0,
    activeLangs: ['kn', 'en']
};

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

    if (block.videos && block.videos.length > 0) {
        block.videos.forEach(v => {
            const videoId = extractYouTubeId(v.url);
            if (!videoId) return;

            const row = document.createElement('div');
            row.className = 'book-vid-row';

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

    if (block.images && block.images.length > 0) {
        block.images.forEach(img => {
            const wrap = document.createElement('div');
            wrap.className = 'book-image-wrap';
            const imgEl = document.createElement('img');
            imgEl.src = img.src.includes('://') ? img.src : `images/${img.src}`;
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
            updateProgressDisplay(newSet, state.totalBlockCount);
        };
        card.appendChild(tick);
    }

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
        // The front cover, section dividers, plain standalone photos, and
        // pure blank pages are all one item type now — a standalone photo
        // is really just an "insert" with a per-image caption instead of a
        // page title. Distinguished only by which fields its one block has:
        //   block.images[0].caption -> small caption text (the old plain
        //                              "images" look)
        //   block.content           -> big centered title-style text
        //                              (dash-ruled), which wins if both are
        //                              somehow present
        //   neither                 -> no text at all
        //   no image either         -> a genuinely blank page
        // Forced onto its own column, so it never shares a page with
        // anything else.
        if (item.type === 'insert') {
            const insertBlock = item.blocks && item.blocks[0];
            const imgData = insertBlock && insertBlock.images && insertBlock.images[0];

            const hasContent = state.activeLangs.some(lang =>
                (insertBlock?.content?.[lang] || []).some(line => line.trim() !== ''));
            const titleStyle = hasContent; // block.content present -> big style

            const card = document.createElement('div');
            card.className = `book-card ${titleStyle ? 'title-style-page' : 'standalone-image'}`;
            card.id = `book-${item.id}`;

            if (imgData) {
                const wrap = document.createElement('div');
                wrap.className = titleStyle ? 'book-image-wrap title-style-image-wrap' : 'book-image-wrap';
                const imgEl = document.createElement('img');
                imgEl.src = imgData.src.includes('://') ? imgData.src : `images/${imgData.src}`;
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

    // Cover spread (spread 0, when present) is a title page: no running
    // head/footer, no page number — matching how a real printed book
    // treats its title page. Numbering for every spread after it shifts
    // back by one spread so the first real content page still reads "1".
    const onCoverSpread = state.hasCoverPage && state.currentSpread === 0;
    spread.classList.toggle('cover-spread', onCoverSpread);
    const spreadOffset = state.hasCoverPage ? 1 : 0;
    const numberedSpreads = Math.max(0, totalSpreads - spreadOffset);
    const totalNumberedPages = numberedSpreads * 2;

    // Calculate actual Page Numbers (first numbered spread = Pages 1 & 2)
    const leftPage = ((state.currentSpread - spreadOffset) * 2) + 1;
    const rightPage = ((state.currentSpread - spreadOffset) * 2) + 2;

    if (leftNum) leftNum.textContent = onCoverSpread ? '' : leftPage;
    if (rightNum) rightNum.textContent = onCoverSpread ? '' : rightPage;
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

    applyBookMediaVisibility();
}

export function goToPrevSpread() {
    if (state.currentSpread <= 0) return;
    state.currentSpread--;
    renderCurrentSpread();
    localStorage.setItem('bookSpread', state.currentSpread);
}

export function goToNextSpread() {
    state.currentSpread++;
    renderCurrentSpread();
    localStorage.setItem('bookSpread', state.currentSpread);
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
        state.currentSpread = spreadOffset + Math.max(0, Math.floor((pageNumber - 1) / 2));
    }
    renderCurrentSpread();
    localStorage.setItem('bookSpread', state.currentSpread);
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
            localStorage.setItem('bookSpread', state.currentSpread);
            return;
        }
    }
}

// ── Media & Print ─────────────────────────────────────────────────────────
export function applyBookMediaVisibility() {
    const showVideos = document.getElementById('toggle-videos')?.checked ?? true;
    const showQrs = document.getElementById('toggle-qrs')?.checked ?? false;

    document.querySelectorAll('#book-container .book-vid-row').forEach(row => {
        row.style.display = (!showVideos && !showQrs) ? 'none' : 'flex';
    });
    document.querySelectorAll('#book-container .book-vid-thumb').forEach(el => {
        el.style.display = showVideos ? '' : 'none';
    });
    document.querySelectorAll('#book-container .book-vid-qr').forEach(el => {
        el.style.display = showQrs ? '' : 'none';
    });
}

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
    state.blockById = {};
    state.itemById = {};
    data.forEach(item => {
        state.itemById[item.id] = item;
        (item.blocks || []).forEach(b => { state.blockById[b.id] = b; });
    });
    // "insert" items (front cover, dividers) are decorative structure, not
    // content a reader marks as read — excluded from the count entirely,
    // even if their block happens to carry title text that would otherwise
    // look "trackable" by the generic per-block rule.
    state.totalBlockCount = data.reduce((s, item) =>
        item.type === 'insert' ? s : s + (item.blocks || []).filter(isBlockTrackable).length, 0);
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
            jumpInput.value = ((state.currentSpread - spreadOffset) * 2) + 1;
        }
    });

    populateBookColumns();
    updateProgressDisplay(getReadBlocks(localStorage), state.totalBlockCount);
    state.currentSpread = parseInt(localStorage.getItem('bookSpread') || '0', 10);

    setTimeout(renderCurrentSpread, 150);
}

// Auto-recalculate the sliding distance if user resizes the window
window.addEventListener('resize', () => {
    setTimeout(renderCurrentSpread, 150);
});

// A paper-size or font-scale change resizes/rescales the page just like a
// window resize would (see header.js's notifyLayoutChanged()), but doesn't
// fire a native 'resize' event on its own — listen for the explicit signal
// too so pagination (spread width, total page count) doesn't go stale.
window.addEventListener('pooja:layout-changed', () => {
    setTimeout(renderCurrentSpread, 150);
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
        applyBookMediaVisibility, onBookLangChange, renderPrintBook,
    });
}