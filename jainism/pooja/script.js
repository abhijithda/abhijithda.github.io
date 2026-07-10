const btn = document.getElementById('settings-btn');
const menu = document.getElementById('settings-menu');

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

function renderChat(data, container, lang = 'all') {
    if (!container) return; // Safety check
    container.innerHTML = "";

    data.forEach(item => {
        const card = document.createElement('div');
        card.className = `card ${item.type}`;
        card.id = item.id;

        // --- Excerpt Logic ---
        if (item.references && item.references.length > 0) {
            const excerptContainer = document.createElement('div');
            excerptContainer.className = "reply-excerpt multi-block";

            item.references.forEach(refId => {
                const isBlockRef = refId.includes('_b_');
                const parentId = isBlockRef ? refId.split('_b_')[0] : refId;
                const parentMatch = data.find(i => i.id === parentId);

                if (parentMatch) {
                    const blockData = isBlockRef
                        ? (parentMatch.blocks || []).find(b => b.id === refId)
                        : (parentMatch.blocks || [])[0];

                    const shortId = blockData ? formatIdForDisplay(blockData) : parentId;

                    const blockRow = document.createElement('div');
                    blockRow.className = "block-row excerpt-row";

                    // Nested structure for horizontal columns
                    const knContent = (lang === 'kn' || lang === 'all')
                        ? `<div class="col-kn"><p>${blockData?.content?.kn ? blockData.content.kn[0] : ''}</p></div>`
                        : '';
                    const enContent = (lang === 'en' || lang === 'all')
                        ? `<div class="col-en"><p>${blockData?.content?.en ? blockData.content.en[0] : ''}</p></div>`
                        : '';

                    blockRow.innerHTML = `
                        <span class="block-id" title="Jump to source">${shortId}</span>
                        <div class="excerpt-content-wrap">
                            ${knContent}
                            ${enContent}
                        </div>
                    `;

                    // Action 1: Click ID to Jump
                    blockRow.querySelector('.block-id').onclick = (e) => {
                        e.stopPropagation();
                        const target = document.getElementById(refId);
                        if (target) {
                            window.__lastReadPos = window.scrollY; // Bookmark current position
                            const headerHeight = document.querySelector('.app-header').offsetHeight || 80;
                            window.scrollTo({
                                top: target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 20,
                                behavior: 'smooth'
                            });

                            const backBtn = document.getElementById('back-to-message');
                            if (backBtn) {
                                backBtn.style.display = 'block';
                                backBtn.onclick = () => {
                                    window.scrollTo({ top: window.__lastReadPos, behavior: 'smooth' });
                                    backBtn.style.display = 'none';
                                };
                            }
                        }
                    };

                    // Action 2: Click Text to Expand
                    blockRow.querySelector('.excerpt-content-wrap').onclick = (e) => {
                        e.stopPropagation();
                        blockRow.classList.toggle('expanded');
                    };

                    excerptContainer.appendChild(blockRow);
                }
            });
            card.prepend(excerptContainer);
        }

        // --- Multi-Block Row Generation ---
        item.blocks.forEach(block => {
            const row = document.createElement('div');
            row.className = `block-row ${block.type}`;

            row.id = block.id;
            // Create an ID element (e.g., Q1, A1, S1)
            const idLabel = document.createElement('span');
            idLabel.className = 'block-id';
            idLabel.innerText = formatIdForDisplay(block);
            row.appendChild(idLabel); // Add ID to the card

            // Column 1: Kannada
            if ((lang === 'kn' || lang === 'all') && block.content.kn && block.content.kn.length > 0) {
                const knCol = document.createElement('div');
                knCol.className = "col-kn";
                knCol.innerHTML = `<p>${block.content.kn.join('<br>')}</p>`;
                row.appendChild(knCol);
            }

            // Column 2: English
            if ((lang === 'en' || lang === 'all') && block.content.en && block.content.en.length > 0) {
                const enCol = document.createElement('div');
                enCol.className = "col-en";
                enCol.innerHTML = `<p>${block.content.en.join('<br>')}</p>`;
                row.appendChild(enCol);
            }

            // Column 3: Media
            const mediaCol = document.createElement('div');
            mediaCol.className = "col-media";
            if (block.videos && block.videos.length > 0) {
                block.videos.forEach(vid => { mediaCol.innerHTML += createVideoCard(vid.url); });
            }
            if (block.images && block.images.length > 0) {
                block.images.forEach(img => {
                    let cap = (lang === 'kn' && img.caption.kn) ? img.caption.kn : (lang === 'en' && img.caption.en) ? img.caption.en : (img.caption.kn || "") + (img.caption.en ? " / " + img.caption.en : "");
                    mediaCol.innerHTML += `<div class="image-card"><img src="images/${img.src}" alt="${cap}">${cap ? `<p class="image-caption">${cap}</p>` : ''}</div>`;
                });
            }
            row.appendChild(mediaCol);

            card.appendChild(row);
        });

        container.appendChild(card);
    });
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
    };
}
