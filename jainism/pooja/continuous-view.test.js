const {
    jumpToReference,
    goBackToMessage,
    filterContinuous,
    renderContinuousView,
} = require('./continuous-view');

// jsdom doesn't implement scrollIntoView.
Element.prototype.scrollIntoView = jest.fn();
window.scrollTo = jest.fn();

function baseBlock(overrides = {}) {
    return {
        id: 'a_999_b_1',
        type: 'answer',
        content: { kn: [], en: [] },
        images: [],
        videos: [],
        ...overrides,
    };
}

beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="continuous-container"></div><span id="read-progress"></span><button id="back-to-message" style="display:none"></button>';
    // backStack is module-private and only reset as a side effect of
    // renderContinuousView — reset it explicitly so jumpToReference/
    // goBackToMessage tests don't leak state into each other.
    renderContinuousView([], document.getElementById('continuous-container'));
});

describe('jumpToReference / goBackToMessage', () => {
    test('jumping to a missing target is a no-op', () => {
        expect(() => jumpToReference('nope')).not.toThrow();
        expect(document.getElementById('back-to-message').style.display).toBe('none');
    });

    test('jumping to an existing target shows Back and scrolls to it', () => {
        document.body.insertAdjacentHTML('beforeend', '<div id="q_001_b_1"></div>');
        jumpToReference('q_001_b_1');

        expect(document.getElementById('back-to-message').style.display).toBe('block');
        expect(document.getElementById('q_001_b_1').classList.contains('jump-highlight')).toBe(true);
    });

    test('going back hides Back to Message once the stack is empty', () => {
        document.body.insertAdjacentHTML('beforeend', '<div id="q_001_b_1"></div>');
        jumpToReference('q_001_b_1');
        goBackToMessage();
        expect(document.getElementById('back-to-message').style.display).toBe('none');
    });
});

describe('filterContinuous', () => {
    test('hides cards whose text does not match the query, case-insensitively', () => {
        document.getElementById('continuous-container').innerHTML =
            '<div class="card">Abhisheka details</div><div class="card">Daana giving</div>';

        filterContinuous('daana');

        const cards = document.querySelectorAll('#continuous-container .card');
        expect(cards[0].style.display).toBe('none');
        expect(cards[1].style.display).toBe('');
    });

    test('an empty query shows every card', () => {
        document.getElementById('continuous-container').innerHTML =
            '<div class="card">A</div><div class="card">B</div>';
        filterContinuous('');
        document.querySelectorAll('#continuous-container .card').forEach(c => {
            expect(c.style.display).toBe('');
        });
    });
});

