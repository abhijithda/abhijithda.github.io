const { formatIdForDisplay, buildBlockIndex, resolveReference } = require('./blocks');

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
