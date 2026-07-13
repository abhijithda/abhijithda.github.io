const { updateMediaVisibility, renderChat, resolveReference, jumpToReference, goBackToMessage, toggleRead, getReadItems, updateReadProgress } = require('./script');

// jsdom doesn't implement scrollIntoView — stub it so jumpToReference's
// call doesn't log noisy "not implemented" warnings during tests.
Element.prototype.scrollIntoView = jest.fn();
window.scrollTo = jest.fn();

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

describe('resolveReference', () => {
    const blockById = {
        'q_001_b_1': { id: 'q_001_b_1', type: 'paragraph', content: { kn: ['ಪ್ರಶ್ನೆ'], en: ['Question'] } },
    };
    const itemById = {
        'q_001': {
            id: 'q_001',
            blocks: [blockById['q_001_b_1']],
        },
    };

    test('resolves a block-level reference id directly', () => {
        const result = resolveReference('q_001_b_1', blockById, itemById);
        expect(result).toBe(blockById['q_001_b_1']);
    });

    test('resolves an item-level reference id to that item\'s first block', () => {
        const result = resolveReference('q_001', blockById, itemById);
        expect(result).toBe(blockById['q_001_b_1']);
    });

    test('returns null for a dangling reference instead of throwing', () => {
        const result = resolveReference('does_not_exist', blockById, itemById);
        expect(result).toBeNull();
    });
});

describe('renderChat: reply-excerpt', () => {
    let container;

    beforeEach(() => {
        document.body.innerHTML = '<div id="chat-container"></div><button id="back-to-message" style="display:none;"></button>';
        container = document.getElementById('chat-container');
    });

    const referencedItem = {
        id: 'q_010',
        type: 'question',
        timestamp: '2026-07-12T00:00:00Z',
        references: null,
        blocks: [{
            id: 'q_010_b_1',
            type: 'paragraph',
            content: { kn: ['ಪ್ರಶ್ನೆ ಪಠ್ಯ'], en: ['Question text'] },
            tags: [], videos: [], images: [],
        }],
    };

    // Regression test for: the reply-excerpt feature (WhatsApp-style
    // "replying to" preview) existed in an earlier version of this site,
    // was lost across branch merges, and had to be rebuilt. This asserts
    // it's actually wired up, not just styled in CSS with nothing to
    // generate it.
    test('renders a reply-excerpt when an item has references', () => {
        const followUp = {
            id: 'a_010',
            type: 'answer',
            timestamp: '2026-07-12T01:00:00Z',
            references: ['q_010_b_1'],
            blocks: [{
                id: 'a_010_b_1',
                type: 'paragraph',
                content: { kn: ['ಉತ್ತರ'], en: ['Answer'] },
                tags: [], videos: [], images: [],
            }],
        };

        renderChat([referencedItem, followUp], container, 'all');

        const card = document.getElementById('a_010');
        const excerpt = card.querySelector('.reply-excerpt.multi-block');
        expect(excerpt).not.toBeNull();
        expect(excerpt.querySelectorAll('.excerpt-row').length).toBe(1);
        expect(excerpt.textContent).toContain('Question text');
    });

    test('resolves an item-level reference (not just block-level) in the excerpt', () => {
        const followUp = {
            id: 'a_011',
            type: 'answer',
            timestamp: '2026-07-12T01:00:00Z',
            references: ['q_010'], // item-level, not 'q_010_b_1'
            blocks: [{
                id: 'a_011_b_1',
                type: 'paragraph',
                content: { kn: ['ಉತ್ತರ'], en: ['Answer'] },
                tags: [], videos: [], images: [],
            }],
        };

        renderChat([referencedItem, followUp], container, 'all');

        const excerpt = document.getElementById('a_011').querySelector('.reply-excerpt.multi-block');
        expect(excerpt.querySelectorAll('.excerpt-row').length).toBe(1);
        expect(excerpt.textContent).toContain('Question text');
    });

    test('shows one excerpt-row per reference when an item references multiple things', () => {
        const secondSource = {
            id: 'a_012',
            type: 'answer',
            timestamp: '2026-07-12T00:30:00Z',
            references: null,
            blocks: [{
                id: 'a_012_b_1',
                type: 'paragraph',
                content: { kn: ['ಎರಡನೇ ಉತ್ತರ'], en: ['Second answer'] },
                tags: [], videos: [], images: [],
            }],
        };
        const followUp = {
            id: 'a_013',
            type: 'answer',
            timestamp: '2026-07-12T02:00:00Z',
            references: ['q_010_b_1', 'a_012_b_1'],
            blocks: [{
                id: 'a_013_b_1',
                type: 'paragraph',
                content: { kn: ['ಮತ್ತಷ್ಟು ವಿವರ'], en: ['More detail'] },
                tags: [], videos: [], images: [],
            }],
        };

        renderChat([referencedItem, secondSource, followUp], container, 'all');

        const excerpt = document.getElementById('a_013').querySelector('.reply-excerpt.multi-block');
        expect(excerpt.querySelectorAll('.excerpt-row').length).toBe(2);
    });

    test('does not render a reply-excerpt when an item has no references', () => {
        renderChat([referencedItem], container, 'all');
        const card = document.getElementById('q_010');
        expect(card.querySelector('.reply-excerpt')).toBeNull();
    });

    test('a dangling reference is skipped rather than breaking the render', () => {
        const followUp = {
            id: 'a_014',
            type: 'answer',
            timestamp: '2026-07-12T02:00:00Z',
            references: ['does_not_exist'],
            blocks: [{
                id: 'a_014_b_1',
                type: 'paragraph',
                content: { kn: ['ಉತ್ತರ'], en: ['Answer'] },
                tags: [], videos: [], images: [],
            }],
        };

        expect(() => renderChat([followUp], container, 'all')).not.toThrow();
        // No valid references resolved, so no excerpt container should be added.
        expect(document.getElementById('a_014').querySelector('.reply-excerpt')).toBeNull();
    });

    test('clicking an excerpt\'s block-id jumps to the source and shows the Back button', () => {
        const followUp = {
            id: 'a_015',
            type: 'answer',
            timestamp: '2026-07-12T02:00:00Z',
            references: ['q_010_b_1'],
            blocks: [{
                id: 'a_015_b_1',
                type: 'paragraph',
                content: { kn: ['ಉತ್ತರ'], en: ['Answer'] },
                tags: [], videos: [], images: [],
            }],
        };

        renderChat([referencedItem, followUp], container, 'all');

        const backBtn = document.getElementById('back-to-message');
        expect(backBtn.style.display).toBe('none');

        const idLabel = document.getElementById('a_015').querySelector('.excerpt-row .block-id');
        idLabel.click();

        expect(backBtn.style.display).toBe('block');
        expect(document.getElementById('q_010_b_1').classList.contains('jump-highlight')).toBe(true);
    });

    test('clicking an excerpt\'s content toggles the expanded state', () => {
        const followUp = {
            id: 'a_016',
            type: 'answer',
            timestamp: '2026-07-12T02:00:00Z',
            references: ['q_010_b_1'],
            blocks: [{
                id: 'a_016_b_1',
                type: 'paragraph',
                content: { kn: ['ಉತ್ತರ'], en: ['Answer'] },
                tags: [], videos: [], images: [],
            }],
        };

        renderChat([referencedItem, followUp], container, 'all');

        const excerptRow = document.getElementById('a_016').querySelector('.excerpt-row');
        const contentWrap = excerptRow.querySelector('.excerpt-content-wrap');

        expect(excerptRow.classList.contains('expanded')).toBe(false);
        contentWrap.click();
        expect(excerptRow.classList.contains('expanded')).toBe(true);
        contentWrap.click();
        expect(excerptRow.classList.contains('expanded')).toBe(false);
    });
});

