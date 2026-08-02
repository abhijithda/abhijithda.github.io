// continuous-view.js — Continuous scroll view.
// Rendering logic is verbatim from master's script.js renderChat().
// Imports from media.js and read-tracking.js for clean separation.

import { createVideoCard } from './media.js';
import { getReadBlocks, saveReadBlocks, toggleBlockRead, computeProgress } from './read-tracking.js';

// ── Back-navigation stack (verbatim from master) ──────────────────────────
let backStack = [];

export function formatIdForDisplay(block) {
    let typeInitial = block.id[0].toUpperCase();
    if (block.type === 'shloka') typeInitial = 'S';
    else if (block.type === 'note') typeInitial = 'N';
    const parts = block.id.split('_');
    const number = parseInt(parts[1], 10);
    const subNumber = parts[3];
    return `${typeInitial}-${number}.${subNumber}`;
}

export function resolveReference(refId, blockById, itemById) {
    if (blockById[refId]) return blockById[refId];
    const item = itemById[refId];
    if (item && item.blocks && item.blocks.length > 0) return item.blocks[0];
    return null;
}

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

export function goBackToMessage() {
    const prevY = backStack.pop();
    if (prevY !== undefined) window.scrollTo({ top: prevY, behavior: 'smooth' });
    const backBtn = document.getElementById('back-to-message');
    if (backBtn && backStack.length === 0) backBtn.style.display = 'none';
}

export function filterContinuous(query) {
    const q = (query || '').toLowerCase();
    document.querySelectorAll('#continuous-container .card').forEach(card => {
        card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}

// ── Main render (verbatim from master's renderChat) ───────────────────────
export function renderContinuousView(data, container, lang = 'all') {
    if (!container) return;
    container.innerHTML = '';
    backStack = [];

    const blockById = {};
    const itemById  = {};
    data.forEach(item => {
        itemById[item.id] = item;
        item.blocks.forEach(block => { blockById[block.id] = block; });
    });

    const readBlocks      = getReadBlocks(localStorage);
    const totalBlockCount = data.reduce((sum, item) => sum + item.blocks.length, 0);

    data.forEach(item => {
        const card = document.createElement('div');
        card.className = `card ${item.type}`;
        card.id = item.id;

        // Reply-excerpt (verbatim from master)
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
                idLabel.onclick = (e) => { e.stopPropagation(); jumpToReference(refBlock.id); };
                excerptRow.appendChild(idLabel);

                const contentWrap = document.createElement('div');
                contentWrap.className = 'excerpt-content-wrap';
                contentWrap.onclick = () => excerptRow.classList.toggle('expanded');

                if ((lang === 'kn' || lang === 'all') && refBlock.content?.kn?.some(l => l.trim() !== '')) {
                    const knCol = document.createElement('div');
                    knCol.className = 'col-kn';
                    knCol.innerHTML = `<p>${refBlock.content.kn.join(' ')}</p>`;
                    contentWrap.appendChild(knCol);
                }
                if ((lang === 'en' || lang === 'all') && refBlock.content?.en?.some(l => l.trim() !== '')) {
                    const enCol = document.createElement('div');
                    enCol.className = 'col-en';
                    enCol.innerHTML = `<p>${refBlock.content.en.join(' ')}</p>`;
                    contentWrap.appendChild(enCol);
                }

                excerptRow.appendChild(contentWrap);
                excerptContainer.appendChild(excerptRow);
            });

            if (excerptContainer.children.length > 0) card.appendChild(excerptContainer);
        }

        // Blocks (verbatim from master's renderChat block loop)
        item.blocks.forEach(block => {
            const row = document.createElement('div');
            const hasText = block.content?.kn?.some(l => l.trim() !== '') ||
                            block.content?.en?.some(l => l.trim() !== '');
            const isRead  = readBlocks.has(block.id);
            row.className = `block-row ${block.type}${hasText ? '' : ' media-only'}${isRead ? ' read' : ''}`;
            row.id = block.id;

            // ID label
            const idLabel = document.createElement('span');
            idLabel.className = 'block-id';
            idLabel.innerText = formatIdForDisplay(block);
            row.appendChild(idLabel);

            // Kannada column
            if ((lang === 'kn' || lang === 'all') && block.content?.kn?.some(l => l.trim() !== '')) {
                const knCol = document.createElement('div');
                knCol.className = 'col-kn';
                knCol.innerHTML = `<p>${block.content.kn.join('<br>')}</p>`;
                row.appendChild(knCol);
            }

            // English column
            if ((lang === 'en' || lang === 'all') && block.content?.en?.some(l => l.trim() !== '')) {
                const enCol = document.createElement('div');
                enCol.className = 'col-en';
                enCol.innerHTML = `<p>${block.content.en.join('<br>')}</p>`;
                row.appendChild(enCol);
            }

            // Media column — images then videos, verbatim from master
            const mediaCol = document.createElement('div');
            mediaCol.className = 'col-media';

            if (block.images && block.images.length > 0) {
                mediaCol.classList.add('has-images');
                block.images.forEach(img => {
                    const capKn = img.caption?.kn || '';
                    const capEn = img.caption?.en || '';
                    let capText = '';
                    if (lang === 'all') capText = (capKn && capEn) ? `${capKn} / ${capEn}` : (capKn || capEn);
                    else                capText = (lang === 'kn') ? capKn : capEn;
                    mediaCol.innerHTML += `
                        <div class="image-card">
                            <img src="images/${img.src}" alt="${capText}">
                            ${capText ? `<p class="image-caption">${capText}</p>` : ''}
                        </div>`;
                });
            }

            if (block.videos) {
                block.videos.forEach(v => { mediaCol.innerHTML += createVideoCard(v.url); });
            }

            row.appendChild(mediaCol);

            // Read tick (verbatim from master)
            const readTick = document.createElement('button');
            readTick.type = 'button';
            readTick.className = `read-tick${isRead ? ' read' : ''}`;
            readTick.title = isRead ? 'Marked as read' : 'Mark as read';
            readTick.setAttribute('aria-label', readTick.title);
            readTick.textContent = isRead ? '✓' : '';
            readTick.onclick = (e) => {
                e.stopPropagation();
                const newSet = toggleBlockRead(block.id, getReadBlocks(localStorage));
                saveReadBlocks(newSet, localStorage);
                const nowRead = newSet.has(block.id);
                row.classList.toggle('read', nowRead);
                readTick.classList.toggle('read', nowRead);
                readTick.textContent = nowRead ? '✓' : '';
                readTick.title = nowRead ? 'Marked as read' : 'Mark as read';
                readTick.setAttribute('aria-label', readTick.title);
                const { read, total } = computeProgress(newSet, totalBlockCount);
                const el = document.getElementById('read-progress');
                if (el) el.textContent = `✓ ${read}/${total} read`;
            };
            row.appendChild(readTick);

            card.appendChild(row);
        });

        container.appendChild(card);
    });

    // Update progress counter
    const { read, total } = computeProgress(readBlocks, totalBlockCount);
    const el = document.getElementById('read-progress');
    if (el) el.textContent = `✓ ${read}/${total} read`;
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        formatIdForDisplay, resolveReference, jumpToReference, goBackToMessage,
        filterContinuous, renderContinuousView,
    });
}
