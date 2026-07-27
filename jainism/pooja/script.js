document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('settings-btn');
    const menu = document.getElementById('settings-menu');

    if (!btn || !menu) return;

    // Toggle menu on click
    btn.onclick = (e) => {
        e.stopPropagation();
        const isVisible = menu.style.display === 'block';
        menu.style.display = isVisible ? 'none' : 'block';
    };

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (menu && !menu.contains(e.target) && e.target !== btn) {
            menu.style.display = 'none';
        }
    });
});

function filterChat() {
    const query = document.getElementById('search-bar').value.toLowerCase();
    const cards = document.querySelectorAll('.card');

    cards.forEach(card => {
        const text = card.innerText.toLowerCase();
        if (text.includes(query)) {
            card.style.display = ""; // Show
        } else {
            card.style.display = "none"; // Hide
        }
    });
}

function createVideoCard(url) {
    // Robustly extract video ID
    // 1. Remove everything after the timestamp '?' to clean the URL
    const cleanUrl = url.split('?t=')[0].split('&t=')[0];

    // 2. Use the clean URL to extract ID
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = cleanUrl.match(regExp);
    const videoId = (match && match[2].length === 11) ? match[2] : null;

    if (!videoId) return '';

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(url)}`;

    // Return a single media wrapper so QR can be positioned as PIP over the video thumbnail
    return `
        <div class="media-wrap">
            <div class="video-card">
                <a href="${url}" target="_blank">
                    <img src="https://img.youtube.com/vi/${videoId}/0.jpg" alt="Watch Video">
                </a>
            </div>
            <div class="qr-code">
                <img src="${qrCodeUrl}" alt="QR Code">
            </div>
        </div>
    `;
}

function updateMediaVisibility() {
    const toggleVideos = document.getElementById('toggle-videos') || document.getElementById('toggleVideos');
    const toggleQrs = document.getElementById('toggle-qrs') || document.getElementById('toggleQrs');
    const showVideos = toggleVideos ? toggleVideos.checked : false;
    const showQrs = toggleQrs ? toggleQrs.checked : false;

    document.body.classList.toggle('show-videos', showVideos);
    document.body.classList.toggle('show-qrs', showQrs);

    // Also set inline styles for deterministic visibility (helps tests and PIP)
    document.querySelectorAll('.video-card').forEach(el => {
        el.style.display = showVideos ? '' : 'none';
    });
    document.querySelectorAll('.qr-code').forEach(el => {
        el.style.display = showQrs ? '' : 'none';
    });

    saveDisplaySettings();
}

// Read-tracking is opt-in and off by default — most visitors are readers,
// not the site author, so the tick marks and progress counter only show
// once someone deliberately turns them on in Settings.
function updateReadTrackingVisibility() {
    const toggle = document.getElementById('toggle-read-tracking');
    const show = toggle ? toggle.checked : false;
    document.body.classList.toggle('show-read-tracking', show);

    saveDisplaySettings();
}

// --- Settings persistence (local-only, survives refresh AND full browser
// close/reopen — same localStorage mechanism as scroll position and read
// tracking, just for the Settings-menu controls themselves). ---
const DISPLAY_SETTINGS_KEY = 'displaySettings';

function saveDisplaySettings() {
    const langSelect = document.getElementById('lang-select');
    const toggleVideos = document.getElementById('toggle-videos');
    const toggleQrs = document.getElementById('toggle-qrs');
    const toggleReadTracking = document.getElementById('toggle-read-tracking');

    const settings = {
        lang: langSelect ? langSelect.value : 'all',
        videos: toggleVideos ? toggleVideos.checked : true,
        qrs: toggleQrs ? toggleQrs.checked : false,
        readTracking: toggleReadTracking ? toggleReadTracking.checked : false,
    };
    localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(settings));
}

function loadDisplaySettings() {
    try {
        return JSON.parse(localStorage.getItem(DISPLAY_SETTINGS_KEY)) || {};
    } catch (e) {
        return {};
    }
}

// Apply any saved settings to the controls themselves, before anything
// reads their .checked/.value for the first render — otherwise the first
// paint would briefly show the HTML defaults instead of what was saved.
function applyDisplaySettings() {
    const saved = loadDisplaySettings();
    const langSelect = document.getElementById('lang-select');
    const toggleVideos = document.getElementById('toggle-videos');
    const toggleQrs = document.getElementById('toggle-qrs');
    const toggleReadTracking = document.getElementById('toggle-read-tracking');

    if (langSelect && typeof saved.lang === 'string') langSelect.value = saved.lang;
    if (toggleVideos && typeof saved.videos === 'boolean') toggleVideos.checked = saved.videos;
    if (toggleQrs && typeof saved.qrs === 'boolean') toggleQrs.checked = saved.qrs;
    if (toggleReadTracking && typeof saved.readTracking === 'boolean') toggleReadTracking.checked = saved.readTracking;
}

document.addEventListener('DOMContentLoaded', () => {
    const toggleVideos = document.getElementById('toggle-videos') || document.getElementById('toggleVideos');
    const toggleQrs = document.getElementById('toggle-qrs') || document.getElementById('toggleQrs');

    // Restore saved Language/Videos/QR/Read-tracking choices before anything
    // reads their current value — otherwise the very first paint would
    // briefly show the HTML defaults instead of what was saved last time.
    applyDisplaySettings();

    if (toggleVideos) {
        toggleVideos.addEventListener('change', updateMediaVisibility);
    }
    if (toggleQrs) {
        toggleQrs.addEventListener('change', updateMediaVisibility);
    }

    const toggleReadTracking = document.getElementById('toggle-read-tracking');
    if (toggleReadTracking) {
        toggleReadTracking.addEventListener('change', updateReadTrackingVisibility);
    }

    updateMediaVisibility();
    updateReadTrackingVisibility();

    // Set up view toggle buttons
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const mode = btn.dataset.view;
            setViewMode(mode);
        });
    });

    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            const container = document.getElementById('chat-container');
            const langSelect = document.getElementById('lang-select');
            const lang = langSelect ? langSelect.value : 'all';

            renderChat(data, container, lang);   // Initial render
            createBookView(data);  // Build book view
            // Ensure media visibility rules apply to newly-rendered elements
            updateMediaVisibility();

            // NOW apply saved view mode (or default to book)
            const savedMode = localStorage.getItem('viewMode') || 'book';
            setViewMode(savedMode);

            // Add Listener HERE (it has access to 'data' and 'container' via closure)
            langSelect.addEventListener('change', (e) => {
                renderChat(data, container, e.target.value);
                updateMediaVisibility();
                saveDisplaySettings();
            });

            // RESTORE position AFTER rendering is done
            setTimeout(() => {
                const savedPosition = localStorage.getItem('scrollPosition');
                if (savedPosition) {
                    window.scrollTo(0, parseInt(savedPosition));
                }
            }, 100); // Small delay to ensure browser finished drawing the cards
        })
        .catch(error => console.error('Error loading data:', error));
});

// formatIdForDisplay logic turns "q_022_b_1" into "Q-22"
function formatIdForDisplay(block) {
    let typeInitial = block.id[0].toUpperCase(); // 'q' -> 'Q'
    if (block.type === "shloka") {
        typeInitial = "S";
    } else if (block.type === "note") {
        typeInitial = "N";
    }
    const parts = block.id.split('_');
    const number = parseInt(parts[1], 10);        // '022' -> 22
    const subNumber = parts[3];        // '022' -> 22
    return `${typeInitial}-${number}.${subNumber}`; // e.g., "Q-22.1"
}

// --- Reference resolution & jump-to-source ---
// A reference id may point at a whole item ("q_002") or a specific block
// within an item ("q_002_b_1"). Resolves either form to the actual block
// object to excerpt from.
function resolveReference(refId, blockById, itemById) {
    if (blockById[refId]) {
        return blockById[refId];
    }
    const item = itemById[refId];
    if (item && item.blocks && item.blocks.length > 0) {
        return item.blocks[0];
    }
    return null; // Dangling reference — skip gracefully rather than throw.
}

// Stack (not a single slot) so that jumping to a reference, then jumping to
// a reference from *within* that reference, and hitting "Back" twice
// returns you through both hops in order — a single saved position would
// lose the first hop.
let backStack = [];

function jumpToReference(blockId) {
    const target = document.getElementById(blockId);
    if (!target) return;

    backStack.push(window.scrollY);
    const backBtn = document.getElementById('back-to-message');
    if (backBtn) backBtn.style.display = 'block';

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('jump-highlight');
    setTimeout(() => target.classList.remove('jump-highlight'), 1500);
}

function goBackToMessage() {
    const prevY = backStack.pop();
    if (prevY !== undefined) {
        window.scrollTo({ top: prevY, behavior: 'smooth' });
    }
    const backBtn = document.getElementById('back-to-message');
    if (backBtn && backStack.length === 0) {
        backBtn.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const backBtn = document.getElementById('back-to-message');
    if (backBtn) backBtn.onclick = goBackToMessage;
});

// --- Read tracking (local-only, no auth: a Set of BLOCK ids in localStorage) ---
// Block-level, not item-level: a video block can run over an hour, so a
// reader may finish one block of a multi-block answer and want to mark
// just that much as done, without claiming the whole answer is read.
const READ_BLOCKS_KEY = 'readBlocks';

function getReadBlocks() {
    try {
        return new Set(JSON.parse(localStorage.getItem(READ_BLOCKS_KEY)) || []);
    } catch (e) {
        return new Set();
    }
}

function saveReadBlocks(readSet) {
    localStorage.setItem(READ_BLOCKS_KEY, JSON.stringify([...readSet]));
}

function toggleBlockRead(blockId, totalBlockCount) {
    const readSet = getReadBlocks();
    if (readSet.has(blockId)) {
        readSet.delete(blockId);
    } else {
        readSet.add(blockId);
    }
    saveReadBlocks(readSet);

    const row = document.getElementById(blockId);
    if (row) row.classList.toggle('read', readSet.has(blockId));

    updateReadProgress(totalBlockCount);
}

function updateReadProgress(totalBlockCount) {
    const el = document.getElementById('read-progress');
    if (!el) return;
    const readCount = getReadBlocks().size;
    el.textContent = `✓ ${readCount}/${totalBlockCount} read`;
}

function renderChat(data, container, lang = 'all') {
    if (!container) return;
    container.innerHTML = "";

    // Lookup maps so a reference id ("q_002" or "q_002_b_1") can be
    // resolved to its actual block, regardless of which granularity it
    // points at.
    const blockById = {};
    const itemById = {};
    data.forEach(item => {
        itemById[item.id] = item;
        item.blocks.forEach(block => {
            blockById[block.id] = block;
        });
    });

    const readBlocks = getReadBlocks();
    const totalBlockCount = data.reduce((sum, item) => sum + item.blocks.length, 0);

    data.forEach(item => {
        const card = document.createElement('div');
        card.className = `card ${item.type}`;
        card.id = item.id;

        // Reply-excerpt: a WhatsApp-style preview of whatever this item is
        // following up on. Must be appended before the item's own blocks —
        // its CSS uses a negative top margin to sit flush against the
        // card's top edge, covering the card's own top padding.
        if (item.references && item.references.length > 0) {
            const excerptContainer = document.createElement('div');
            excerptContainer.className = 'reply-excerpt multi-block';

            item.references.forEach(refId => {
                const refBlock = resolveReference(refId, blockById, itemById);
                if (!refBlock) return; // Dangling reference — skip gracefully.

                const excerptRow = document.createElement('div');
                excerptRow.className = 'excerpt-row block-row';

                const idLabel = document.createElement('span');
                idLabel.className = 'block-id';
                idLabel.innerText = formatIdForDisplay(refBlock);
                idLabel.onclick = (e) => {
                    e.stopPropagation();
                    jumpToReference(refBlock.id);
                };
                excerptRow.appendChild(idLabel);

                const contentWrap = document.createElement('div');
                contentWrap.className = 'excerpt-content-wrap';
                contentWrap.onclick = () => excerptRow.classList.toggle('expanded');

                // Gated by lang, same as every other block's content — this
                // was the actual bug: the excerpt used to always show both
                // languages regardless of the selected filter.
                if ((lang === 'kn' || lang === 'all') && refBlock.content?.kn?.some(line => line.trim() !== '')) {
                    const knCol = document.createElement('div');
                    knCol.className = 'col-kn';
                    knCol.innerHTML = `<p>${refBlock.content.kn.join(' ')}</p>`;
                    contentWrap.appendChild(knCol);
                }
                if ((lang === 'en' || lang === 'all') && refBlock.content?.en?.some(line => line.trim() !== '')) {
                    const enCol = document.createElement('div');
                    enCol.className = 'col-en';
                    enCol.innerHTML = `<p>${refBlock.content.en.join(' ')}</p>`;
                    contentWrap.appendChild(enCol);
                }

                excerptRow.appendChild(contentWrap);
                excerptContainer.appendChild(excerptRow);
            });

            if (excerptContainer.children.length > 0) {
                card.appendChild(excerptContainer);
            }
        }

        // --- Multi-Block Row Generation ---
        item.blocks.forEach(block => {
            const row = document.createElement('div');
            const hasText = (block.content?.kn?.some(line => line.trim() !== '')) || (block.content?.en?.some(line => line.trim() !== ''));
            const isRead = readBlocks.has(block.id);
            row.className = `block-row ${block.type}${hasText ? '' : ' media-only'}${isRead ? ' read' : ''}`;
            row.id = block.id;

            // ID Label (e.g. Q-1.1)
            const idLabel = document.createElement('span');
            idLabel.className = 'block-id';
            idLabel.innerText = formatIdForDisplay(block);
            row.appendChild(idLabel);

            // Kannada Column
            if ((lang === 'kn' || lang === 'all') && block.content?.kn?.some(line => line.trim() !== '')) {
                const knCol = document.createElement('div');
                knCol.className = "col-kn";
                knCol.innerHTML = `<p>${block.content.kn.join('<br>')}</p>`;
                row.appendChild(knCol);
            }

            // English Column
            if ((lang === 'en' || lang === 'all') && block.content?.en?.some(line => line.trim() !== '')) {
                const enCol = document.createElement('div');
                enCol.className = "col-en";
                enCol.innerHTML = `<p>${block.content.en.join('<br>')}</p>`;
                row.appendChild(enCol);
            }

            // Media Column (Images/Videos)
            const mediaCol = document.createElement('div');
            mediaCol.className = "col-media";

            // Process Images
            if (block.images && block.images.length > 0) {
                mediaCol.classList.add('has-images');
                block.images.forEach(img => {
                    const capKn = (img.caption && img.caption.kn) ? img.caption.kn : "";
                    const capEn = (img.caption && img.caption.en) ? img.caption.en : "";

                    let capText = "";
                    if (lang === 'all') {
                        capText = (capKn && capEn) ? `${capKn} / ${capEn}` : (capKn || capEn);
                    } else {
                        capText = (lang === 'kn') ? capKn : capEn;
                    }

                    mediaCol.innerHTML += `
                        <div class="image-card">
                            <img src="images/${img.src}" alt="${capText}">
                            ${capText ? `<p class="image-caption">${capText}</p>` : ''}
                        </div>`;
                });
            }

            // Process Videos
            if (block.videos && typeof createVideoCard === 'function') {
                block.videos.forEach(v => mediaCol.innerHTML += createVideoCard(v.url));
            }

            row.appendChild(mediaCol);

            // Mark-as-read tick — a small circular button in the block's own
            // bottom-right corner (position:relative on .block-row), not a
            // full extra row. Block-level, not card-level: a video block can
            // run over an hour, so a reader may finish one block without the
            // whole multi-block answer being "done". Hidden by default —
            // visible only once "Read tracking" is turned on in Settings
            // (see updateReadTrackingVisibility / body.show-read-tracking).
            const readTick = document.createElement('button');
            readTick.type = 'button';
            readTick.className = `read-tick${isRead ? ' read' : ''}`;
            readTick.title = isRead ? 'Marked as read' : 'Mark as read';
            readTick.setAttribute('aria-label', readTick.title);
            readTick.textContent = isRead ? '✓' : '';
            readTick.onclick = (e) => {
                e.stopPropagation();
                toggleBlockRead(block.id, totalBlockCount);
                const nowRead = row.classList.contains('read');
                readTick.classList.toggle('read', nowRead);
                readTick.textContent = nowRead ? '✓' : '';
                readTick.title = nowRead ? 'Marked as read' : 'Mark as read';
                readTick.setAttribute('aria-label', readTick.title);
            };
            row.appendChild(readTick);

            card.appendChild(row);
        });
        container.appendChild(card);
    });

    updateReadProgress(totalBlockCount);
}

function togglePrintMode() {
    const isChecked = document.getElementById('print-toggle').checked;
    const body = document.body;

    if (isChecked) {
        body.classList.add('print-mode');
    } else {
        body.classList.remove('print-mode');
    }
}

// Save scroll position every 2 seconds
window.addEventListener('scroll', () => {
    localStorage.setItem('scrollPosition', window.scrollY);
});

// Restore scroll position on load
window.addEventListener('DOMContentLoaded', () => {
    const savedPosition = localStorage.getItem('scrollPosition');
    if (savedPosition) {
        window.scrollTo(0, parseInt(savedPosition));
    }
});

// ────────────────────────────────────────────────────────────
// BOOK VIEW
// ────────────────────────────────────────────────────────────

// Helper to escape HTML special characters
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Helper to linkify URLs in text
function linkify(text) {
    if (!text) return '';
    return String(text).replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
}

let bookViewState = {
    spreads: [],
    currentSpreadIndex: 0,
    viewMode: localStorage.getItem('viewMode') || 'continuous',
    bookTitle: 'ಜೈನ ಪೂಜಾ ವಿಚಾರ ಸಂಕಲನ / Jaina Pooja Vichara Sankalana',
};

function createBookView(messageData) {
    const bookView = document.getElementById('book-view');
    if (!bookView) return;

    // Clear existing
    bookView.innerHTML = '';

    // Create shell
    const shell = document.createElement('div');
    shell.className = 'book-shell';

    // Build spreads from messages
    const spreads = buildSpreads(messageData);
    bookViewState.spreads = spreads;

    // Create spread container for current spread
    const spreadContainer = document.createElement('div');
    spreadContainer.id = 'current-spread-container';
    shell.appendChild(spreadContainer);

    // Navigation
    const nav = createBookNavigation();
    shell.appendChild(nav);

    bookView.appendChild(shell);

    // Render first spread (TOC)
    renderSpreadAtIndex(0);
}

function buildSpreads(messageData) {
    const spreads = [];
    let currentPageHeight = 0;
    let currentPageNumber = 1;  // Start at 1 without TOC
    let leftPageItems = [];
    let rightPageItems = [];
    let pageHeight = 520; // Approximate page content height

    messageData.forEach((message) => {
        if (!shouldShowInBookView(message)) return;

        let isQuestion = message.type === 'question';
        let cardHeight = estimateCardHeight(message);

        // If standalone image (type: 'images')
        if (message.type === 'images') {
            // Images get their own spread: caption left, image right
            if (leftPageItems.length > 0 || rightPageItems.length > 0) {
                // Flush current spread
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

        // Regular text items: try to fit on current pages
        if (currentPageHeight + cardHeight <= pageHeight) {
            leftPageItems.push(message);
            currentPageHeight += cardHeight;
        } else if (leftPageItems.length > 0 && rightPageItems.length === 0) {
            // Left page has content, try right page
            if (cardHeight <= pageHeight) {
                rightPageItems.push(message);
                currentPageHeight += cardHeight;
            } else {
                // Card too large for right page, start new spread
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
            // Both pages have content, start new spread
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
            // First item, goes on left page
            leftPageItems.push(message);
            currentPageHeight = cardHeight;
        }
    });

    // Flush remaining
    if (leftPageItems.length > 0 || rightPageItems.length > 0) {
        spreads.push({
            type: 'text',
            pageNumber: currentPageNumber,
            leftItems: leftPageItems,
            rightItems: rightPageItems,
            messageData: messageData,  // Store for reference resolution
        });
    }

    return spreads;
}

function renderSpreadAtIndex(idx) {
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

    // Left page
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

    // Right page with TOC items
    const rightPage = document.createElement('div');
    rightPage.className = 'book-page right';
    let tocHtml = `
        <div class="running-head">Jaina Pooja Vichara Sankalana</div>
        <div class="page-content">
            <ul class="toc-list">
    `;

    spread.items.forEach((item, i) => {
        const pageNum = 3 + Math.floor(i / 4) * 2; // Rough estimate
        tocHtml += `
            <li class="toc-item">
                <div class="toc-item-text">
                    <span class="toc-item-label">${escapeHtml(item.kn)} / ${escapeHtml(item.en)}</span>
                    <span class="toc-item-page">${pageNum}</span>
                </div>
            </li>
        `;
    });

    tocHtml += `
            </ul>
        </div>
        <div class="page-num">2</div>
    `;

    rightPage.innerHTML = tocHtml;

    spreadEl.appendChild(leftPage);
    spreadEl.appendChild(rightPage);
    return spreadEl;
}

function createTextSpreadElement(spread) {
    const spreadEl = document.createElement('div');
    spreadEl.className = 'book-spread';

    // Left page
    const leftPage = document.createElement('div');
    leftPage.className = 'book-page left';
    leftPage.innerHTML = `<div class="running-head">ಜೈನ ಪೂಜಾ ವಿಚಾರ ಸಂಕಲನ</div><div class="page-content"></div><div class="page-num">${spread.pageNumber}</div>`;

    const leftContent = leftPage.querySelector('.page-content');
    spread.leftItems.forEach(msg => {
        leftContent.appendChild(createBookCard(msg, spread.messageData));
    });

    // Right page
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

    // Get image info from first block
    let imageUrl = null;
    let captionKn = '';
    let captionEn = '';

    if (item.blocks && item.blocks.length > 0) {
        const block = item.blocks[0];
        if (block.images && block.images.length > 0) {
            const imgData = block.images[0];
            // Handle both 'src' and 'url' field names
            imageUrl = imgData.src || imgData.url;
            if (!imageUrl.includes('://')) {
                // Relative path - prepend images directory
                imageUrl = `images/${imageUrl}`;
            }
            if (imgData.caption) {
                captionKn = imgData.caption.kn || '';
                captionEn = imgData.caption.en || '';
            }
        }
    }

    // Left page with caption
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

    // Right page with image
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
    // Reuse existing card rendering logic
    const card = document.createElement('div');
    card.className = `card ${message.type}`;
    card.id = message.id;

    let html = '';

    // Add reply excerpt if this message references another
    if (message.references && message.references.length > 0) {
        const refId = message.references[0];  // First reference

        // Build lookup maps if not provided
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

    // Render blocks (kn then en) - just paragraph blocks for now
    if (message.blocks) {
        message.blocks.forEach((block) => {
            if (block.type === 'paragraph') {
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

    // Read tick - check message ID against read set
    const readBlocks = getReadBlocks();
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

    // Page indicator (Acrobat-style: click to jump to page)
    const indicator = document.createElement('span');
    indicator.className = 'page-indicator';
    indicator.id = 'book-page-indicator';
    indicator.style.cssText = 'cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: background 0.2s; user-select: none;';

    // Make clickable to jump to page
    indicator.onmouseenter = () => {
        indicator.style.background = 'rgba(255,255,255,0.1)';
    };
    indicator.onmouseleave = () => {
        indicator.style.background = 'transparent';
    };

    indicator.onclick = async (e) => {
        e.stopPropagation();

        // Get current page number
        const spread = bookViewState.spreads[bookViewState.currentSpreadIndex];
        const currentPage = spread.pageNumber;

        // Create inline input (like Acrobat)
        const input = document.createElement('input');
        input.type = 'number';
        input.value = currentPage;
        input.min = '1';
        input.style.cssText = 'width: 45px; padding: 4px 6px; border: 1px solid rgba(255,255,255,0.5); background: rgba(255,255,255,0.15); color: white; font-size: 12px; text-align: center; border-radius: 3px; font-weight: bold;';

        // Replace indicator with input
        const originalContent = indicator.innerHTML;
        indicator.innerHTML = '';
        indicator.appendChild(input);
        input.focus();
        input.select();

        const handleSubmit = () => {
            const newPage = parseInt(input.value, 10);
            if (!isNaN(newPage) && newPage > 0) {
                jumpToPage(newPage);
            }
            updateBookNavigation();  // Restore indicator display
        };

        input.onkeypress = (e) => {
            if (e.key === 'Enter') {
                handleSubmit();
            }
        };

        input.onblur = handleSubmit;

        // Close on escape
        input.onkeydown = (e) => {
            if (e.key === 'Escape') {
                updateBookNavigation();
            }
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

    // Update URL with current page for bookmarking/sharing
    const currentPageNumber = spread.pageNumber;
    window.history.replaceState(
        { spreadIndex: bookViewState.currentSpreadIndex },
        '',
        `?page=${currentPageNumber}`
    );
}

// Handle page parameter from URL (for deep linking)
function initializePageFromURL() {
    const params = new URLSearchParams(window.location.search);
    const pageNum = parseInt(params.get('page'), 10);

    if (!isNaN(pageNum) && pageNum > 0) {
        // Find spread that starts with this page number
        const spreadIndex = bookViewState.spreads.findIndex(s => s.pageNumber === pageNum);
        if (spreadIndex >= 0) {
            renderSpreadAtIndex(spreadIndex);
            return true;
        }
    }
    return false;
}

function shouldShowInBookView(message) {
    // Hide metadata messages and respect language/topic filters
    if (!message || !message.type) return false;
    if (message.id === '__metadata__') return false;

    // Could add language/topic filtering here if needed
    return true;
}

function isTOCItem(message) {
    if (message.type !== 'question') return false;
    const id = message.id || '';
    return /^q_\d+$/.test(id);
}

function estimateCardHeight(message) {
    // Rough estimation: base height + content
    let height = 60; // Base padding
    if (message.blocks) {
        message.blocks.forEach((block) => {
            if (block.type === 'paragraph') {
                const kn = (block.content.kn || []).join(' ').length;
                const en = (block.content.en || []).join(' ').length;
                height += ((kn + en) / 50) * 20; // ~20px per 50 chars
            }
        });
    }
    return Math.min(height, 200); // Cap at 200px
}

function getBlockTextKn(message) {
    if (!message.blocks) return message.id;
    const texts = [];
    message.blocks.forEach((block) => {
        if (block.type === 'paragraph' && block.content.kn) {
            texts.push(...block.content.kn);
        }
    });
    return texts.join(' ').slice(0, 200);
}

function getBlockTextEn(message) {
    if (!message.blocks) return '';
    const texts = [];
    message.blocks.forEach((block) => {
        if (block.type === 'paragraph' && block.content.en) {
            texts.push(...block.content.en);
        }
    });
    return texts.join(' ').slice(0, 200);
}

function setViewMode(mode) {
    bookViewState.viewMode = mode;
    localStorage.setItem('viewMode', mode);

    const chatContainer = document.getElementById('chat-container');
    const bookView = document.getElementById('book-view');

    if (mode === 'book') {
        chatContainer.style.display = 'none';
        bookView.style.display = 'flex';
    } else {
        chatContainer.style.display = 'flex';
        bookView.style.display = 'none';
    }

    // Update toggle buttons
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === mode);
    });
}

// --- TEST EXPORTS ---
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        filterChat,
        createVideoCard,
        renderChat,
        updateMediaVisibility,
        resolveReference,
        jumpToReference,
        goBackToMessage,
        toggleBlockRead,
        getReadBlocks,
        updateReadProgress,
        updateReadTrackingVisibility,
        saveDisplaySettings,
        loadDisplaySettings,
        applyDisplaySettings,
        createBookView,
        buildSpreads,
        renderSpreadAtIndex,
        setViewMode,
        shouldShowInBookView,
        isTOCItem,
        estimateCardHeight,
        getBlockTextKn,
        getBlockTextEn,
        createBookCard,
        createTOCElement,
        createTextSpreadElement,
        createImageSpreadElement,
        updateBookNavigation,
        initializePageFromURL,
        jumpToPage,
    };
}