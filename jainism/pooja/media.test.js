const { escapeHtml, linkify, createPipThumbnail, extractYouTubeId, buildQrUrl, buildYouTubeThumbnailUrl } = require('./media.js');

describe('escapeHtml', () => {
    test('escapes ampersands', () => {
        expect(escapeHtml('a & b')).toBe('a &amp; b');
    });
    test('escapes angle brackets', () => {
        expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    });
    test('escapes quotes', () => {
        expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
        expect(escapeHtml("it's")).toBe("it&#039;s");
    });
    test('returns empty string for falsy input', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
        expect(escapeHtml('')).toBe('');
    });
    test('handles numbers by converting to string', () => {
        expect(escapeHtml(42)).toBe('42');
    });
});

describe('linkify', () => {
    test('converts http URLs to links', () => {
        const result = linkify('Visit https://example.com');
        expect(result).toContain('<a href="https://example.com"');
        expect(result).toContain('target="_blank"');
        expect(result).toContain('rel="noopener noreferrer"');
    });
    test('converts https URLs to links', () => {
        const result = linkify('See http://test.org/page');
        expect(result).toContain('<a href="http://test.org/page"');
    });
    test('does not modify text without URLs', () => {
        expect(linkify('No URL here')).toBe('No URL here');
    });
    test('returns empty string for falsy input', () => {
        expect(linkify(null)).toBe('');
        expect(linkify('')).toBe('');
    });
});

describe('extractYouTubeId', () => {
    test('extracts from watch URL', () => {
        expect(extractYouTubeId('https://www.youtube.com/watch?v=bgldj0TMZB4')).toBe('bgldj0TMZB4');
    });
    test('extracts from youtu.be URL', () => {
        expect(extractYouTubeId('https://youtu.be/3Z3uwIGj_VM')).toBe('3Z3uwIGj_VM');
    });
    test('extracts from URL with timestamp', () => {
        expect(extractYouTubeId('https://www.youtube.com/watch?v=bgldj0TMZB4&t=120')).toBe('bgldj0TMZB4');
    });
    test('returns null for non-YouTube URL', () => {
        expect(extractYouTubeId('https://example.com')).toBeNull();
    });
    test('returns null for empty input', () => {
        expect(extractYouTubeId(null)).toBeNull();
        expect(extractYouTubeId('')).toBeNull();
    });
});

describe('buildQrUrl', () => {
    test('builds QR URL with default size', () => {
        const url = buildQrUrl('https://example.com');
        expect(url).toContain('size=100x100');
        expect(url).toContain(encodeURIComponent('https://example.com'));
    });
    test('builds QR URL with custom size', () => {
        const url = buildQrUrl('https://example.com', 150);
        expect(url).toContain('size=150x150');
    });
});

describe('buildYouTubeThumbnailUrl', () => {
    test('builds correct thumbnail URL', () => {
        expect(buildYouTubeThumbnailUrl('abc123XYZ45'))
            .toBe('https://img.youtube.com/vi/abc123XYZ45/0.jpg');
    });
});

describe('createPipThumbnail', () => {
    test('creates video PIP with QR', () => {
        const html = createPipThumbnail({
            type: 'video',
            mediaSrc: 'https://img.youtube.com/vi/abc/0.jpg',
            qrSrc: 'https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=test',
            alt: 'Watch Video',
            href: 'https://youtube.com/watch?v=abc',
        });

        expect(html).toContain('class="pip-thumbnail"');
        expect(html).toContain('data-pip-type="video"');
        expect(html).toContain('data-pip-has-qr="true"');
        expect(html).toContain('class="pip-thumbnail__media"');
        expect(html).toContain('class="pip-thumbnail__qr"');
        expect(html).toContain('<a href="https://youtube.com/watch?v=abc"');
        expect(html).toContain('alt="Watch Video"');
    });

    test('creates graphic PIP without QR', () => {
        const html = createPipThumbnail({
            type: 'graphic',
            mediaSrc: 'images/photo.jpeg',
            alt: 'Temple photo',
        });

        expect(html).toContain('data-pip-type="graphic"');
        expect(html).toContain('data-pip-has-qr="false"');
        expect(html).not.toContain('pip-thumbnail__qr');
        expect(html).not.toContain('<a ');
    });

    test('returns empty string for missing mediaSrc', () => {
        expect(createPipThumbnail({ type: 'video' })).toBe('');
        expect(createPipThumbnail({})).toBe('');
    });

    test('escapes alt text', () => {
        const html = createPipThumbnail({
            type: 'graphic',
            mediaSrc: 'test.jpg',
            alt: 'Test "quotes" & <tags>',
        });
        expect(html).toContain('&quot;quotes&quot;');
        expect(html).toContain('&amp;');
        expect(html).toContain('&lt;tags&gt;');
    });
});
