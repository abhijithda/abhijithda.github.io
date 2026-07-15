const { updateMediaVisibility, renderChat, resolveReference, jumpToReference, goBackToMessage, toggleBlockRead, getReadBlocks, updateReadProgress } = require('./script');

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

    // Regression test for a real bug: content.kn/en holding only an empty
    // string (e.g. [""], as opposed to a fully empty array []) was still
    // counted as "has text" by a naive .length > 0 check, so the image
    // silently fell back to the small beside-text treatment instead of the
    // large one — in both the on-screen layout and print.
    test('treats an array containing only an empty/whitespace string as having no text (media-only)', () => {
        const data = [{
            id: 'i_999',
            type: 'images',
            timestamp: '2026-07-12T00:00:00Z',
            references: null,
            blocks: [baseBlock({
                id: 'i_999_b_1',
                type: 'images',
                content: { kn: [''], en: ['   '] }, // empty / whitespace-only, not actually empty arrays
                images: [{ src: 'test.jpg', caption: { en: 'Test', kn: 'ಪರೀಕ್ಷೆ' } }],
            })],
        }];

        renderChat(data, container, 'all');

        const row = document.getElementById('i_999_b_1');
        expect(row.classList.contains('media-only')).toBe(true);
        // Also shouldn't create blank kn/en columns alongside the image.
        expect(row.querySelector('.col-kn')).toBeNull();
        expect(row.querySelector('.col-en')).toBeNull();
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

    // Regression test for a real bug: the excerpt used to always render
    // both languages regardless of the selected lang filter, unlike every
    // other block on the page. Switching to 'kn' should hide the English
    // column in the excerpt too, not just in the main content.
    test('respects the selected language filter, same as regular blocks', () => {
        const followUp = {
            id: 'a_017',
            type: 'answer',
            timestamp: '2026-07-12T01:00:00Z',
            references: ['q_010_b_1'],
            blocks: [{
                id: 'a_017_b_1',
                type: 'paragraph',
                content: { kn: ['ಉತ್ತರ'], en: ['Answer'] },
                tags: [], videos: [], images: [],
            }],
        };

        renderChat([referencedItem, followUp], container, 'kn');

        const excerpt = document.getElementById('a_017').querySelector('.reply-excerpt');
        expect(excerpt.querySelector('.col-kn')).not.toBeNull();
        expect(excerpt.querySelector('.col-en')).toBeNull();
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

    // Partial-failure case: not every reference is dangling, so the valid
    // ones should still render — a single bad id in a list shouldn't take
    // down the whole excerpt, only that one entry.
    test('when some references are dangling and others are valid, only the valid ones render', () => {
        const followUp = {
            id: 'a_018',
            type: 'answer',
            timestamp: '2026-07-12T02:00:00Z',
            references: ['q_010_b_1', 'does_not_exist', 'also_missing'],
            blocks: [{
                id: 'a_018_b_1',
                type: 'paragraph',
                content: { kn: ['ಉತ್ತರ'], en: ['Answer'] },
                tags: [], videos: [], images: [],
            }],
        };

        renderChat([referencedItem, followUp], container, 'all');

        const excerpt = document.getElementById('a_018').querySelector('.reply-excerpt');
        expect(excerpt).not.toBeNull();
        expect(excerpt.querySelectorAll('.excerpt-row').length).toBe(1);
        expect(excerpt.textContent).toContain('Question text');
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

    test('a freshly rendered block is not marked read and has an unchecked slider', () => {
        renderChat([sampleItem], container, 'all');
        const row = document.getElementById('q_020_b_1');
        expect(row.classList.contains('read')).toBe(false);
        expect(row.querySelector('.read-switch input').checked).toBe(false);
    });

    test('toggling the slider marks the block as read and updates the progress counter', () => {
        renderChat([sampleItem], container, 'all');
        const row = document.getElementById('q_020_b_1');
        const checkbox = row.querySelector('.read-switch input');

        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));

        expect(row.classList.contains('read')).toBe(true);
        expect(document.getElementById('read-progress').textContent).toBe('✓ 1/1 read');
    });

    test('toggling the slider off again un-marks the block as read', () => {
        renderChat([sampleItem], container, 'all');
        const row = document.getElementById('q_020_b_1');
        const checkbox = row.querySelector('.read-switch input');

        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change'));

        expect(row.classList.contains('read')).toBe(false);
        expect(document.getElementById('read-progress').textContent).toBe('✓ 0/1 read');
    });

    test('read state persists in localStorage across a re-render', () => {
        renderChat([sampleItem], container, 'all');
        const checkbox = document.getElementById('q_020_b_1').querySelector('.read-switch input');
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));

        // Re-render (e.g. after a language change) — the block should come
        // back already marked as read, not reset.
        renderChat([sampleItem], container, 'all');
        const row = document.getElementById('q_020_b_1');

        expect(row.classList.contains('read')).toBe(true);
        expect(row.querySelector('.read-switch input').checked).toBe(true);
    });

    test('a multi-block answer only counts the specific block marked read, not the whole item', () => {
        const multiBlockItem = {
            id: 'a_021',
            type: 'answer',
            timestamp: '2026-07-12T00:00:00Z',
            references: null,
            blocks: [
                { id: 'a_021_b_1', type: 'paragraph', content: { kn: ['ಒಂದು'], en: ['One'] }, tags: [], videos: [], images: [] },
                { id: 'a_021_b_2', type: 'paragraph', content: { kn: ['ಎರಡು'], en: ['Two'] }, tags: [], videos: [], images: [] },
            ],
        };
        renderChat([multiBlockItem], container, 'all');

        document.getElementById('a_021_b_1').querySelector('.read-switch input').checked = true;
        document.getElementById('a_021_b_1').querySelector('.read-switch input').dispatchEvent(new Event('change'));

        expect(document.getElementById('a_021_b_1').classList.contains('read')).toBe(true);
        expect(document.getElementById('a_021_b_2').classList.contains('read')).toBe(false);
        expect(document.getElementById('read-progress').textContent).toBe('✓ 1/2 read');
    });
});

