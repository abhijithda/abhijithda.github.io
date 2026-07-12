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

function renderChat(data, container, lang = 'all') {
    if (!container) return;
    container.innerHTML = "";

    data.forEach(item => {
        const card = document.createElement('div');
        card.className = `card ${item.type}`;
        card.id = item.id;

        item.blocks.forEach(block => {
            const row = document.createElement('div');
            row.className = `block-row ${block.type}`;
            row.id = block.id;

            // ID Label (e.g. Q-1.1)
            const idLabel = document.createElement('span');
            idLabel.className = 'block-id';
            idLabel.innerText = formatIdForDisplay(block);
            row.appendChild(idLabel);

            // Kannada Column
            if ((lang === 'kn' || lang === 'all') && block.content?.kn?.length > 0) {
                const knCol = document.createElement('div');
                knCol.className = "col-kn";
                knCol.innerHTML = `<p>${block.content.kn.join('<br>')}</p>`;
                row.appendChild(knCol);
            }

            // English Column
            if ((lang === 'en' || lang === 'all') && block.content?.en?.length > 0) {
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
