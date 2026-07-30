// continuous-view.js — Continuous/book layout for FAQ entries.
// Renders Kannada and English blocks with a border line between them.
// PIP thumbnail from media.js placed near the kn/en border using CSS float.

import { escapeHtml, linkify, createPipThumbnail, extractYouTubeId, buildQrUrl, buildYouTubeThumbnailUrl } from './media.js';
import { getReadBlocks, saveReadBlocks, toggleBlockRead, computeProgress } from './read-tracking.js';

// ── Stack for jump-to-source back navigation ──
// Reset on every re-render so stale offsets from the old layout don't
// send the user somewhere arbitrary after a language change.
let backStack = [];

/**
 * Format a block ID for display: "q_022_b_1" → "Q-22.1"
 * @param {Object} block - block object with .id and .type
 * @returns {string}
 */
export function formatIdForDisplay(block) {
    let typeInitial = block.id[0].toUpperCase();
    if (block.type === "shloka") typeInitial = "S";
    else if (block.type === "note") typeInitial = "N";
    const parts = block.id.split('_');
    const number = parseInt(parts[1], 10);
    const subNumber = parts[3];
    return `${typeInitial}-${number}.${subNumber}`;
}

/**
 * Resolve a reference id to its block object.
 * A reference may point at a whole item ("q_002") or a specific block ("q_002_b_1").
 * @param {string} refId
 * @param {Object} blockById - map of blockId → block
 * @param {Object} itemById - map of itemId → item
 * @returns {Object|null}
 */
export function resolveReference(refId, blockById, itemById) {
    if (blockById[refId]) {
        return blockById[refId];
    }
    const item = itemById[refId];
    if (item && item.blocks && item.blocks.length > 0) {
        return item.blocks[0];
    }
    return null;
}

/**
 * Jump to a referenced block by scrolling it into view.
 * @param {string} blockId
 */
export function jumpToReference(blockId) {
    const target = document.getElementById(blockId);
    if (!target) return;

    backStack.push(window.scrollY);
    const backBtn = document.getElementById('back-to-message');
    if (backBtn) backBtn.style.display = 'block';

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('jump-highlight');
    setTimeout(() => target.classList.remove('jump-highlight'), 1500);
}

/**
 * Return to the previous scroll position after a jump.
 */
export function goBackToMessage() {
    const prevY = backStack.pop();
    if (prevY !== undefined) {
        window.scrollTo({ top: prevY, behavior: 'smooth' });
    }
    const backBtn = document.getElementById('back-to-message');
    if (backBtn && backStack.length === 0) {
        backBtn.style.display = 'none';
    }
}

/**
 * Filter visible cards by search query.
 * Uses textContent (not innerText) so it works on display:none elements
 * and is testable in jsdom.
 * @param {string} query - search text
 */
export function filterContinuous(query) {
    const q = (query || '').toLowerCase();
    const cards = document.querySelectorAll('#continuous-container .card');

    cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        if (text.includes(q)) {
            card.style.display = "";
        } else {
            card.style.display = "none";
        }
    });
}

/**
 * Build the PIP thumbnail HTML for a block's videos and images.
 * @param {Object} block - FAQ block with videos/images arrays
 * @returns {string} HTML string (may be empty)
 */
function buildBlockPip(block) {
    // If the block has videos, create a video PIP
    if (block.videos && block.videos.length > 0) {
        const v = block.videos[0];
        const videoId = extractYouTubeId(v.url);
        if (!videoId) return '';

        return createPipThumbnail({
            type: 'video',
            mediaSrc: buildYouTubeThumbnailUrl(videoId),
            qrSrc: buildQrUrl(v.url),
            alt: 'Watch Video',
            href: v.url,
        });
    }

    // If the block has images (and no videos), create a graphic PIP
    if (block.images && block.images.length > 0) {
        const img = block.images[0];
        const src = img.src.includes('://') ? img.src : `images/${img.src}`;
        const capEn = (img.caption && img.caption.en) ? img.caption.en : '';
        return createPipThumbnail({
            type: 'graphic',
            mediaSrc: src,
            alt: capEn,
        });
    }

    return '';
}

/**
 * Render the continuous/book view for FAQ entries.
 * Kannada and English blocks are separated by a clear horizontal border line.
 * PIP thumbnail floated near the kn/en border using CSS float.
 *
 * @param {Array} data - FAQ data array
 * @param {HTMLElement} container - DOM element to render into
 * @param {string} lang - 'all', 'kn', or 'en'
 */
