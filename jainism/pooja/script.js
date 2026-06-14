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

document.addEventListener("DOMContentLoaded", () => {
    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            const container = document.getElementById('chat-container');


            // Find the original question text based on the reference ID
            function getQuestionText(id) {
                // This looks through the data array to find the question that matches the ID
                const match = data.find(item => item.id === id);
                return match ? match.blocks[0].content.kn[0] : "Original question...";
            }


            data.forEach(item => {
                const bubble = document.createElement('div');
                bubble.className = `bubble ${item.type}`;
                bubble.id = item.id;

                // Create a container for the text
                const textDiv = document.createElement('div');
                textDiv.className = "text-content";
                textDiv.innerHTML = `<p>${item.blocks[0].content.kn.join('<br>')}</p>`;
                bubble.appendChild(textDiv);

                // Add video cards to the right side if they exist
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
        })
        .catch(error => console.error('Error loading data:', error));
});


function togglePrintMode() {
    const isChecked = document.getElementById('print-toggle').checked;
    const body = document.body;
    
    if (isChecked) {
        body.classList.add('print-mode');
    } else {
        body.classList.remove('print-mode');
    }
}