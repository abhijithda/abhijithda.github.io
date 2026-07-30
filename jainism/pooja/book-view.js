// book-view.js — The existing book view with page spreads, moved out of script.js intact.
// Uses media.js and read-tracking.js for shared utilities.

import { escapeHtml, linkify } from './media.js';
import { getReadBlocks } from './read-tracking.js';

let bookViewState = {
    spreads: [],
    currentSpreadIndex: 0,
    viewMode: localStorage.getItem('viewMode') || 'continuous',
    bookTitle: 'ಜೈನ ಪೂಜಾ ವಿಚಾರ ಸಂಕಲನ / Jaina Pooja Vichara Sankalana',
};

export function createBookView(messageData) {
    const bookView = document.getElementById('book-view');
    if (!bookView) return;

    bookView.innerHTML = '';

    const shell = document.createElement('div');
    shell.className = 'book-shell';

    const spreads = buildSpreads(messageData);
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
    let height = 60;
    if (message.blocks) {
        message.blocks.forEach((block) => {
            if (block.type === 'paragraph') {
                const kn = (block.content.kn || []).join(' ').length;
                const en = (block.content.en || []).join(' ').length;
                height += ((kn + en) / 50) * 20;
            }
        });
    }
    return Math.min(height, 200);
}

export function buildSpreads(messageData) {
    const spreads = [];
    let currentPageHeight = 0;
    let currentPageNumber = 1;
    let leftPageItems = [];
    let rightPageItems = [];
    let pageHeight = 520;

    messageData.forEach((message) => {
        if (!shouldShowInBookView(message)) return;

        let cardHeight = estimateCardHeight(message);

        if (message.type === 'images') {
            if (leftPageItems.length > 0 || rightPageItems.length > 0) {
                spreads.push({
                    type: 'text',
                    pageNumber: currentPageNumber,
                    leftItems: leftPageItems,
                    rightItems: rightPageItems,
                    messageData: messageData,
                });
                currentPageNumber += 2;
                leftPageItems = [];
                rightPageItems = [];
                currentPageHeight = 0;
            }
            spreads.push({
                type: 'image',
                pageNumber: currentPageNumber,
                item: message,
            });
            currentPageNumber += 2;
            return;
        }

        if (currentPageHeight + cardHeight <= pageHeight) {
            leftPageItems.push(message);
            currentPageHeight += cardHeight;
        } else if (leftPageItems.length > 0 && rightPageItems.length === 0) {
            if (cardHeight <= pageHeight) {
                rightPageItems.push(message);
                currentPageHeight += cardHeight;
            } else {
                spreads.push({
                    type: 'text',
                    pageNumber: currentPageNumber,
                    leftItems: leftPageItems,
                    rightItems: rightPageItems,
                    messageData: messageData,
                });
                currentPageNumber += 2;
                leftPageItems = [message];
                rightPageItems = [];
                currentPageHeight = cardHeight;
            }
        } else if (leftPageItems.length > 0 && rightPageItems.length > 0) {
            spreads.push({
                type: 'text',
                pageNumber: currentPageNumber,
                leftItems: leftPageItems,
                rightItems: rightPageItems,
                messageData: messageData,
            });
            currentPageNumber += 2;
            leftPageItems = [message];
            rightPageItems = [];
            currentPageHeight = cardHeight;
        } else {
            leftPageItems.push(message);
            currentPageHeight = cardHeight;
        }
    });

    if (leftPageItems.length > 0 || rightPageItems.length > 0) {
        spreads.push({
            type: 'text',
            pageNumber: currentPageNumber,
            leftItems: leftPageItems,
            rightItems: rightPageItems,
            messageData: messageData,
        });
    }

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

function createBookCard(message, messageData) {
    const card = document.createElement('div');
    card.className = `card ${message.type}`;
    card.id = message.id;

    let html = '';

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
            html += `
                <div class="reply-excerpt">
                    <span class="ref-label">Ref: ${escapeHtml(refId)}</span>
                    ${escapeHtml(refKn)} / ${escapeHtml(refEn)}
                </div>
            `;
        }
    }

    html += `<span class="block-id">${escapeHtml(message.id)}</span>`;

    if (message.blocks) {
        message.blocks.forEach((block) => {
            if (block.type === 'paragraph' || block.type === 'note' || block.type === 'shloka') {
                const kn = (block.content && block.content.kn || []).join('\n');
                const en = (block.content && block.content.en || []).join('\n');

                if (kn && kn.trim()) {
                    html += `<div class="block-kn">${linkify(escapeHtml(kn)).replace(/\n/g, '<br>')}</div>`;
                }
                if (en && en.trim()) {
                    html += `<div class="block-en">${linkify(escapeHtml(en)).replace(/\n/g, '<br>')}</div>`;
                }
            }
        });
    }

    const readBlocks = getReadBlocks(localStorage);
    const isRead = readBlocks.has(message.id);
    html += `<div class="read-tick${isRead ? ' done' : ''}"></div>`;

    card.innerHTML = html;
    return card;
}

