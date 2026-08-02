// media.js — Pure media presentation utilities.
// No view-specific FAQ logic; provides text helpers and PIP thumbnail factory.

/**
 * Escape HTML special characters to prevent injection.
 * @param {string} text
 * @returns {string}
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
 * @param {string} text
 * @returns {string}
 */
export function linkify(text) {
    if (!text) return '';
    return String(text).replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
}

/**
 * Extract YouTube video ID from a URL.
 * @param {string} url
 * @returns {string|null}
 */
export function extractYouTubeId(url) {
    if (!url) return null;
    const cleanUrl = url.split('?t=')[0].split('&t=')[0];
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = cleanUrl.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

/**
 * Build a QR code URL from any destination URL.
 * @param {string} destinationUrl
 * @param {number} size - QR image size in pixels (default 100)
 * @returns {string}
 */
export function buildQrUrl(destinationUrl, size = 100) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(destinationUrl)}`;
}

/**
 * Build a YouTube thumbnail URL from a video ID.
 * @param {string} videoId
 * @returns {string}
 */
export function buildYouTubeThumbnailUrl(videoId) {
    return `https://img.youtube.com/vi/${videoId}/0.jpg`;
}

/**
 * Create a PIP (Picture-in-Picture) thumbnail element as an HTML string.
 * This is a combined video/graphic thumbnail with a QR code inset in the
 * bottom-right corner. It is view-agnostic — callers decide where to place it.
 *
 * @param {Object} options
 * @param {'video'|'graphic'} options.type - What kind of main media
 * @param {string} options.mediaSrc - URL for the main media image
 * @param {string} [options.qrSrc] - URL for the QR code image (omit to skip QR)
 * @param {string} [options.alt] - Alt text for the main media
 * @param {string} [options.href] - If provided, wraps media in an <a> tag
 * @returns {string} HTML string for the PIP thumbnail
 */
export function createPipThumbnail(options) {
    const { type, mediaSrc, qrSrc, alt = '', href } = options;

    if (!mediaSrc) return '';

    const hasQr = !!qrSrc;
    const mediaTag = `<img src="${escapeHtml(mediaSrc)}" alt="${escapeHtml(alt)}">`;
    const mediaHtml = href
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${mediaTag}</a>`
        : mediaTag;

    const qrHtml = hasQr
        ? `<div class="pip-thumbnail__qr"><img src="${escapeHtml(qrSrc)}" alt="QR Code"></div>`
        : '';

    return `<div class="pip-thumbnail" data-pip-type="${escapeHtml(type)}" data-pip-has-qr="${hasQr}">` +
        `<div class="pip-thumbnail__media">${mediaHtml}</div>` +
        qrHtml +
        `</div>`;
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        escapeHtml,
        linkify,
        extractYouTubeId,
        buildQrUrl,
        buildYouTubeThumbnailUrl,
        createPipThumbnail,
    });
}
