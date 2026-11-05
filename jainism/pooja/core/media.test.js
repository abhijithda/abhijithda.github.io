const {
    escapeHtml,
    linkify,
    extractYouTubeId,
    buildQrUrl,
    buildYouTubeThumbnailUrl,
    createVideoCard,
    publishImageSize,
    installImageSizeTracking,
} = require('./media');

describe('escapeHtml', () => {
    test('escapes the five HTML special characters', () => {
        expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`))
            .toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#039;s&lt;/a&gt;');
    });

    test('returns an empty string for falsy input', () => {
        expect(escapeHtml('')).toBe('');
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });
});

describe('linkify', () => {
    test('wraps a bare URL in a target=_blank link', () => {
        const out = linkify('See https://example.com/page for more');
        expect(out).toBe(
            'See <a href="https://example.com/page" target="_blank" rel="noopener noreferrer">https://example.com/page</a> for more'
        );
    });

    test('leaves text with no URL unchanged', () => {
        expect(linkify('no links here')).toBe('no links here');
    });
});

describe('extractYouTubeId', () => {
    test.each([
        ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
        ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'dQw4w9WgXcQ'],
    ])('extracts the 11-char id from %s', (url, expected) => {
        expect(extractYouTubeId(url)).toBe(expected);
    });

    test('returns null for a non-YouTube URL', () => {
        expect(extractYouTubeId('https://example.com/video')).toBeNull();
    });

    test('returns null for falsy input', () => {
        expect(extractYouTubeId(null)).toBeNull();
        expect(extractYouTubeId('')).toBeNull();
    });
});

describe('buildQrUrl / buildYouTubeThumbnailUrl', () => {
    test('builds a QR API url with the destination encoded', () => {
        const url = buildQrUrl('https://example.com/a?b=c', 80);
        expect(url).toBe(
            'https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=https%3A%2F%2Fexample.com%2Fa%3Fb%3Dc'
        );
    });

    test('defaults QR size to 100 when not given', () => {
        expect(buildQrUrl('https://example.com')).toContain('size=100x100');
    });

    test('builds the standard YouTube thumbnail url from a video id', () => {
        expect(buildYouTubeThumbnailUrl('dQw4w9WgXcQ'))
            .toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/0.jpg');
    });
});

describe('createVideoCard', () => {
    test('renders a media-wrap with a video thumbnail and a QR overlay for a valid YouTube URL', () => {
        const html = createVideoCard('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        expect(html).toContain('class="media-wrap"');
        expect(html).toContain('class="video-card"');
        expect(html).toContain('class="qr-code"');
        expect(html).toContain('img.youtube.com/vi/dQw4w9WgXcQ/0.jpg');
    });

    test('returns an empty string for a non-YouTube URL', () => {
        expect(createVideoCard('https://example.com/not-youtube')).toBe('');
    });
});

describe('publishImageSize', () => {
    function fakeImg(w, h) {
        const img = document.createElement('img');
        Object.defineProperty(img, 'naturalWidth', { value: w });
        Object.defineProperty(img, 'naturalHeight', { value: h });
        return img;
    }

    test('publishes the natural aspect ratio and pixel width as CSS custom properties', () => {
        const img = fakeImg(1249, 2048);
        publishImageSize(img);
        expect(img.style.getPropertyValue('--ar')).toBe((1249 / 2048).toFixed(4));
        expect(img.style.getPropertyValue('--nw')).toBe('1249');
    });

    test('does nothing until the image has real dimensions (not loaded / broken)', () => {
        const img = fakeImg(0, 0);
        publishImageSize(img);
        expect(img.style.getPropertyValue('--ar')).toBe('');
        expect(img.style.getPropertyValue('--nw')).toBe('');
        expect(() => publishImageSize(null)).not.toThrow();
    });

    test('a capture-phase load listener covers images created later, including from innerHTML', () => {
        document.body.innerHTML = '';
        installImageSizeTracking(document);
        const holder = document.createElement('div');
        holder.innerHTML = '<img src="x.jpg">';
        document.body.appendChild(holder);
        const img = holder.querySelector('img');
        Object.defineProperty(img, 'naturalWidth', { value: 800 });
        Object.defineProperty(img, 'naturalHeight', { value: 400 });
        img.dispatchEvent(new Event('load'));   // load doesn't bubble: only a capture listener sees it
        expect(img.style.getPropertyValue('--ar')).toBe('2.0000');
        expect(img.style.getPropertyValue('--nw')).toBe('800');
    });
});