function createBookNavigation() {
    const nav = document.createElement('div');
    nav.className = 'book-nav';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'nav-btn';
    prevBtn.id = 'book-prev-btn';
    prevBtn.textContent = '← Previous';
    prevBtn.onclick = () => {
        if (bookViewState.currentSpreadIndex > 0) {
            renderSpreadAtIndex(bookViewState.currentSpreadIndex - 1);
        }
    };

    const indicator = document.createElement('span');
    indicator.className = 'page-indicator';
    indicator.id = 'book-page-indicator';
    indicator.style.cssText = 'cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: background 0.2s; user-select: none;';

    indicator.onmouseenter = () => {
        indicator.style.background = 'rgba(255,255,255,0.1)';
    };
    indicator.onmouseleave = () => {
        indicator.style.background = 'transparent';
    };

    indicator.onclick = async (e) => {
        e.stopPropagation();

        const spread = bookViewState.spreads[bookViewState.currentSpreadIndex];
        const currentPage = spread.pageNumber;

        const input = document.createElement('input');
        input.type = 'number';
        input.value = currentPage;
        input.min = '1';
        input.style.cssText = 'width: 45px; padding: 4px 6px; border: 1px solid rgba(255,255,255,0.5); background: rgba(255,255,255,0.15); color: white; font-size: 12px; text-align: center; border-radius: 3px; font-weight: bold;';

        indicator.innerHTML = '';
        indicator.appendChild(input);
        input.focus();
        input.select();

        const handleSubmit = () => {
            const newPage = parseInt(input.value, 10);
            if (!isNaN(newPage) && newPage > 0) {
                jumpToPage(newPage);
            }
            updateBookNavigation();
        };

        input.onkeypress = (e) => {
            if (e.key === 'Enter') handleSubmit();
        };
        input.onblur = handleSubmit;
        input.onkeydown = (e) => {
            if (e.key === 'Escape') updateBookNavigation();
        };
    };

    const nextBtn = document.createElement('button');
    nextBtn.className = 'nav-btn';
    nextBtn.id = 'book-next-btn';
    nextBtn.textContent = 'Next →';
    nextBtn.onclick = () => {
        if (bookViewState.currentSpreadIndex < bookViewState.spreads.length - 1) {
            renderSpreadAtIndex(bookViewState.currentSpreadIndex + 1);
        }
    };

    nav.appendChild(prevBtn);
    nav.appendChild(indicator);
    nav.appendChild(nextBtn);

    return nav;
}

function jumpToPage(pageNum) {
    if (!isNaN(pageNum) && pageNum > 0) {
        const spreadIndex = bookViewState.spreads.findIndex(s => s.pageNumber === pageNum);
        if (spreadIndex >= 0) {
            renderSpreadAtIndex(spreadIndex);
        }
    }
}

function updateBookNavigation() {
    const prevBtn = document.getElementById('book-prev-btn');
    const nextBtn = document.getElementById('book-next-btn');
    const indicator = document.getElementById('book-page-indicator');

    if (!prevBtn || !nextBtn || !indicator) return;

    const spread = bookViewState.spreads[bookViewState.currentSpreadIndex];
    const pageStart = spread.pageNumber;
    const pageEnd = spread.pageNumber + 1;
    const totalPages = bookViewState.spreads.reduce((max, s) => Math.max(max, (s.pageNumber || 0) + 1), 2);

    indicator.textContent = `Pages ${pageStart}–${pageEnd} of ${totalPages}`;

    prevBtn.disabled = bookViewState.currentSpreadIndex === 0;
    nextBtn.disabled = bookViewState.currentSpreadIndex === bookViewState.spreads.length - 1;

    const currentPageNumber = spread.pageNumber;
    window.history.replaceState(
        { spreadIndex: bookViewState.currentSpreadIndex },
        '',
        `?page=${currentPageNumber}`
    );
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
