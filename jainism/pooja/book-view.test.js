const {
    KNOWN_LANGS,
    initBookView,
    renderCurrentSpread,
    goToPrevSpread,
    goToNextSpread,
    jumpToPage,
    applyBookMediaVisibility,
    onBookLangChange,
} = require('./book-view');

// jsdom does not compute real layout — clientWidth/scrollWidth are always 0
// unless we stub them. The pagination math in book-view.js depends entirely
// on these two numbers, so every test that exercises navigation defines them
// explicitly rather than relying on (unavailable) real layout.
function mockSpreadLayout({ spreadWidth = 800, columnsScrollWidth = 800 } = {}) {
    const spread = document.getElementById('book-spread');
    const columns = document.getElementById('book-columns');
    Object.defineProperty(spread, 'clientWidth', { value: spreadWidth, configurable: true });
    Object.defineProperty(columns, 'scrollWidth', { value: columnsScrollWidth, configurable: true });
}

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

beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="book-container"></div><span id="read-progress"></span>';
});

describe('KNOWN_LANGS', () => {
    test('includes Kannada and English as the two shipped languages', () => {
        const codes = KNOWN_LANGS.map(l => l.code);
        expect(codes).toEqual(['kn', 'en']);
    });
});

describe('initBookView: rendering', () => {
    test('renders one book-card per block, id-prefixed with "book-"', () => {
        const data = [{
            id: 'a_001',
            type: 'answer',
            references: null,
            blocks: [
                baseBlock({ id: 'a_001_b_1', content: { kn: ['ಒಂದು'], en: ['One'] } }),
                baseBlock({ id: 'a_001_b_2', content: { kn: ['ಎರಡು'], en: ['Two'] } }),
            ],
        }];

        initBookView(data, ['kn', 'en']);

        expect(document.getElementById('book-a_001_b_1')).not.toBeNull();
        expect(document.getElementById('book-a_001_b_2')).not.toBeNull();
        expect(document.querySelectorAll('#book-columns .book-card').length).toBe(2);
    });

    // Per REQUIREMENTS.md "Image pages": a standalone image item (card-level
    // type 'images') must get its own dedicated page/card, distinct from an
    // ordinary text card, so book-view.css can center it and fill the page.
    test('a standalone "images" item renders as a single centered standalone-image card', () => {
        const data = [{
            id: 'i_001',
            type: 'images',
            references: null,
            blocks: [baseBlock({
                id: 'i_001_b_1',
                type: 'images',
                images: [{ src: 'test.jpg', caption: { en: 'Caption EN', kn: 'ಶೀರ್ಷಿಕೆ' } }],
            })],
        }];

        initBookView(data, ['kn', 'en']);

        const card = document.getElementById('book-i_001');
        expect(card).not.toBeNull();
        expect(card.classList.contains('standalone-image')).toBe(true);
        // Only one card should exist for the item — not one per language, etc.
        expect(document.querySelectorAll('#book-columns .book-card').length).toBe(1);
    });

    test('a standalone image item with no image data is skipped rather than rendering an empty card', () => {
        const data = [{
            id: 'i_002',
            type: 'images',
            references: null,
            blocks: [baseBlock({ id: 'i_002_b_1', type: 'images', images: [] })],
        }];

        expect(() => initBookView(data, ['kn', 'en'])).not.toThrow();
        expect(document.getElementById('book-i_002')).toBeNull();
        expect(document.querySelectorAll('#book-columns .book-card').length).toBe(0);
    });

    // Regression coverage for the "some images have only Kannada captions"
    // complaint in REQUIREMENTS.md: a standalone image's caption must render
    // for every active language that actually has caption text — no blank
    // English caption line, and no dropped Kannada one.
    test('standalone image caption renders once per active language that has text, skips languages without one', () => {
        const data = [{
            id: 'i_003',
            type: 'images',
            references: null,
            blocks: [baseBlock({
                id: 'i_003_b_1',
                type: 'images',
                images: [{ src: 'test.jpg', caption: { kn: 'ಕನ್ನಡ ಶೀರ್ಷಿಕೆ' } }], // en missing
            })],
        }];

        initBookView(data, ['kn', 'en']);

        const wrap = document.getElementById('book-i_003').querySelector('.book-image-wrap');
        expect(wrap.querySelectorAll('.book-image-caption').length).toBe(1);
        expect(wrap.querySelector('.book-image-caption.lang-kn')).not.toBeNull();
        expect(wrap.querySelector('.book-image-caption.lang-en')).toBeNull();
    });

    // Only lines with real text should render — an active lang whose content
    // is an empty array (or only blank strings) should not leave a stray
    // empty .book-lang-line / separator in the card.
    test('only languages with non-blank content render a book-lang-line', () => {
        const data = [{
            id: 'a_002',
            type: 'answer',
            references: null,
            blocks: [baseBlock({
                id: 'a_002_b_1',
                content: { kn: ['ಪಠ್ಯ'], en: [''] }, // en present but blank
            })],
        }];

        initBookView(data, ['kn', 'en']);

        const card = document.getElementById('book-a_002_b_1');
        expect(card.querySelectorAll('.book-lang-line').length).toBe(1);
        expect(card.querySelector('.book-lang-line.lang-kn')).not.toBeNull();
        expect(card.querySelector('.book-lang-line.lang-en')).toBeNull();
    });

    // Per AI.md's card-type-colour table, a block whose own type differs from
    // its parent item's type (e.g. a shloka block inside an answer item)
    // must carry BOTH classes so card-types.css can colour it correctly.
    test('card className includes both item.type and block.type when they differ', () => {
        const data = [{
            id: 'a_003',
            type: 'answer',
            references: null,
            blocks: [baseBlock({ id: 'a_003_b_1', type: 'shloka' })],
        }];

        initBookView(data, ['kn', 'en']);

        const card = document.getElementById('book-a_003_b_1');
        expect(card.classList.contains('answer')).toBe(true);
        expect(card.classList.contains('shloka')).toBe(true);
    });

    test('card className does not duplicate the type when block.type matches item.type', () => {
        const data = [{
            id: 'q_001',
            type: 'question',
            references: null,
            blocks: [baseBlock({ id: 'q_001_b_1', type: 'question' })],
        }];

        initBookView(data, ['kn', 'en']);

        const card = document.getElementById('book-q_001_b_1');
        expect(card.className).toBe('book-card question');
    });
});

