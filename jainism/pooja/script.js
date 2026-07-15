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
}

document.addEventListener('DOMContentLoaded', () => {
    const toggleVideos = document.getElementById('toggle-videos') || document.getElementById('toggleVideos');
    const toggleQrs = document.getElementById('toggle-qrs') || document.getElementById('toggleQrs');

    if (toggleVideos) {
        toggleVideos.addEventListener('change', updateMediaVisibility);
    }
    if (toggleQrs) {
        toggleQrs.addEventListener('change', updateMediaVisibility);
    }


    updateMediaVisibility();

    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            const container = document.getElementById('chat-container');
            const langSelect = document.getElementById('lang-select');
            const lang = langSelect ? langSelect.value : 'all';

            renderChat(data, container, lang);   // Initial render
            // Ensure media visibility rules apply to newly-rendered elements
            updateMediaVisibility();

            // Add Listener HERE (it has access to 'data' and 'container' via closure)
            langSelect.addEventListener('change', (e) => {
                renderChat(data, container, e.target.value);
                updateMediaVisibility();
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

            // Mark-as-read slider — bottom-right of the block, its own
            // full-width line (flex-basis 100% inside the wrapping row).
            // Block-level, not card-level: a video block can run over an
            // hour, so a reader may finish one block without the whole
            // multi-block answer being "done".
            const readToggleRow = document.createElement('div');
            readToggleRow.className = 'read-toggle-row';

            const readLabel = document.createElement('span');
            readLabel.className = 'read-toggle-label';
            readLabel.textContent = 'Mark as read';
            readToggleRow.appendChild(readLabel);

            const switchLabel = document.createElement('label');
            switchLabel.className = 'switch read-switch';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = isRead;
            checkbox.onchange = () => toggleBlockRead(block.id, totalBlockCount);
            const sliderEl = document.createElement('span');
            sliderEl.className = 'slider';
            switchLabel.appendChild(checkbox);
            switchLabel.appendChild(sliderEl);
            readToggleRow.appendChild(switchLabel);

            row.appendChild(readToggleRow);

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
    };
}
