// book-view.js — Book view: two-page spreads, image-aware pagination, card splitting.

import { escapeHtml, linkify, extractYouTubeId } from './media.js';
import { getReadBlocks } from './read-tracking.js';

let bookViewState = {
    spreads: [],
    currentSpreadIndex: 0,
    viewMode: localStorage.getItem('viewMode') || 'continuous',
    bookTitle: 'ಜೈನ ಪೂಜಾ ವಿಚಾರ ಸಂಕಲನ / Jaina Pooja Vichara Sankalana',
};

export async function createBookView(messageData) {
    const bookView = document.getElementById('book-view');
    if (!bookView) return;

    bookView.innerHTML = '';

    const shell = document.createElement('div');
    shell.className = 'book-shell';

    const spreads = await buildSpreads(messageData);
    bookViewState.spreads = spreads;

    const spreadContainer = document.createElement('div');
    spreadContainer.id = 'current-spread-container';
    shell.appendChild(spreadContainer);

    const nav = createBookNavigation();
    shell.appendChild(nav);

    bookView.appendChild(shell);

    renderSpreadAtIndex(0);
}

function shouldShowInBookView(message) {
    if (!message || !message.type) return false;
    if (message.id === '__metadata__') return false;
    return true;
}

function estimateCardHeight(message) {
    // Fallback only — used in jsdom (tests) where real layout isn't available.
    let height = 60;
    if (message.blocks) {
        message.blocks.forEach((block) => {
            const kn = (block.content && block.content.kn || []).join(' ').length;
            const en = (block.content && block.content.en || []).join(' ').length;
            height += ((kn + en) / 50) * 20;
        });
    }
    return Math.min(height, 200);
}

// ── Off-screen measurement probe ────────────────────────────────────────────
// The probe mirrors the real two-page flex structure so the measured width
// (~424px) matches what each column actually renders at. A single .book-page
// child would stretch to fill the entire 960px spread; the empty sibling
// forces the 50/50 flex split that makes text wrap the same way it will on
// the real page.
let _probeContent = null;
function getProbeContainer() {
    if (typeof document === 'undefined' || !document.body) return null;
    if (_probeContent && document.body.contains(_probeContent)) return _probeContent;

    const wrapper = document.createElement('div');
    wrapper.className = 'book-spread';
    wrapper.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;top:-9999px;left:-9999px;height:auto;';

    const page = document.createElement('div');
    page.className = 'book-page left';
    page.style.height = 'auto';

    const content = document.createElement('div');
    content.className = 'page-content';
    content.style.cssText = 'overflow:visible;height:auto;mask-image:none;';

    page.appendChild(content);
    wrapper.appendChild(page);

    const rightPlaceholder = document.createElement('div');
    rightPlaceholder.className = 'book-page right';
    wrapper.appendChild(rightPlaceholder);

    document.body.appendChild(wrapper);
    _probeContent = content;
    return _probeContent;
}

function waitForImagesToSettle(cardEl, timeoutMs = 2500) {
    const imgs = Array.from(cardEl.querySelectorAll('img'));
    if (imgs.length === 0) return Promise.resolve();
    return Promise.all(imgs.map((img) => new Promise((resolve) => {
        if (img.complete) { resolve(); return; }
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, timeoutMs);
    })));
}

async function measureCardHeight(cardEl) {
    const probe = getProbeContainer();
    if (!probe) return null;
    probe.appendChild(cardEl);
    await waitForImagesToSettle(cardEl);
    const height = cardEl.offsetHeight;
    probe.removeChild(cardEl);
    return height > 0 ? height : null;
}