describe('initBookView: reply-excerpt (book-excerpt)', () => {
    const referencedItem = {
        id: 'q_010',
        type: 'question',
        references: null,
        blocks: [baseBlock({ id: 'q_010_b_1', content: { kn: ['ಪ್ರಶ್ನೆ'], en: ['Question text'] } })],
    };

    test('renders a book-excerpt strip on the first block when the item has references', () => {
        const followUp = {
            id: 'a_010',
            type: 'answer',
            references: ['q_010_b_1'],
            blocks: [baseBlock({ id: 'a_010_b_1', content: { kn: ['ಉತ್ತರ'], en: ['Answer'] } })],
        };

        initBookView([referencedItem, followUp], ['kn', 'en']);

        // The excerpt preview uses the first active language (kn here) —
        // see createBookCard's `refBlock.content?.[activeLangs[0]]`.
        const excerpt = document.getElementById('book-a_010_b_1').querySelector('.book-excerpt');
        expect(excerpt).not.toBeNull();
        expect(excerpt.textContent).toContain('ಪ್ರಶ್ನೆ');
    });

    test('does not render a book-excerpt when the item has no references', () => {
        initBookView([referencedItem], ['kn', 'en']);
        expect(document.getElementById('book-q_010_b_1').querySelector('.book-excerpt')).toBeNull();
    });

    test('a dangling reference is skipped rather than breaking the render', () => {
        const followUp = {
            id: 'a_011',
            type: 'answer',
            references: ['does_not_exist'],
            blocks: [baseBlock({ id: 'a_011_b_1', content: { kn: ['ಉತ್ತರ'], en: ['Answer'] } })],
        };

        expect(() => initBookView([followUp], ['kn', 'en'])).not.toThrow();
        expect(document.getElementById('book-a_011_b_1').querySelector('.book-excerpt')).toBeNull();
    });
});