describe('Read tracking', () => {
    let container;

    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '<div id="chat-container"></div><span id="read-progress"></span>';
        container = document.getElementById('chat-container');
    });

    const sampleItem = {
        id: 'q_020',
        type: 'question',
        timestamp: '2026-07-12T00:00:00Z',
        references: null,
        blocks: [{
            id: 'q_020_b_1',
            type: 'paragraph',
            content: { kn: ['ಪಠ್ಯ'], en: ['Text'] },
            tags: [], videos: [], images: [],
        }],
    };

    test('a freshly rendered card is not marked read and shows a "Mark read" button', () => {
        renderChat([sampleItem], container, 'all');
        const card = document.getElementById('q_020');
        expect(card.classList.contains('read')).toBe(false);
        expect(card.querySelector('.read-toggle').textContent).toBe('Mark read');
    });

    test('clicking the read-toggle marks the card as read and updates the progress counter', () => {
        renderChat([sampleItem], container, 'all');
        const card = document.getElementById('q_020');

        card.querySelector('.read-toggle').click();

        expect(card.classList.contains('read')).toBe(true);
        expect(document.getElementById('read-progress').textContent).toBe('✓ 1/1 read');
    });

    test('clicking the read-toggle again un-marks it as read', () => {
        renderChat([sampleItem], container, 'all');
        const card = document.getElementById('q_020');
        const toggle = card.querySelector('.read-toggle');

        toggle.click();
        toggle.click();

        expect(card.classList.contains('read')).toBe(false);
        expect(document.getElementById('read-progress').textContent).toBe('✓ 0/1 read');
    });

    test('read state persists in localStorage across a re-render', () => {
        renderChat([sampleItem], container, 'all');
        document.getElementById('q_020').querySelector('.read-toggle').click();

        // Re-render (e.g. after a language change) — the card should come
        // back already marked as read, not reset.
        renderChat([sampleItem], container, 'all');
        const card = document.getElementById('q_020');

        expect(card.classList.contains('read')).toBe(true);
        expect(card.querySelector('.read-toggle').textContent).toBe('✓ Read');
    });
});