describe('renderChat: reply-excerpt against the real test/data.json fixture', () => {
    // These tests load the actual fixture file, not a hand-written mock
    // object — so a broken reference id introduced directly into
    // test/data.json (a typo'd id, a renamed block, etc.) gets caught here
    // even if every synthetic-mock test above still passes.
    const fixtureData = require('./test/data.json');
    let container;

    beforeEach(() => {
        document.body.innerHTML = '<div id="chat-container"></div><button id="back-to-message" style="display:none;"></button>';
        container = document.getElementById('chat-container');
    });

    test('a_001 (real fixture) shows the expected excerpt of its real reference, q_001', () => {
        renderChat(fixtureData, container, 'all');

        const excerpt = document.getElementById('a_001').querySelector('.reply-excerpt.multi-block');
        expect(excerpt).not.toBeNull();
        expect(excerpt.querySelectorAll('.excerpt-row').length).toBe(1);
        // Exact real text from test/data.json — not a paraphrase — so a
        // future edit to that content is a deliberate, visible test change,
        // not a silent drift.
        expect(excerpt.textContent).toContain('All are equal (Devatas =?= Jinendra deva)?');
    });

    test('a_002 (real fixture) shows the expected excerpt of its real reference, q_002', () => {
        renderChat(fixtureData, container, 'all');

        const excerpt = document.getElementById('a_002').querySelector('.reply-excerpt.multi-block');
        expect(excerpt).not.toBeNull();
        expect(excerpt.querySelectorAll('.excerpt-row').length).toBe(1);
        expect(excerpt.textContent).toContain('Samyaktva Malinatha');
    });

    test('fixture items with references: null render no excerpt at all', () => {
        renderChat(fixtureData, container, 'all');

        // i_001, q_001, q_002, a_003, a_004 all have references: null in
        // the fixture — none of them should get a reply-excerpt.
        ['i_001', 'q_001', 'q_002', 'a_003', 'a_004'].forEach(id => {
            expect(document.getElementById(id).querySelector('.reply-excerpt')).toBeNull();
        });
    });

    test('every reference in the real fixture resolves to a real block (no silent dangling refs)', () => {
        const blockIds = new Set();
        fixtureData.forEach(item => item.blocks.forEach(b => blockIds.add(b.id)));
        const itemIds = new Set(fixtureData.map(item => item.id));

        fixtureData.forEach(item => {
            (item.references || []).forEach(refId => {
                const resolvable = blockIds.has(refId) || itemIds.has(refId);
                expect(resolvable).toBe(true);
            });
        });
    });
});
