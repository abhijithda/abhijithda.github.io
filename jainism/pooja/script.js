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

// Updated Video Card with QR Code
function createVideoCard(url) {
    // Generate a QR code URL using a free Google-friendly API
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(url)}`;

    return `
        <div class="video-card">
            <a href="${url}" target="_blank">
                <img src="https://img.youtube.com/vi/${url.split('v=')[1]}/0.jpg" alt="Watch Video">
            </a>
            <div class="print-only-qr">
                <p>Scan to watch:</p>
                <img src="${qrCodeUrl}" alt="QR Code">
            </div>
        </div>
    `;
}
let allData = []; // Global variable

document.addEventListener("DOMContentLoaded", () => {
    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            allData = data; // Assign the fetched data to the global variable
            renderChat();   // Initial render
        })
        .catch(error => console.error('Error loading data:', error));
});

function getQuestionText(id) {
    // USE allData here, not data
    const match = allData.find(item => item.id === id);
    return match ? match.blocks[0].content.kn[0] : "Original question...";
}

function renderChat() {
    const container = document.getElementById('chat-container');
    const langSelect = document.getElementById('lang-select');
    // Safety check: if dropdown doesn't exist, default to 'both'
    const lang = langSelect ? langSelect.value : 'both';
    container.innerHTML = ""; // Clear existing

    // USE allData here, not data
    allData.forEach(item => {
        const bubble = document.createElement('div');
        bubble.className = `bubble ${item.type}`;
        bubble.id = item.id;

        // Reply Excerpt
        if (item.references && item.references.length > 0) {
            const excerpt = document.createElement('div');
            excerpt.className = "reply-excerpt";

            excerpt.onclick = () => {
                const target = document.getElementById(item.references[0]);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            };

            const match = allData.find(i => i.id === item.references[0]);

            // Choose the language for the excerpt based on the current 'lang' state
            let excerptText = "...";
            if (match) {
                if (lang === 'kn') {
                    excerptText = match.blocks[0].content.kn[0];
                } else if (lang === 'en') {
                    excerptText = match.blocks[0].content.en[0];
                } else {
                    // If 'both', show Kannada as default or combine them
                    excerptText = match.blocks[0].content.kn[0] + " / " + match.blocks[0].content.en[0];
                }
            }

            excerpt.innerText = (match ? match.blocks[0].content.kn[0] : "Original question...");
            bubble.prepend(excerpt);
        }

        // Text Content
        const textDiv = document.createElement('div');
        textDiv.className = "text-content";
        let contentHtml = "";
        if (lang === 'kn' || lang === 'both') contentHtml += `<p>${item.blocks[0].content.kn.join('<br>')}</p>`;
        if (lang === 'en' || lang === 'both') contentHtml += `<p style="color:#555">${item.blocks[0].content.en.join('<br>')}</p>`;
        textDiv.innerHTML = contentHtml;
        bubble.appendChild(textDiv);

        // Videos
        if (item.blocks[0].videos && item.blocks[0].videos.length > 0) {
            const mediaDiv = document.createElement('div');
            mediaDiv.className = "media-content";
            item.blocks[0].videos.forEach(vid => {
                mediaDiv.innerHTML += createVideoCard(vid.url);
            });
            bubble.appendChild(mediaDiv);
        }

        container.appendChild(bubble);
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