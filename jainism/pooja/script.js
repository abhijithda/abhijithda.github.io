function filterChat() {
    const query = document.getElementById('search-bar').value.toLowerCase();
    const bubbles = document.querySelectorAll('.bubble');

    bubbles.forEach(bubble => {
        const text = bubble.innerText.toLowerCase();
        if (text.includes(query)) {
            bubble.style.display = ""; // Show
        } else {
            bubble.style.display = "none"; // Hide
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

    return `
        <div class="video-card">
            <a href="${url}" target="_blank">
                <img src="https://img.youtube.com/vi/${videoId}/0.jpg" alt="Watch Video">
            </a>
            <div class="print-only-qr">
                <p>Scan to watch:</p>
                <img src="${qrCodeUrl}" alt="QR Code">
            </div>
        </div>
    `;
}

document.addEventListener("DOMContentLoaded", () => {
    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            const container = document.getElementById('chat-container');
            const langSelect = document.getElementById('lang-select');
            const lang = langSelect ? langSelect.value : 'both';

            renderChat(data, container, lang);   // Initial render

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

function renderChat(data, container, lang = 'both') {
    if (!container) return; // Safety check
    container.innerHTML = "";

    data.forEach(item => {
        const card = document.createElement('div');
        card.className = `bubble ${item.type}`;
        card.id = item.id;

        // --- Excerpt Logic ---
        if (item.references && item.references.length > 0) {
            const excerpt = document.createElement('div');
            excerpt.className = "reply-excerpt";
            excerpt.onclick = () => {
                const target = document.getElementById(item.references[0]);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - 100, behavior: 'smooth' });
                }
            };
            const match = data.find(i => i.id === item.references[0]);
            let excerptText = "...";
            if (match && match.blocks && match.blocks.length > 0) {
                if (lang === 'kn') excerptText = match.blocks[0].content.kn[0];
                else if (lang === 'en') excerptText = match.blocks[0].content.en[0] || "...";
                else excerptText = match.blocks[0].content.kn[0] + (match.blocks[0].content.en[0] ? " / " + match.blocks[0].content.en[0] : "");
            }
            excerpt.innerText = excerptText;
            card.appendChild(excerpt);
        }

        // --- Multi-Block Row Generation ---
        item.blocks.forEach(block => {
            const row = document.createElement('div');
            row.className = `block-row ${block.type}`;

            // Column 1: Kannada
            const knCol = document.createElement('div');
            knCol.className = "col-kn";
            if ((lang === 'kn' || lang === 'both') && block.content.kn && block.content.kn.length > 0) {
                knCol.innerHTML = `<p>${block.content.kn.join('<br>')}</p>`;
            }
            row.appendChild(knCol);

            // Column 2: English
            const enCol = document.createElement('div');
            enCol.className = "col-en";
            if ((lang === 'en' || lang === 'both') && block.content.en && block.content.en.length > 0) {
                enCol.innerHTML = `<p>${block.content.en.join('<br>')}</p>`;
            }
            row.appendChild(enCol);

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

        // --- QR Code Base ---
        const qrDiv = document.createElement('div');
        qrDiv.className = 'print-only-qr';
        card.appendChild(qrDiv);

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
        // Export the functions you want to test here, for example:
        filterChat,
        createVideoCard,
        renderChat,
        togglePrintMode,
    };
}