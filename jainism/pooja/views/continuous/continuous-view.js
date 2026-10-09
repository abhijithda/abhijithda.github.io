// continuous-view.js — Continuous scroll view.
// Rendering logic is verbatim from master's script.js renderChat().
// Imports from media.js and read-tracking.js for clean separation.

import { createVideoCard } from '../../core/media.js';
import { getReadBlocks, saveReadBlocks, toggleBlockRead, isBlockTrackable, updateProgressDisplay } from '../../core/read-tracking.js';
import { formatIdForDisplay, buildBlockIndex, resolveReference } from '../../core/blocks.js';

// ── Back-navigation stack (verbatim from master) ──────────────────────────
let backStack = [];

// Purely presentational: whether a block has any text, for the .media-only
// CSS class. Distinct from read-tracking.js's isBlockTrackable — a
// video-only block has no text (gets this class) but IS trackable.
function hasTextContent(block) {
    return block.content?.kn?.some(l => l.trim() !== '') ||
           block.content?.en?.some(l => l.trim() !== '');
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

    const { blockById, itemById } = buildBlockIndex(data);

    const readBlocks      = getReadBlocks(localStorage);
    // "insert" items (front cover, dividers) are decorative structure, not
    // content a reader marks as read — excluded from the count entirely,
    // even if their block happens to carry title text that would otherwise
    // look "trackable" by the generic per-block rule.
    const totalBlockCount = data.reduce((sum, item) =>
        item.type === 'insert' ? sum : sum + (item.blocks || []).filter(isBlockTrackable).length, 0);

    data.forEach(item => {
        const card = document.createElement('div');
        card.className = `card ${item.type}`;
        card.id = item.id;

        // "insert" items — the front cover, section dividers, plain
        // standalone photos, and pure blank pages are all one item type.
        // Only the two cases with no equivalent in the normal per-block
        // row get special rendering here:
        //   block.content present -> big centered title-style page
        //     (dash-ruled) — the cover/divider look.
        //   neither image nor content -> a blank card, forced onto its
        //     own printed page (see .insert-blank in continuous-view.css).
        // A plain standalone photo (image + per-image caption, no
        // block.content) is NOT special-cased — it falls through to the
        // exact same per-block row rendering below as any other block,
        // id-column-on-the-left layout and all, because that *is* what a
        // standalone photo looked like before "insert" existed. Giving it
        // the big centered treatment instead (an earlier version of this
        // feature did) shrank the image and lost that left-aligned id
        // column — a real regression, not an intentional restyle.
        if (item.type === 'insert') {
            const block = item.blocks?.[0];
            const imgData = block?.images?.[0];
            const langs = ['kn', 'en'].filter(l => (lang === l || lang === 'all'));
            const hasContent = langs.some(l => (block?.content?.[l] || []).some(line => line.trim() !== ''));
            const isBlank = !imgData && !hasContent;

            if (hasContent || isBlank) {
                // The card's DOM id is the block's id (not the item's),
                // same as every other block, so another item's
                // `references` can jump straight to it via
                // jumpToReference() — and a visible id badge is shown too,
                // same as a normal block row, so it can actually be cited
                // by someone reading the page. The only exception is
                // `hideId: true` (meant for the front cover, which nothing
                // should ever cite): that suppresses the DOM id and the
                // badge only — the image/text content itself still
                // renders exactly as normal.
                card.id = (block && !item.hideId) ? block.id : '';

                if (block && !item.hideId) {
                    const idLabel = document.createElement('span');
                    idLabel.className = 'block-id';
                    idLabel.innerText = formatIdForDisplay(block);
                    card.appendChild(idLabel);
                }

                if (imgData) {
                    // Same markup as a normal media-only image block
                    // (.block-row.media-only > .col-media > .image-card >
                    // img), on purpose: that way core/media.css sizes this
                    // photo with the exact same rules as every other photo
                    // in continuous view — screen, mobile and print. An
                    // earlier version gave title-style images their own
                    // separate size rule (max-height: 70vh), so the very
                    // same photo shrank the moment it gained a title.
                    const imgRow = document.createElement('div');
                    imgRow.className = 'block-row images media-only title-style-image-row';
                    const imgCol = document.createElement('div');
                    imgCol.className = 'col-media has-images';
                    const imgCard = document.createElement('div');
                    imgCard.className = 'image-card';
                    const img = document.createElement('img');
                    img.className = 'title-style-image';
                    img.src = imgData.src.includes('://') ? imgData.src : `images/${imgData.src}`;
                    img.alt = langs.map(l => (block.content?.[l] || [])[0]).find(Boolean) || '';
                    imgCard.appendChild(img);
                    imgCol.appendChild(imgCard);
                    imgRow.appendChild(imgCol);
                    card.appendChild(imgRow);
                }

                if (hasContent) {
                    // block.content.<lang> is an array of lines/paragraphs,
                    // so title-style text can span multiple lines.
                    const textWrap = document.createElement('div');
                    textWrap.className = 'title-style-text-wrap';
                    const ruleTop = document.createElement('div');
                    ruleTop.className = 'title-style-text-rule';
                    textWrap.appendChild(ruleTop);
                    langs.forEach(l => {
                        (block.content?.[l] || []).forEach(line => {
                            if (!line.trim()) return;
                            const lineEl = document.createElement('div');
                            lineEl.className = `title-style-text-line lang-${l}`;
                            lineEl.textContent = line;
                            textWrap.appendChild(lineEl);
                        });
                    });
                    const ruleBottom = document.createElement('div');
                    ruleBottom.className = 'title-style-text-rule';
                    textWrap.appendChild(ruleBottom);
                    card.appendChild(textWrap);
                }

                card.classList.add('title-style');
                if (isBlank) card.classList.add('insert-blank');
                container.appendChild(card);
                return;
            }
            // Else: plain photo (image + caption, no content) — fall
            // through to the normal per-block row rendering below.
        }

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
            const hasText   = hasTextContent(block);
            const trackable = isBlockTrackable(block);
            const isRead    = trackable && readBlocks.has(block.id);
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
                    const altText = (lang === 'kn') ? capKn : (lang === 'en') ? capEn : (capKn || capEn);
                    // Each active language gets its own caption line —
                    // never joined onto one line with "/" — same as every
                    // other multi-language caption/title in the app.
                    let captionsHtml = '';
                    if ((lang === 'kn' || lang === 'all') && capKn) {
                        captionsHtml += `<p class="image-caption lang-kn">${capKn}</p>`;
                    }
                    if ((lang === 'en' || lang === 'all') && capEn) {
                        captionsHtml += `<p class="image-caption lang-en">${capEn}</p>`;
                    }
                    mediaCol.innerHTML += `
                        <div class="image-card">
                            <img src="images/${img.src}" alt="${altText}">
                            ${captionsHtml}
                        </div>`;
                });
            }

            if (block.videos) {
                block.videos.forEach(v => { mediaCol.innerHTML += createVideoCard(v.url); });
            }

            row.appendChild(mediaCol);

            // Read tick — skipped only for a block with neither text nor
            // video (e.g. a standalone image); nothing to read or watch.
            if (trackable) {
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
                    updateProgressDisplay(newSet, totalBlockCount);
                };
                row.appendChild(readTick);
            }

            card.appendChild(row);
        });

        container.appendChild(card);
    });

    // Update progress counter
    updateProgressDisplay(readBlocks, totalBlockCount);
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        jumpToReference, goBackToMessage,
        filterContinuous, renderContinuousView,
    });
}