describe('initBookView: read tracking', () => {
    const item = {
        id: 'q_020',
        type: 'question',
        references: null,
        blocks: [baseBlock({ id: 'q_020_b_1', content: { kn: ['ಪಠ್ಯ'], en: ['Text'] } })],
    };

    test('a freshly rendered card has an unchecked tick', () => {
        initBookView([item], ['kn', 'en']);
        const tick = document.getElementById('book-q_020_b_1').querySelector('.read-tick');
        expect(tick.classList.contains('read')).toBe(false);
        expect(tick.textContent).toBe('');
    });

    test('clicking the tick marks the block read and updates the progress counter', () => {
        initBookView([item], ['kn', 'en']);
        document.getElementById('book-q_020_b_1').querySelector('.read-tick').click();

        expect(document.getElementById('read-progress').textContent).toBe('✓ 1/1 read');
    });

    test('clicking the tick again un-marks it and decrements the counter', () => {
        initBookView([item], ['kn', 'en']);
        const tick = document.getElementById('book-q_020_b_1').querySelector('.read-tick');

        tick.click();
        tick.click();

        expect(tick.classList.contains('read')).toBe(false);
        expect(document.getElementById('read-progress').textContent).toBe('✓ 0/1 read');
    });

    // Read state is shared storage (readBlocks key) with continuous view —
    // re-initialising book view (e.g. after a lang change) must pick the
    // already-read block back up rather than resetting it.
    test('read state persists in localStorage across a re-init', () => {
        initBookView([item], ['kn', 'en']);
        document.getElementById('book-q_020_b_1').querySelector('.read-tick').click();

        initBookView([item], ['kn', 'en']);

        // Only the tick carries a 'read' class in book view (unlike
        // continuous view's row); the persisted state is reflected there.
        const tick = document.getElementById('book-q_020_b_1').querySelector('.read-tick');
        expect(tick.classList.contains('read')).toBe(true);
        expect(tick.textContent).toBe('✓');
    });
});

describe('Navigation: goToPrevSpread / goToNextSpread', () => {
    const twoSpreadData = [{
        id: 'a_100',
        type: 'answer',
        references: null,
        blocks: [baseBlock({ id: 'a_100_b_1' })],
    }];

    beforeEach(() => {
        initBookView(twoSpreadData, ['kn', 'en']);
        // Two spreads' worth of column width so both Prev and Next have room to move.
        mockSpreadLayout({ spreadWidth: 800, columnsScrollWidth: 1600 });
        renderCurrentSpread();
    });

    test('starts on spread 0 (pages 1 & 2) with Prev disabled', () => {
        expect(document.getElementById('book-page-num-left').textContent).toBe('1');
        expect(document.getElementById('book-page-num-right').textContent).toBe('2');
        expect(document.getElementById('book-prev').disabled).toBe(true);
        expect(document.getElementById('book-next').disabled).toBe(false);
    });

    test('goToNextSpread advances the spread and page numbers, and persists it', () => {
        goToNextSpread();

        expect(document.getElementById('book-page-num-left').textContent).toBe('3');
        expect(document.getElementById('book-page-num-right').textContent).toBe('4');
        expect(document.getElementById('book-next').disabled).toBe(true);
        expect(localStorage.getItem('bookSpread')).toBe('1');
    });

    test('goToPrevSpread does not go below spread 0', () => {
        goToPrevSpread(); // already at 0
        expect(document.getElementById('book-page-num-left').textContent).toBe('1');
        expect(document.getElementById('book-prev').disabled).toBe(true);
    });

    test('goToNextSpread then goToPrevSpread returns to the first spread', () => {
        goToNextSpread();
        goToPrevSpread();
        expect(document.getElementById('book-page-num-left').textContent).toBe('1');
        expect(localStorage.getItem('bookSpread')).toBe('0');
    });
});