export function renderContinuousView(data, container, lang = 'all') {
    if (!container) return;
    container.innerHTML = "";

    // Reset back-navigation stack — stale offsets from old layout are meaningless
    backStack = [];

    // Build lookup maps for reference resolution
    const blockById = {};
    const itemById = {};
    data.forEach(item => {
        itemById[item.id] = item;
        item.blocks.forEach(block => {
            blockById[block.id] = block;
        });
    });

    const readBlocks = getReadBlocks(localStorage);
    const totalBlockCount = data.reduce((sum, item) => sum + item.blocks.length, 0);

    data.forEach(item => {
        const card = document.createElement('div');
        card.className = `card ${item.type}`;
        card.id = item.id;

        // ── Reply excerpt: preview of what this item references ──
        if (item.references && item.references.length > 0) {
            const excerptContainer = document.createElement('div');
            excerptContainer.className = 'reply-excerpt multi-block';

            item.references.forEach(refId => {
                const refBlock = resolveReference(refId, blockById, itemById);
                if (!refBlock) return;

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

        // ── Multi-Block Row Generation ──
        item.blocks.forEach(block => {
            const row = document.createElement('div');
            const hasText = (block.content?.kn?.some(line => line.trim() !== '')) ||
                           (block.content?.en?.some(line => line.trim() !== ''));
            const isRead = readBlocks.has(block.id);
            row.className = `block-row ${block.type}${hasText ? '' : ' media-only'}${isRead ? ' read' : ''}`;
            row.id = block.id;

            // ID Label (e.g. Q-1.1)
            const idLabel = document.createElement('span');
            idLabel.className = 'block-id';
            idLabel.innerText = formatIdForDisplay(block);
            row.appendChild(idLabel);

            // ── Block content: kn content, divider, en content ──
            const blockContent = document.createElement('div');
            blockContent.className = 'block-content';

            // Build PIP thumbnail for this block (video or image)
            const pipHtml = buildBlockPip(block);

            // Kannada column — PIP floated right inside this column
            if ((lang === 'kn' || lang === 'all') && block.content?.kn?.some(line => line.trim() !== '')) {
                const knCol = document.createElement('div');
                knCol.className = 'col-kn';
                knCol.innerHTML = pipHtml + `<p>${linkify(escapeHtml(block.content.kn.join('<br>')))}</p>`;
                blockContent.appendChild(knCol);
            } else if (pipHtml) {
                // No Kannada text but PIP exists — put PIP in kn col anyway
                const knCol = document.createElement('div');
                knCol.className = 'col-kn';
                knCol.innerHTML = pipHtml;
                blockContent.appendChild(knCol);
            }

            // Kn/En divider — clears the floated PIP
            const divider = document.createElement('div');
            divider.className = 'kn-en-divider';
            blockContent.appendChild(divider);

            // English column
            if ((lang === 'en' || lang === 'all') && block.content?.en?.some(line => line.trim() !== '')) {
                const enCol = document.createElement('div');
                enCol.className = 'col-en';
                enCol.innerHTML = `<p>${linkify(escapeHtml(block.content.en.join('<br>')))}</p>`;
                blockContent.appendChild(enCol);
            }

            // For media-only blocks (standalone images), render the image full-width
            if (!hasText && block.images && block.images.length > 0) {
                blockContent.classList.add('media-only-content');
                block.images.forEach(img => {
                    const src = img.src.includes('://') ? img.src : `images/${img.src}`;
                    const capKn = (img.caption && img.caption.kn) ? img.caption.kn : '';
                    const capEn = (img.caption && img.caption.en) ? img.caption.en : '';
                    let capText = '';
                    if (lang === 'all') {
                        capText = (capKn && capEn) ? `${capKn} / ${capEn}` : (capKn || capEn);
                    } else {
                        capText = (lang === 'kn') ? capKn : capEn;
                    }
                    blockContent.innerHTML += `
                        <div class="image-card">
                            <img src="${escapeHtml(src)}" alt="${escapeHtml(capText)}">
                            ${capText ? `<p class="image-caption">${escapeHtml(capText)}</p>` : ''}
                        </div>`;
                });
            }

            row.appendChild(blockContent);

            // ── Read tick — interactive button ──
            const readTick = document.createElement('button');
            readTick.type = 'button';
            readTick.className = `read-tick${isRead ? ' read' : ''}`;
            readTick.title = isRead ? 'Marked as read' : 'Mark as read';
            readTick.setAttribute('aria-label', readTick.title);
            readTick.textContent = isRead ? '✓' : '';
            readTick.onclick = (e) => {
                e.stopPropagation();
                const currentRead = getReadBlocks(localStorage);
                const newRead = toggleBlockRead(block.id, currentRead);
                saveReadBlocks(newRead, localStorage);
                const nowRead = newRead.has(block.id);
                row.classList.toggle('read', nowRead);
                readTick.classList.toggle('read', nowRead);
                readTick.textContent = nowRead ? '✓' : '';
                readTick.title = nowRead ? 'Marked as read' : 'Mark as read';
                readTick.setAttribute('aria-label', readTick.title);

                // Update progress display
                const progress = computeProgress(newRead, totalBlockCount);
                const progressEl = document.getElementById('read-progress');
                if (progressEl) {
                    progressEl.textContent = `✓ ${progress.read}/${progress.total} read`;
                }
            };
            row.appendChild(readTick);

            card.appendChild(row);
        });
        container.appendChild(card);
    });

    // Update progress display
    const progress = computeProgress(readBlocks, totalBlockCount);
    const progressEl = document.getElementById('read-progress');
    if (progressEl) {
        progressEl.textContent = `✓ ${progress.read}/${progress.total} read`;
    }
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        formatIdForDisplay,
        resolveReference,
        jumpToReference,
        goBackToMessage,
        filterContinuous,
        renderContinuousView,
    });
}