describe('renderContinuousView', () => {
    let container;
    beforeEach(() => { container = document.getElementById('continuous-container'); });

    test('renders one card per item, id set to the item id', () => {
        const data = [
            { id: 'q_001', type: 'question', references: null, blocks: [baseBlock({ id: 'q_001_b_1', content: { kn: ['ಪ್ರಶ್ನೆ'], en: ['Question'] } })] },
        ];
        renderContinuousView(data, container);
        expect(document.getElementById('q_001')).not.toBeNull();
        expect(document.querySelectorAll('#continuous-container .card').length).toBe(1);
    });

    test.each([
        ['kn', true, false],
        ['en', false, true],
        ['all', true, true],
    ])('lang="%s" shows kn=%s / en=%s', (lang, showsKn, showsEn) => {
        const data = [
            { id: 'q_001', type: 'question', references: null, blocks: [baseBlock({ id: 'q_001_b_1', content: { kn: ['ಪ್ರಶ್ನೆ'], en: ['Question'] } })] },
        ];
        renderContinuousView(data, container, lang);
        const row = document.getElementById('q_001_b_1');
        expect(row.querySelector('.col-kn') !== null).toBe(showsKn);
        expect(row.querySelector('.col-en') !== null).toBe(showsEn);
    });

    test('renders a reply-excerpt for items with references, resolving to the source block text', () => {
        const referenced = { id: 'q_010', type: 'question', references: null, blocks: [baseBlock({ id: 'q_010_b_1', content: { kn: ['ಪ್ರ'], en: ['Q text'] } })] };
        const followUp = { id: 'a_010', type: 'answer', references: ['q_010_b_1'], blocks: [baseBlock({ id: 'a_010_b_1', content: { kn: ['ಉ'], en: ['A text'] } })] };
        renderContinuousView([referenced, followUp], container, 'all');

        const excerpt = document.getElementById('a_010').querySelector('.reply-excerpt.multi-block');
        expect(excerpt).not.toBeNull();
        expect(excerpt.textContent).toContain('Q text');
    });

    test('marks a row read and updates the progress counter when the read-tick is clicked', () => {
        const data = [{ id: 'q_020', type: 'question', references: null, blocks: [baseBlock({ id: 'q_020_b_1', content: { kn: ['ಪ'], en: ['Text'] } })] }];
        renderContinuousView(data, container, 'all');

        document.getElementById('q_020_b_1').querySelector('.read-tick').click();

        expect(document.getElementById('q_020_b_1').classList.contains('read')).toBe(true);
        expect(document.getElementById('read-progress').textContent).toBe('✓ 1/1 read');
    });

    test('a block with no text content is marked media-only', () => {
        const data = [{ id: 'i_001', type: 'images', references: null, blocks: [baseBlock({ id: 'i_001_b_1', content: { kn: [], en: [] }, images: [{ src: 'x.jpg', caption: {} }] })] }];
        renderContinuousView(data, container, 'all');
        expect(document.getElementById('i_001_b_1').classList.contains('media-only')).toBe(true);
    });

    // A standalone image has nothing to "read" (per read-tracking.js's
    // isBlockTrackable) — no tick, and it shouldn't inflate the denominator
    // of the read-progress counter either.
    test('a standalone image block (no text, no video) gets no read-tick and is excluded from the progress count', () => {
        const data = [{ id: 'i_002', type: 'images', references: null, blocks: [baseBlock({ id: 'i_002_b_1', content: { kn: [], en: [] }, images: [{ src: 'x.jpg', caption: {} }] })] }];
        renderContinuousView(data, container, 'all');

        expect(document.getElementById('i_002_b_1').querySelector('.read-tick')).toBeNull();
        expect(document.getElementById('read-progress').textContent).toBe('✓ 0/0 read');
    });

    // A video can run long, so watching it is worth tracking even with no
    // accompanying text — unlike a plain standalone image.
    test('a video-only block (no text) still gets a read-tick and counts toward progress', () => {
        const data = [{ id: 'v_001', type: 'answer', references: null, blocks: [baseBlock({ id: 'v_001_b_1', content: { kn: [], en: [] }, videos: [{ url: 'https://www.youtube.com/watch?v=abc12345678' }] })] }];
        renderContinuousView(data, container, 'all');

        const tick = document.getElementById('v_001_b_1').querySelector('.read-tick');
        expect(tick).not.toBeNull();
        expect(document.getElementById('read-progress').textContent).toBe('✓ 0/1 read');

        tick.click();
        expect(document.getElementById('v_001_b_1').classList.contains('read')).toBe(true);
        expect(document.getElementById('read-progress').textContent).toBe('✓ 1/1 read');
    });

    // A mix of trackable and non-trackable blocks in one render: the
    // progress denominator should count only the trackable ones.
    test('progress total only counts trackable blocks when standalone images are mixed in', () => {
        const data = [{
            id: 'mix_001', type: 'answer', references: null,
            blocks: [
                baseBlock({ id: 'mix_001_b_1', content: { kn: ['ಪ'], en: ['Text'] } }), // trackable (text)
                baseBlock({ id: 'mix_001_b_2', type: 'images', content: { kn: [], en: [] }, images: [{ src: 'x.jpg', caption: {} }] }), // not trackable
            ],
        }];
        renderContinuousView(data, container, 'all');
        expect(document.getElementById('read-progress').textContent).toBe('✓ 0/1 read');
    });

    test('re-rendering clears the container instead of appending to previous content', () => {
        const data = [{ id: 'q_030', type: 'question', references: null, blocks: [baseBlock({ id: 'q_030_b_1' })] }];
        renderContinuousView(data, container, 'all');
        renderContinuousView(data, container, 'all');
        expect(document.querySelectorAll('#continuous-container .card').length).toBe(1);
    });
});

describe('renderContinuousView against the real test/data.json fixture', () => {
    const fixtureData = require('./test/data.json');

    test('renders without throwing and resolves a_001\'s reference to q_001', () => {
        const container = document.getElementById('continuous-container');
        expect(() => renderContinuousView(fixtureData, container, 'all')).not.toThrow();
        expect(document.getElementById('a_001').querySelector('.reply-excerpt')).not.toBeNull();
    });
});