// ── Card builder ─────────────────────────────────────────────────────────────
function createBookCard(message, messageData, options) {
    options = options || {};
    const blockIndices = options.blockIndices || null;
    const showHeader = options.showHeader !== false;
    const showReadTick = options.showReadTick !== false;
    const domId = options.domId || message.id;
    const lineRange = options.lineRange || null;

    const card = document.createElement('div');
    card.className = `card ${message.type}`;
    card.id = domId;

    let html = '';

    if (showHeader) {
        if (message.references && message.references.length > 0) {
            const refId = message.references[0];
            let refBlock = null;
            if (messageData) {
                const refMessage = messageData.find(m => m.id === refId);
                if (refMessage && refMessage.blocks && refMessage.blocks.length > 0) {
                    refBlock = refMessage.blocks[0];
                }
            }
            if (refBlock) {
                const refKn = (refBlock.content && refBlock.content.kn || []).join(' ').slice(0, 80);
                const refEn = (refBlock.content && refBlock.content.en || []).join(' ').slice(0, 80);
                html += `<div class="reply-excerpt"><span class="ref-label">Ref: ${escapeHtml(refId)}</span> ${escapeHtml(refKn)} / ${escapeHtml(refEn)}</div>`;
            }
        }
        html += `<span class="block-id">${escapeHtml(message.id)}</span>`;
    } else {
        html += `<span class="block-id continued">${escapeHtml(message.id)} (continued)</span>`;
    }

    if (message.blocks) {
        message.blocks.forEach((block, idx) => {
            if (blockIndices && !blockIndices.includes(idx)) return;

            const restrictLines = lineRange && lineRange.blockIndex === idx;
            const knLines = block.content && block.content.kn || [];
            const enLines = block.content && block.content.en || [];
            const kn = (restrictLines ? knLines.slice(lineRange.start, lineRange.end) : knLines).join('\n');
            const en = (restrictLines ? enLines.slice(lineRange.start, lineRange.end) : enLines).join('\n');

            if (kn && kn.trim()) {
                html += `<div class="block-kn">${linkify(escapeHtml(kn)).replace(/\n/g, '<br>')}</div>`;
            }
            if (en && en.trim()) {
                html += `<div class="block-en">${linkify(escapeHtml(en)).replace(/\n/g, '<br>')}</div>`;
            }

            const includeMedia = !restrictLines || lineRange.includeMedia;

            if (includeMedia && block.images && block.images.length > 0) {
                html += `<div class="col-media has-images">`;
                block.images.forEach((img) => {
                    const capKn = img.caption && img.caption.kn ? img.caption.kn : '';
                    const capEn = img.caption && img.caption.en ? img.caption.en : '';
                    const capText = (capKn && capEn) ? `${capKn} / ${capEn}` : (capKn || capEn);
                    html += `<div class="image-card"><img src="images/${escapeHtml(img.src)}" alt="${escapeHtml(capText)}">${capText ? `<p class="image-caption">${escapeHtml(capText)}</p>` : ''}</div>`;
                });
                html += `</div>`;
            }

            if (includeMedia && block.videos && block.videos.length > 0) {
                html += `<div class="col-media has-videos">`;
                block.videos.forEach((v) => {
                    html += createVideoCardHtml(v.url);
                });
                html += `</div>`;
            }
        });
    }

    if (showReadTick) {
        const readBlocks = getReadBlocks(localStorage);
        const isRead = readBlocks.has(message.id);
        html += `<div class="read-tick${isRead ? ' done' : ''}"></div>`;
    }

    card.innerHTML = html;
    return card;
}

