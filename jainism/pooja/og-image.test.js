const fs = require('fs');
const path = require('path');

// The link-preview picture (WhatsApp, Facebook, Telegram, X). Those apps skip
// pictures that are the wrong shape or too heavy, and silently show a plain
// link instead, so this fails loudly when the file or its tags drift apart.

const MAX_BYTES = 300 * 1024;          // WhatsApp may ignore much larger previews
const WIDTH = 1200;
const HEIGHT = 630;

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function metaContent(name) {
    const tag = html.match(new RegExp(`<meta\\s+(?:property|name)="${name}"\\s+content="([^"]*)"`));
    return tag ? tag[1] : null;
}

// Width/height from a JPEG's start-of-frame marker (no image library needed)
function jpegSize(buf) {
    if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG');
    let i = 2;
    while (i < buf.length) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + buf.readUInt16BE(i + 2);
    }
    throw new Error('no size found in JPEG');
}

describe('link preview image (og:image)', () => {
    const imageUrl = metaContent('og:image');

    test('index.html has an og:image tag with an absolute https address', () => {
        expect(imageUrl).not.toBeNull();
        expect(imageUrl).toMatch(/^https:\/\//);
    });

    test('the address points into the images/ folder', () => {
        expect(new URL(imageUrl).pathname).toMatch(/\/images\/[^/]+\.jpg$/);
    });

    const file = path.join(__dirname, 'images', path.basename(new URL(imageUrl).pathname));

    test('that file exists in images/', () => {
        expect(fs.existsSync(file)).toBe(true);
    });

    test(`is ${WIDTH}x${HEIGHT}`, () => {
        const size = jpegSize(fs.readFileSync(file));
        expect(size.width).toBe(WIDTH);
        expect(size.height).toBe(HEIGHT);
    });

    test('is small enough for WhatsApp (300 KB or less)', () => {
        expect(fs.statSync(file).size).toBeLessThanOrEqual(MAX_BYTES);
    });

    test('the width/height/type tags in index.html match the file', () => {
        expect(metaContent('og:image:width')).toBe(String(WIDTH));
        expect(metaContent('og:image:height')).toBe(String(HEIGHT));
        expect(metaContent('og:image:type')).toBe('image/jpeg');
    });

    test('X is told to show the large picture card', () => {
        expect(metaContent('twitter:card')).toBe('summary_large_image');
    });
});
