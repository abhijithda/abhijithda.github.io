const {
    formatIdForDisplay, itemNumber, buildBlockIndex, resolveReference,
    hasLangText, langsWithText, hasAnyText, imageUrl, classifyInsert,
} = require('./blocks');

describe('formatIdForDisplay', () => {
    test('uses the id\'s own first letter for a normal block', () => {
        expect(formatIdForDisplay({ id: 'a_003_b_1', type: 'answer' })).toBe('A-3.1');
    });

    test('uses "S" for a shloka block regardless of id prefix', () => {
        expect(formatIdForDisplay({ id: 'a_003_b_2', type: 'shloka' })).toBe('S-3.2');
    });

    test('uses "N" for a note block regardless of id prefix', () => {
        expect(formatIdForDisplay({ id: 'q_004_b_1', type: 'note' })).toBe('N-4.1');
    });
});

describe('formatIdForDisplay with permanent ids', () => {
    const make = () => [
        { id: 'qa1', num: 3, type: 'question', blocks: [{ id: 'qb1', num: 1, type: 'paragraph' }] },
        { id: 'aa1', type: 'answer', references: ['qa1'], blocks: [
            { id: 'ab1', num: 1, type: 'paragraph' },
            { id: 'ab2', num: 2, type: 'shloka' },
            { id: 'ab3', num: 3, type: 'note' },
            { id: 'ab4', num: 4, type: 'images' },
            { id: 'ab5', num: 5, type: 'mantra' },
        ] },
    ];

    test('label = letter-itemNumber.blockNum; the answer takes its question\'s number', () => {
        const data = make();
        buildBlockIndex(data);
        expect(formatIdForDisplay(data[0].blocks[0])).toBe('Q-3.1');
        expect(data[1].blocks.map(formatIdForDisplay))
            .toEqual(['A-3.1', 'S-3.2', 'N-3.3', 'I-3.4', 'M-3.5']);
    });

    test('renumbering the question alone renumbers its answer; ids never change', () => {
        const data = make();
        const answerBlockId = data[1].blocks[0].id;
        data[0].num = 9;
        buildBlockIndex(data);
        expect(data[1].blocks[0].id).toBe(answerBlockId);
        expect(formatIdForDisplay(data[1].blocks[0])).toBe('A-9.1');
    });

    test('an answer with its own num (no question to follow) keeps it', () => {
        expect(itemNumber({ type: 'answer', num: 20, references: ['x'] }, {})).toBe(20);
    });

    test('an explicit num on an answer wins over the question\'s', () => {
        const itemById = { q: { type: 'question', num: 2 } };
        expect(itemNumber({ type: 'answer', num: 7, references: ['q'] }, itemById)).toBe(7);
    });

    test('an answer replying only to blocks, with no num, has no number', () => {
        expect(itemNumber({ type: 'answer', references: ['some_block'] }, {})).toBeUndefined();
    });
});

describe('buildBlockIndex', () => {
    const data = [
        { id: 'q_001', blocks: [{ id: 'q_001_b_1' }, { id: 'q_001_b_2' }] },
        { id: 'a_001', blocks: [{ id: 'a_001_b_1' }] },
    ];

    test('indexes every item by its id', () => {
        const { itemById } = buildBlockIndex(data);
        expect(itemById['q_001']).toBe(data[0]);
        expect(itemById['a_001']).toBe(data[1]);
    });

    test('indexes every block (across all items) by its id', () => {
        const { blockById } = buildBlockIndex(data);
        expect(blockById['q_001_b_1']).toBe(data[0].blocks[0]);
        expect(blockById['q_001_b_2']).toBe(data[0].blocks[1]);
        expect(blockById['a_001_b_1']).toBe(data[1].blocks[0]);
    });

    test('an empty dataset produces empty maps rather than throwing', () => {
        expect(buildBlockIndex([])).toEqual({ blockById: {}, itemById: {} });
    });
});

describe('resolveReference', () => {
    const blockById = { 'q_001_b_1': { id: 'q_001_b_1' } };
    const itemById = { 'q_002': { id: 'q_002', blocks: [{ id: 'q_002_b_1' }] } };

    test('resolves a direct block id', () => {
        expect(resolveReference('q_001_b_1', blockById, itemById)).toBe(blockById['q_001_b_1']);
    });

    test('falls back to an item id, resolving to its first block', () => {
        expect(resolveReference('q_002', blockById, itemById)).toBe(itemById['q_002'].blocks[0]);
    });

    test('returns null for an id that matches neither', () => {
        expect(resolveReference('does_not_exist', blockById, itemById)).toBeNull();
    });

    test('returns null for an item id whose item has no blocks', () => {
        const emptyItemById = { 'q_003': { id: 'q_003', blocks: [] } };
        expect(resolveReference('q_003', {}, emptyItemById)).toBeNull();
    });
});