// Inline video card HTML — mirrors media.js createPipThumbnail but returns
// a simple HTML string for insertion via innerHTML (no DOM methods needed).
function createVideoCardHtml(url) {
    if (!url) return '';
    const videoId = extractYouTubeId ? extractYouTubeId(url) : null;
    if (!videoId) return `<div class="video-card"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Watch Video</a></div>`;
    const thumb = `https://img.youtube.com/vi/${videoId}/0.jpg`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(url)}`;
    return `<div class="media-wrap">
        <div class="video-card">
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
                <img src="${escapeHtml(thumb)}" alt="Watch Video">
            </a>
        </div>
        <div class="qr-code"><img src="${escapeHtml(qrUrl)}" alt="QR Code"></div>
    </div>`;
}

// ── Pagination ────────────────────────────────────────────────────────────────
export async function buildSpreads(messageData) {
    const spreads = [];
    const pageHeight = 520;
    const CARD_MARGIN = 8;
    let column = 'left';
    let columnHeight = 0;
    let leftItems = [];
    let rightItems = [];
    let currentPageNumber = 1;

    function flushSpread() {
        if (leftItems.length > 0 || rightItems.length > 0) {
            spreads.push({ type: 'text', pageNumber: currentPageNumber, leftItems, rightItems, messageData });
            currentPageNumber += 2;
        }
        leftItems = []; rightItems = [];
        column = 'left'; columnHeight = 0;
    }

    function placeItem(item, itemHeight) {
        if (columnHeight + itemHeight <= pageHeight || (column === 'left' && leftItems.length === 0)) {
            (column === 'left' ? leftItems : rightItems).push(item);
            columnHeight += itemHeight;
        } else if (column === 'left') {
            column = 'right';
            rightItems.push(item);
            columnHeight = itemHeight;
        } else {
            flushSpread();
            leftItems.push(item);
            columnHeight = itemHeight;
        }
    }

    for (const message of messageData) {
        if (!shouldShowInBookView(message)) continue;

        if (message.type === 'images') {
            flushSpread();
            spreads.push({ type: 'image', pageNumber: currentPageNumber, item: message });
            currentPageNumber += 2;
            continue;
        }

        const wholeCardEl = createBookCard(message, messageData);
        const wholeMeasured = await measureCardHeight(wholeCardEl);
        const wholeHeight = (wholeMeasured != null ? wholeMeasured : estimateCardHeight(message)) + CARD_MARGIN;

        if (wholeHeight <= pageHeight) {
            placeItem({ ...message, __bookEl: wholeCardEl }, wholeHeight);
            continue;
        }

        // Card doesn't fit on a full page — split at block boundaries
        const blocks = message.blocks || [];
        for (let bi = 0; bi < blocks.length; bi++) {
            const isFirst = bi === 0;
            const isLastBlock = bi === blocks.length - 1;
            const fragEl = createBookCard(message, messageData, {
                blockIndices: [bi], showHeader: isFirst, showReadTick: isLastBlock,
                domId: isLastBlock ? message.id : `${message.id}__part${bi + 1}`,
            });
            const fragMeasured = await measureCardHeight(fragEl);
            const fragHeight = (fragMeasured != null ? fragMeasured : 60) + CARD_MARGIN;

            if (fragHeight <= pageHeight) {
                placeItem({ ...message, id: isLastBlock ? message.id : `${message.id}__part${bi + 1}`, __bookEl: fragEl }, fragHeight);
                continue;
            }

            // Even one block is too tall — split line by line
            const block = blocks[bi];
            const lineCount = Math.max((block.content && block.content.kn || []).length, (block.content && block.content.en || []).length, 1);
            let lineStart = 0, partNum = bi + 1;
            while (lineStart < lineCount) {
                let end = lineStart + 1, bestEl = null, bestHeight = null;
                while (end <= lineCount) {
                    const isLastChunk = end === lineCount;
                    const candidateEl = createBookCard(message, messageData, {
                        blockIndices: [bi], showHeader: isFirst && lineStart === 0, showReadTick: isLastBlock && isLastChunk,
                        domId: `${message.id}__part${partNum}`,
                        lineRange: { blockIndex: bi, start: lineStart, end, includeMedia: isLastChunk },
                    });
                    const candidateHeight = (await measureCardHeight(candidateEl) ?? 60) + CARD_MARGIN;
                    if (candidateHeight > pageHeight && end > lineStart + 1) break;
                    bestEl = candidateEl; bestHeight = candidateHeight;
                    end++;
                    if (candidateHeight > pageHeight) break;
                }
                const isLastChunk = (end - 1) === lineCount;
                const fragId = isLastBlock && isLastChunk ? message.id : `${message.id}__part${partNum}`;
                placeItem({ ...message, id: fragId, __bookEl: bestEl }, bestHeight);
                lineStart = end - 1; partNum++;
            }
        }
    }

    flushSpread();
    return spreads;
}


export function renderSpreadAtIndex(idx) {
    if (idx < 0 || idx >= bookViewState.spreads.length) return;

    bookViewState.currentSpreadIndex = idx;
    const spread = bookViewState.spreads[idx];
    const container = document.getElementById('current-spread-container');

    if (!container) return;
    container.innerHTML = '';

    if (spread.type === 'toc') {
        container.appendChild(createTOCElement(spread));
    } else if (spread.type === 'text') {
        container.appendChild(createTextSpreadElement(spread));
    } else if (spread.type === 'image') {
        container.appendChild(createImageSpreadElement(spread));
    }

    updateBookNavigation();
}

function createTOCElement(spread) {
    const spreadEl = document.createElement('div');
    spreadEl.className = 'book-spread';

    const leftPage = document.createElement('div');
    leftPage.className = 'book-page left';
    leftPage.innerHTML = `
        <div class="running-head">ಜೈನ ಪೂಜಾ ವಿಚಾರ ಸಂಕಲನ</div>
        <div class="page-content">
            <div class="toc-container">
                <div class="toc-title">Contents</div>
                <div class="toc-subtitle">Table of Questions</div>
            </div>
        </div>
        <div class="page-num">1</div>
    `;

    const rightPage = document.createElement('div');
    rightPage.className = 'book-page right';
    let tocHtml = `
        <div class="running-head">Jaina Pooja Vichara Sankalana</div>
        <div class="page-content">
            <ul class="toc-list">
    `;

    spread.items.forEach((item, i) => {
        const pageNum = 3 + Math.floor(i / 4) * 2;
        tocHtml += `
            <li class="toc-item">
                <div class="toc-item-text">
                    <span class="toc-item-label">${escapeHtml(item.kn)} / ${escapeHtml(item.en)}</span>
                    <span class="toc-item-page">${pageNum}</span>
                </div>
            </li>
        `;
    });

    tocHtml += `</ul></div><div class="page-num">2</div>`;
    rightPage.innerHTML = tocHtml;

    spreadEl.appendChild(leftPage);
    spreadEl.appendChild(rightPage);
    return spreadEl;
}

function createTextSpreadElement(spread) {
    const spreadEl = document.createElement('div');
    spreadEl.className = 'book-spread';

    const leftPage = document.createElement('div');
    leftPage.className = 'book-page left';
    leftPage.innerHTML = `<div class="running-head">ಜೈನ ಪೂಜಾ ವಿಚಾರ ಸಂಕಲನ</div><div class="page-content"></div><div class="page-num">${spread.pageNumber}</div>`;

    const leftContent = leftPage.querySelector('.page-content');
    spread.leftItems.forEach(msg => {
        leftContent.appendChild(createBookCard(msg, spread.messageData));
    });

    const rightPage = document.createElement('div');
    rightPage.className = 'book-page right';
    rightPage.innerHTML = `<div class="running-head">Jaina Pooja Vichara Sankalana</div><div class="page-content"></div><div class="page-num">${spread.pageNumber + 1}</div>`;

    const rightContent = rightPage.querySelector('.page-content');
    spread.rightItems.forEach(msg => {
        rightContent.appendChild(createBookCard(msg, spread.messageData));
    });

    spreadEl.appendChild(leftPage);
    spreadEl.appendChild(rightPage);
    return spreadEl;
}

function createImageSpreadElement(spread) {
    const spreadEl = document.createElement('div');
    spreadEl.className = 'book-spread';

    const item = spread.item;

    let imageUrl = null;
    let captionKn = '';
    let captionEn = '';

    if (item.blocks && item.blocks.length > 0) {
        const block = item.blocks[0];
        if (block.images && block.images.length > 0) {
            const imgData = block.images[0];
            imageUrl = imgData.src || imgData.url;
            if (!imageUrl.includes('://')) {
                imageUrl = `images/${imageUrl}`;
            }
            if (imgData.caption) {
                captionKn = imgData.caption.kn || '';
                captionEn = imgData.caption.en || '';
            }
        }
    }

    const leftPage = document.createElement('div');
    leftPage.className = 'book-page left';
    leftPage.innerHTML = `
        <div class="running-head">ಜೈನ ಪೂಜಾ ವಿಚಾರ ಸಂಕಲನ</div>
        <div class="caption-page">
            <div class="caption-block-id">${escapeHtml(item.id)}</div>
            <div class="caption-rule"></div>
            <div class="caption-kn">${escapeHtml(captionKn)}</div>
            <div class="caption-rule"></div>
            <div class="caption-en">${escapeHtml(captionEn)}</div>
        </div>
        <div class="page-num">${spread.pageNumber}</div>
    `;

    const rightPage = document.createElement('div');
    rightPage.className = 'book-page right';
    let imageHtml = `<div class="running-head">Jaina Pooja Vichara Sankalana</div><div class="image-page">`;

    if (imageUrl) {
        imageHtml += `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(captionKn)}">`;
    }

    imageHtml += `</div><div class="page-num">${spread.pageNumber + 1}</div>`;
    rightPage.innerHTML = imageHtml;

    spreadEl.appendChild(leftPage);
    spreadEl.appendChild(rightPage);
    return spreadEl;
}

