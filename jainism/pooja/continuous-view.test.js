const { formatIdForDisplay, resolveReference } = require('./continuous-view.js');
const faqData = require('./test/data.json');

// Build lookup maps from fixture data (same pattern as renderContinuousView)
const blockById = {};
const itemById = {};
faqData.forEach(item => {
    itemById[item.id] = item;
    item.blocks.forEach(block => {
        blockById[block.id] = block;
    });
});

describe('formatIdForDisplay', () => {
    test('formats question block ID', () => {
        const block = { id: 'q_001_b_1', type: 'paragraph' };
        expect(formatIdForDisplay(block)).toBe('Q-1.1');
    });

    test('formats answer block ID', () => {
        const block = { id: 'a_002_b_3', type: 'note' };
        // 'a' → 'A', but type is 'note' so typeInitial = 'N'
        expect(formatIdForDisplay(block)).toBe('N-2.3');
    });

    test('formats shloka block ID with S prefix', () => {
        const block = { id: 'a_003_b_2', type: 'shloka' };
        expect(formatIdForDisplay(block)).toBe('S-3.2');
    });

    test('formats note block ID with N prefix', () => {
        const block = { id: 'a_005_b_1', type: 'note' };
        expect(formatIdForDisplay(block)).toBe('N-5.1');
    });

    test('formats paragraph block with A prefix', () => {
        const block = { id: 'a_010_b_1', type: 'paragraph' };
        expect(formatIdForDisplay(block)).toBe('A-10.1');
    });

    test('handles double-digit numbers', () => {
        const block = { id: 'q_025_b_3', type: 'paragraph' };
        expect(formatIdForDisplay(block)).toBe('Q-25.3');
    });
});

describe('resolveReference', () => {
    test('resolves block-level reference', () => {
        const result = resolveReference('q_001_b_1', blockById, itemById);
        expect(result).not.toBeNull();
        expect(result.id).toBe('q_001_b_1');
        expect(result.type).toBe('paragraph');
    });

    test('resolves item-level reference (returns first block)', () => {
        const result = resolveReference('q_001', blockById, itemById);
        expect(result).not.toBeNull();
        expect(result.id).toBe('q_001_b_1');
    });

    test('resolves answer item reference', () => {
        const result = resolveReference('a_001', blockById, itemById);
        expect(result).not.toBeNull();
        expect(result.id).toBe('a_001_b_1');
    });

    test('returns null for dangling reference', () => {
        const result = resolveReference('nonexistent_id', blockById, itemById);
        expect(result).toBeNull();
    });

    test('returns null for non-existent item', () => {
        const result = resolveReference('zzz_999', blockById, itemById);
        expect(result).toBeNull();
    });

    test('resolves reference to answer with video', () => {
        const result = resolveReference('a_001_b_1', blockById, itemById);
        expect(result.videos).toBeDefined();
        expect(result.videos.length).toBe(1);
        expect(result.videos[0].youtubeId).toBe('bgldj0TMZB4');
    });
});
