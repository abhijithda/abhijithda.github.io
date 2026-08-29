// media.js — Pure media presentation utilities.
// No view-specific FAQ logic; provides text helpers and video card factory.

/**
 * Escape HTML special characters to prevent injection.
 */
export function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Convert bare URLs in text to clickable <a> links.
 */
export function linkify(text) {
    if (!text) return '';
    return String(text).replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
}

/**
 * Extract YouTube video ID from a URL (verbatim from master's createVideoCard).
 */
export function extractYouTubeId(url) {
    if (!url) return null;
    const cleanUrl = url.split('?t=')[0].split('&t=')[0];
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = cleanUrl.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

/**
 * Build a QR code image URL for a destination URL.
 */
export function buildQrUrl(destinationUrl, size = 100) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(destinationUrl)}`;
}

/**
 * Build a YouTube thumbnail URL from a video ID.
 */
export function buildYouTubeThumbnailUrl(videoId) {
    return `https://img.youtube.com/vi/${videoId}/0.jpg`;
}

/**
 * Create a media-wrap HTML string (video thumbnail + QR overlay).
 * Matches master's createVideoCard output structure exactly:
 *   .media-wrap > .video-card + .qr-code
 * so all existing CSS rules apply without change.
 */
export function createVideoCard(url) {
    const videoId = extractYouTubeId(url);
    if (!videoId) return '';
    const qrCodeUrl = buildQrUrl(url);
    return `
        <div class="media-wrap">
            <div class="video-card">
                <a href="${url}" target="_blank">
                    <img src="${buildYouTubeThumbnailUrl(videoId)}" alt="Watch Video">
                </a>
            </div>
            <div class="qr-code">
                <img src="${qrCodeUrl}" alt="QR Code">
            </div>
        </div>
    `;
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        escapeHtml, linkify, extractYouTubeId,
        buildQrUrl, buildYouTubeThumbnailUrl, createVideoCard,
    });
}