describe('hasLangText / langsWithText / hasAnyText', () => {
    const block = { content: { kn: ['ಪಠ್ಯ'], en: ['  '] } };

    test('a language has text only if some line is non-blank', () => {
        expect(hasLangText(block, 'kn')).toBe(true);
        expect(hasLangText(block, 'en')).toBe(false);   // whitespace-only
        expect(hasLangText(block, 'fr')).toBe(false);   // language not on the block
    });

    test('missing content, or a null block, is simply "no text" — never a throw', () => {
        expect(hasLangText({}, 'kn')).toBe(false);
        expect(hasLangText(null, 'kn')).toBe(false);
        expect(hasLangText(undefined, 'kn')).toBe(false);
    });

    test('langsWithText keeps the given order and only the languages that have text', () => {
        const both = { content: { kn: ['a'], en: ['b'] } };
        expect(langsWithText(both)).toEqual(['kn', 'en']);          // default: every known language
        expect(langsWithText(both, ['en', 'kn'])).toEqual(['en', 'kn']);
        expect(langsWithText(block)).toEqual(['kn']);
        expect(langsWithText(block, ['en'])).toEqual([]);
    });

    test('hasAnyText: any listed language is enough; default is every known language', () => {
        expect(hasAnyText(block)).toBe(true);
        expect(hasAnyText(block, ['en'])).toBe(false);
        expect(hasAnyText({ content: { kn: [], en: [] } })).toBe(false);
    });
});

describe('imageUrl', () => {
    test('a bare file name lives in images/', () => {
        expect(imageUrl('Tatha Ajji.jpg')).toBe('images/Tatha Ajji.jpg');
    });

    test('an absolute URL is used as-is', () => {
        expect(imageUrl('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
    });
});

describe('classifyInsert', () => {
    const img = { src: 'a.jpg', caption: { en: 'cap' } };
    const insert = (block, extra = {}) => ({ id: 'i_001', type: 'insert', blocks: block ? [block] : [], ...extra });

    test("text content makes a 'title' page, and wins over an image on the same block", () => {
        const r = classifyInsert(insert({ id: 'i_001_b_1', content: { kn: [], en: ['Chapter'] }, images: [img] }));
        expect(r.kind).toBe('title');
        expect(r.hasContent).toBe(true);
        expect(r.image).toBe(img);          // still handed back so a view can draw it
    });

    test("an image and no text is a plain 'photo'", () => {
        const r = classifyInsert(insert({ id: 'i_001_b_1', content: { kn: [], en: [] }, images: [img] }));
        expect(r.kind).toBe('photo');
        expect(r.hasContent).toBe(false);
    });

    test("neither text nor image is a 'blank' page, including a block with only blank strings", () => {
        expect(classifyInsert(insert({ id: 'x', content: { kn: [''], en: ['  '] } })).kind).toBe('blank');
        expect(classifyInsert(insert(null)).kind).toBe('blank');
    });

    test('only the ACTIVE languages count as content', () => {
        const block = { id: 'x', content: { kn: ['ಶೀರ್ಷಿಕೆ'], en: [] }, images: [img] };
        expect(classifyInsert(insert(block), ['kn']).kind).toBe('title');
        expect(classifyInsert(insert(block), ['en']).kind).toBe('photo');   // Kannada hidden -> just the photo
    });

    test('showId: on for a normal block, off when hideId is set or there is no block', () => {
        const block = { id: 'i_001_b_1', content: { kn: [], en: ['x'] } };
        expect(classifyInsert(insert(block)).showId).toBe(true);
        expect(classifyInsert(insert(block, { hideId: true })).showId).toBe(false);
        expect(classifyInsert(insert(null)).showId).toBe(false);
    });

    test('exposes the block (or null)', () => {
        const block = { id: 'i_001_b_1', content: { kn: [], en: [] } };
        expect(classifyInsert(insert(block)).block).toBe(block);
        expect(classifyInsert(insert(null)).block).toBeNull();
    });
});
