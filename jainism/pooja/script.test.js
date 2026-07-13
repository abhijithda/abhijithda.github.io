const { updateMediaVisibility, renderChat } = require('./script');

describe('Display Options', () => {
    let toggleVideos, toggleQrs;

    beforeEach(() => {
        document.body.innerHTML = `
            <input type="checkbox" id="toggleVideos">
            <input type="checkbox" id="toggleQrs">
        `;
        toggleVideos = document.getElementById('toggleVideos');
        toggleQrs = document.getElementById('toggleQrs');

        // Mock global variables if they are used directly in script.js
        global.toggleVideos = toggleVideos;
        global.toggleQrs = toggleQrs;
    });

    test('should toggle show-videos class on body when checkbox is clicked', () => {
        toggleVideos.checked = true;
        updateMediaVisibility();
        expect(document.body.classList.contains('show-videos')).toBe(true);

        toggleVideos.checked = false;
        updateMediaVisibility();
        expect(document.body.classList.contains('show-videos')).toBe(false);
    });

    test('should toggle show-qrs class on body when checkbox is clicked', () => {
        toggleQrs.checked = true;
        updateMediaVisibility();
        expect(document.body.classList.contains('show-qrs')).toBe(true);

        toggleQrs.checked = false;
        updateMediaVisibility();
        expect(document.body.classList.contains('show-qrs')).toBe(false);
    });
});

describe('updateMediaVisibility', () => {
    let toggleVideos, toggleQRs;

    beforeEach(() => {
        document.body.innerHTML = `
            <input type="checkbox" id="toggle-videos">
            <input type="checkbox" id="toggle-qrs">
        `;
        toggleVideos = document.getElementById('toggle-videos');
        toggleQRs = document.getElementById('toggle-qrs');
        document.body.className = '';
    });

    test('should toggle show-videos class based on checkbox state', () => {
        toggleVideos.checked = true;
        updateMediaVisibility();
        expect(document.body.classList.contains('show-videos')).toBe(true);

        toggleVideos.checked = false;
        updateMediaVisibility();
        expect(document.body.classList.contains('show-videos')).toBe(false);
    });

    test('should toggle show-qrs class based on checkbox state', () => {
        toggleQRs.checked = true;
        updateMediaVisibility();
        expect(document.body.classList.contains('show-qrs')).toBe(true);

        toggleQRs.checked = false;
        updateMediaVisibility();
        expect(document.body.classList.contains('show-qrs')).toBe(false);
    });
});

describe('renderChat', () => {
    let container;

    beforeEach(() => {
        document.body.innerHTML = '<div id="chat-container"></div>';
        container = document.getElementById('chat-container');
    });

    function baseBlock(overrides = {}) {
        return {
            id: 'a_999_b_1',
            type: 'paragraph',
            content: { kn: [], en: [] },
            tags: [],
            videos: [],
            images: [],
            ...overrides,
        };
    }

    // Regression test for: a content-less image block (e.g. a photo-only
    // block inside a text-heavy answer, like the real "I-13.5" case) used
    // to render at the small, beside-text thumbnail size instead of the
    // large "nothing to sit beside" treatment. The 'media-only' class is
    // what the CSS keys off to decide which size to use.
    test('marks a block with no text content as media-only', () => {
        const data = [{
            id: 'a_999',
            type: 'answer',
            timestamp: '2026-07-12T00:00:00Z',
            references: null,
            blocks: [baseBlock({
                images: [{ src: 'test.jpg', caption: { en: 'Test', kn: 'ಪರೀಕ್ಷೆ' } }],
            })],
        }];

        renderChat(data, container, 'all');

        const row = document.getElementById('a_999_b_1');
        expect(row.classList.contains('media-only')).toBe(true);
    });

    // A block that DOES have text alongside its image should NOT get the
    // large treatment — it should stay in the compact, beside-text layout.
    test('does not mark a block with text content as media-only', () => {
        const data = [{
            id: 'a_998',
            type: 'answer',
            timestamp: '2026-07-12T00:00:00Z',
            references: null,
            blocks: [baseBlock({
                id: 'a_998_b_1',
                content: { kn: ['ಪಠ್ಯ'], en: ['Some text'] },
                images: [{ src: 'test.jpg', caption: { en: 'Test', kn: 'ಪರೀಕ್ಷೆ' } }],
            })],
        }];

        renderChat(data, container, 'all');

        const row = document.getElementById('a_998_b_1');
        expect(row.classList.contains('media-only')).toBe(false);
    });

    // Regression test for: images used to disappear entirely whenever both
    // the Videos and QR toggles were off, because .col-media's visibility
    // was gated solely on those two toggles with no exception for photos.
    // The 'has-images' class is what the CSS uses to show photos
    // unconditionally, independent of the Video/QR toggle state.
    test('marks the media column as has-images when a block has a photo', () => {
        const data = [{
            id: 'a_997',
            type: 'answer',
            timestamp: '2026-07-12T00:00:00Z',
            references: null,
            blocks: [baseBlock({
                id: 'a_997_b_1',
                content: { kn: ['ಪಠ್ಯ'], en: ['Some text'] },
                images: [{ src: 'test.jpg', caption: { en: 'Test', kn: 'ಪರೀಕ್ಷೆ' } }],
            })],
        }];

        renderChat(data, container, 'all');

        const row = document.getElementById('a_997_b_1');
        const mediaCol = row.querySelector('.col-media');
        expect(mediaCol.classList.contains('has-images')).toBe(true);
    });

    // A block with only a video (no image) should NOT get has-images —
    // its visibility should stay tied to the Videos toggle as normal.
    test('does not mark the media column as has-images when there is only a video', () => {
        const data = [{
            id: 'a_996',
            type: 'answer',
            timestamp: '2026-07-12T00:00:00Z',
            references: null,
            blocks: [baseBlock({
                id: 'a_996_b_1',
                content: { kn: ['ಪಠ್ಯ'], en: ['Some text'] },
                videos: [{ url: 'https://www.youtube.com/watch?v=abc123', youtubeId: 'abc123' }],
            })],
        }];

        renderChat(data, container, 'all');

        const row = document.getElementById('a_996_b_1');
        const mediaCol = row.querySelector('.col-media');
        expect(mediaCol.classList.contains('has-images')).toBe(false);
    });

    // Mixed-media regression: a block with BOTH a video and an image (e.g.
    // "video explains, photo shows the related temple mantra") should get
    // has-images (so the photo survives both toggles off) while the video
    // inside the same column still respects its own toggle independently.
    test('marks the media column as has-images for a block with both a video and an image', () => {
        const data = [{
            id: 'a_995',
            type: 'answer',
            timestamp: '2026-07-12T00:00:00Z',
            references: null,
            blocks: [baseBlock({
                id: 'a_995_b_1',
                content: { kn: ['ಪಠ್ಯ'], en: ['Some text'] },
                videos: [{ url: 'https://www.youtube.com/watch?v=abc123', youtubeId: 'abc123' }],
                images: [{ src: 'test.jpg', caption: { en: 'Test', kn: 'ಪರೀಕ್ಷೆ' } }],
            })],
        }];

        renderChat(data, container, 'all');

        const row = document.getElementById('a_995_b_1');
        const mediaCol = row.querySelector('.col-media');
        expect(mediaCol.classList.contains('has-images')).toBe(true);
        expect(row.classList.contains('media-only')).toBe(false); // has text, so not media-only
    });
});