// ── Navigation ────────────────────────────────────────────────────────────────
function createBookNavigation() {
    const nav = document.createElement('div');
    nav.className = 'book-nav';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'nav-btn';
    prevBtn.id = 'book-prev-btn';
    prevBtn.textContent = '← Previous';
    prevBtn.onclick = () => {
        if (bookViewState.currentSpreadIndex > 0) renderSpreadAtIndex(bookViewState.currentSpreadIndex - 1);
    };

    const indicator = document.createElement('span');
    indicator.className = 'page-indicator';
    indicator.id = 'book-page-indicator';
    indicator.style.cssText = 'cursor:pointer;padding:4px 8px;border-radius:4px;transition:background 0.2s;user-select:none;';
    indicator.onmouseenter = () => { indicator.style.background = 'rgba(255,255,255,0.1)'; };
    indicator.onmouseleave = () => { indicator.style.background = 'transparent'; };
    indicator.onclick = (e) => {
        e.stopPropagation();
        const spread = bookViewState.spreads[bookViewState.currentSpreadIndex];
        const input = document.createElement('input');
        input.type = 'number';
        input.value = spread.pageNumber;
        input.min = '1';
        input.style.cssText = 'width:45px;padding:4px 6px;border:1px solid rgba(255,255,255,0.5);background:rgba(255,255,255,0.15);color:white;font-size:12px;text-align:center;border-radius:3px;font-weight:bold;';
        indicator.innerHTML = '';
        indicator.appendChild(input);
        input.focus();
        input.select();
        const handleSubmit = () => {
            const p = parseInt(input.value, 10);
            if (!isNaN(p) && p > 0) jumpToPage(p);
            updateBookNavigation();
        };
        input.onkeydown = (e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') updateBookNavigation(); };
        input.onblur = handleSubmit;
    };

    const nextBtn = document.createElement('button');
    nextBtn.className = 'nav-btn';
    nextBtn.id = 'book-next-btn';
    nextBtn.textContent = 'Next →';
    nextBtn.onclick = () => {
        if (bookViewState.currentSpreadIndex < bookViewState.spreads.length - 1) renderSpreadAtIndex(bookViewState.currentSpreadIndex + 1);
    };

    nav.appendChild(prevBtn);
    nav.appendChild(indicator);
    nav.appendChild(nextBtn);
    return nav;
}

function jumpToPage(pageNum) {
    if (!isNaN(pageNum) && pageNum > 0) {
        const idx = bookViewState.spreads.findIndex(s => s.pageNumber === pageNum);
        if (idx >= 0) renderSpreadAtIndex(idx);
    }
}

function updateBookNavigation() {
    const prevBtn = document.getElementById('book-prev-btn');
    const nextBtn = document.getElementById('book-next-btn');
    const indicator = document.getElementById('book-page-indicator');
    if (!prevBtn || !nextBtn || !indicator) return;

    const spread = bookViewState.spreads[bookViewState.currentSpreadIndex];
    const totalPages = bookViewState.spreads.reduce((max, s) => Math.max(max, (s.pageNumber || 0) + 1), 2);
    indicator.textContent = `Pages ${spread.pageNumber}–${spread.pageNumber + 1} of ${totalPages}`;
    prevBtn.disabled = bookViewState.currentSpreadIndex === 0;
    nextBtn.disabled = bookViewState.currentSpreadIndex === bookViewState.spreads.length - 1;

    window.history.replaceState({ spreadIndex: bookViewState.currentSpreadIndex }, '', `?page=${spread.pageNumber}`);
}

// ── initializePageFromURL ─────────────────────────────────────────────────────
function initializePageFromURL() {
    const params = new URLSearchParams(window.location.search);
    const pageNum = parseInt(params.get('page'), 10);
    if (!isNaN(pageNum) && pageNum > 0) {
        const idx = bookViewState.spreads.findIndex(s => s.pageNumber === pageNum);
        if (idx >= 0) { renderSpreadAtIndex(idx); return true; }
    }
    return false;
}

export function setViewMode(mode) {
    bookViewState.viewMode = mode;
    localStorage.setItem('viewMode', mode);

    const continuousContainer = document.getElementById('continuous-container');
    const bookView = document.getElementById('book-view');

    if (mode === 'book') {
        if (continuousContainer) continuousContainer.style.display = 'none';
        if (bookView) bookView.style.display = 'flex';
    } else {
        if (continuousContainer) continuousContainer.style.display = 'flex';
        if (bookView) bookView.style.display = 'none';
    }

    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === mode);
    });
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        createBookView,
        buildSpreads,
        renderSpreadAtIndex,
        setViewMode,
        shouldShowInBookView,
        estimateCardHeight,
    });
}
