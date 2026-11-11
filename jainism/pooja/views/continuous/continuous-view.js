// continuous-view.js — Continuous scroll view.
// Rendering logic is verbatim from master's script.js renderChat().
// Imports from media.js and read-tracking.js for clean separation.

import { createVideoCard } from '../../core/media.js';
import { getReadBlocks, isBlockTrackable, countTrackableBlocks, updateProgressDisplay } from '../../core/read-tracking.js';
import { buildReadTick } from '../../core/read-tick.js';
import { formatIdForDisplay, buildBlockIndex, resolveReference, classifyInsert, hasAnyText, langsWithText, imageUrl } from '../../core/blocks.js';
import { activeLangCodes } from '../../core/langs.js';
import { buildShareButton } from '../../core/share-ui.js';

// ── Back-navigation stack (verbatim from master) ──────────────────────────
let backStack = [];

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
// `opts.indexData`: the full dataset, when `data` is only part of it (the page a
// share link opens). Labels and reply excerpts are resolved against the full
// data, so a shared answer still shows its question and its A-3.1 label.
export function renderContinuousView(data, container, lang = 'all', opts = {}) {
    if (!container) return;
    container.innerHTML = '';
    backStack = [];

    const indexData = opts.indexData || data;
    const { blockById, itemById } = buildBlockIndex(indexData);

    const readBlocks      = getReadBlocks(localStorage);
    const totalBlockCount = countTrackableBlocks(indexData);
    const langs           = activeLangCodes(lang);   // 'kn' | 'en' | 'all' -> ['kn'] | ['en'] | ['kn','en']

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
            // core/blocks.js's classifyInsert(): 'title' | 'photo' | 'blank'.
            const { block, image: imgData, kind, hasContent, showId } = classifyInsert(item, langs);
            const isBlank = kind === 'blank';

            if (kind !== 'photo') {
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
                card.id = showId ? block.id : '';

                if (showId) {
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
                    img.src = imageUrl(imgData.src);
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

                langsWithText(refBlock, langs).forEach(l => {
                    const col = document.createElement('div');
                    col.className = `col-${l}`;
                    col.innerHTML = `<p>${refBlock.content[l].join(' ')}</p>`;
                    contentWrap.appendChild(col);
                });

                excerptRow.appendChild(contentWrap);
                excerptContainer.appendChild(excerptRow);
            });

            if (excerptContainer.children.length > 0) card.appendChild(excerptContainer);
        }

        // Share the whole item (not for covers/dividers, which are `insert` items)
        if (item.type !== 'insert') card.appendChild(buildShareButton({ itemId: item.id }));

        // Blocks (verbatim from master's renderChat block loop)
        item.blocks.forEach(block => {
            const row = document.createElement('div');
            // .media-only = no text at all; distinct from isBlockTrackable —
            // a video-only block has no text (gets this class) but IS trackable.
            const hasText   = hasAnyText(block);
            const trackable = isBlockTrackable(block);
            const isRead    = trackable && readBlocks.has(block.id);
            row.className = `block-row ${block.type}${hasText ? '' : ' media-only'}${isRead ? ' read' : ''}`;
            row.id = block.id;

            // ID label
            const idLabel = document.createElement('span');
            idLabel.className = 'block-id';
            idLabel.innerText = formatIdForDisplay(block);
            row.appendChild(idLabel);

            // One text column per active language that has text (Kannada, English)
            langsWithText(block, langs).forEach(l => {
                const col = document.createElement('div');
                col.className = `col-${l}`;
                col.innerHTML = `<p>${block.content[l].join('<br>')}</p>`;
                row.appendChild(col);
            });

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
                            <img src="${imageUrl(img.src)}" alt="${altText}">
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
                row.appendChild(buildReadTick(block, {
                    isRead,
                    totalBlockCount,
                    onToggle: nowRead => row.classList.toggle('read', nowRead),
                }));
            }

            row.appendChild(buildShareButton({ blockId: block.id }));

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