describe('Navigation: jumpToPage', () => {
    const data = [{
        id: 'a_101',
        type: 'answer',
        references: null,
        blocks: [baseBlock({ id: 'a_101_b_1' })],
    }];

    beforeEach(() => {
        initBookView(data, ['kn', 'en']);
        mockSpreadLayout({ spreadWidth: 800, columnsScrollWidth: 3200 }); // 4 spreads
        renderCurrentSpread();
    });

    test('jumping to page 1 lands on spread 0', () => {
        jumpToPage(1);
        expect(document.getElementById('book-page-num-left').textContent).toBe('1');
    });

    test('jumping to an even page lands on the spread that starts one page earlier (Acrobat-style)', () => {
        jumpToPage(4); // pages 3 & 4 -> spread 1
        expect(document.getElementById('book-page-num-left').textContent).toBe('3');
        expect(document.getElementById('book-page-num-right').textContent).toBe('4');
    });

    test('jumping to page 0 or a negative page clamps to the first spread instead of throwing', () => {
        expect(() => jumpToPage(0)).not.toThrow();
        expect(document.getElementById('book-page-num-left').textContent).toBe('1');

        expect(() => jumpToPage(-5)).not.toThrow();
        expect(document.getElementById('book-page-num-left').textContent).toBe('1');
    });

    test('jump input reflects the new page after jumping', () => {
        const jumpInput = document.getElementById('book-jump-input');
        jumpToPage(3);
        expect(jumpInput.value).toBe('3');
    });
});

describe('applyBookMediaVisibility', () => {
    const data = [{
        id: 'a_200',
        type: 'answer',
        references: null,
        blocks: [baseBlock({
            id: 'a_200_b_1',
            content: { kn: ['ಪಠ್ಯ'], en: ['Text'] },
            videos: [{ url: 'https://www.youtube.com/watch?v=abc12345678', youtubeId: 'abc12345678' }],
        })],
    }];

    beforeEach(() => {
        document.body.innerHTML =
            '<div id="book-container"></div>' +
            '<span id="read-progress"></span>' +
            '<input type="checkbox" id="toggle-videos">' +
            '<input type="checkbox" id="toggle-qrs">';
        initBookView(data, ['kn', 'en']);
    });

    test('hides the whole video row only when both Videos and QR are off', () => {
        document.getElementById('toggle-videos').checked = false;
        document.getElementById('toggle-qrs').checked = false;
        applyBookMediaVisibility();

        const row = document.querySelector('#book-container .book-vid-row');
        expect(row.style.display).toBe('none');
    });

    test('shows the thumbnail and hides the QR when only Videos is on (default)', () => {
        document.getElementById('toggle-videos').checked = true;
        document.getElementById('toggle-qrs').checked = false;
        applyBookMediaVisibility();

        expect(document.querySelector('#book-container .book-vid-row').style.display).toBe('flex');
        expect(document.querySelector('#book-container .book-vid-thumb').style.display).toBe('');
        expect(document.querySelector('#book-container .book-vid-qr').style.display).toBe('none');
    });

    test('shows only the QR when QR is on and Videos is off', () => {
        document.getElementById('toggle-videos').checked = false;
        document.getElementById('toggle-qrs').checked = true;
        applyBookMediaVisibility();

        expect(document.querySelector('#book-container .book-vid-thumb').style.display).toBe('none');
        expect(document.querySelector('#book-container .book-vid-qr').style.display).toBe('');
    });
});

describe('onBookLangChange', () => {
    test('re-populates cards using the newly selected languages only', () => {
        const data = [{
            id: 'a_300',
            type: 'answer',
            references: null,
            blocks: [baseBlock({ id: 'a_300_b_1', content: { kn: ['ಪಠ್ಯ'], en: ['Text'] } })],
        }];

        initBookView(data, ['kn', 'en']);
        onBookLangChange(['en']);

        const card = document.getElementById('book-a_300_b_1');
        expect(card.querySelector('.book-lang-line.lang-en')).not.toBeNull();
        expect(card.querySelector('.book-lang-line.lang-kn')).toBeNull();
    });
});

describe('initBookView against the real test/data.json fixture', () => {
    // Same intent as script.test.js's fixture-backed suite: catches a
    // broken reference id or malformed block introduced directly into
    // test/data.json, independent of the hand-written mocks above.
    const fixtureData = require('./test/data.json');

    test('renders one book-card (or standalone-image card) per item/block without throwing', () => {
        expect(() => initBookView(fixtureData, ['kn', 'en'])).not.toThrow();

        // i_001 is a standalone images item in the fixture.
        expect(document.getElementById('book-i_001').classList.contains('standalone-image')).toBe(true);
        // a_001 references q_001 in the fixture.
        expect(document.getElementById('book-a_001_b_1').querySelector('.book-excerpt')).not.toBeNull();
    });
});