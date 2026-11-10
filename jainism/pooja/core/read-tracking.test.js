const {
    READ_BLOCKS_KEY,
    getReadBlocks,
    saveReadBlocks,
    toggleBlockRead,
    pruneUnknownReadIds,
    isBlockTrackable,
    countTrackableBlocks,
    computeProgress,
    updateProgressDisplay,
} = require('./read-tracking');

function fakeStorage() {
    // A minimal Storage-like mock so these tests don't depend on jsdom's localStorage.
    const store = {};
    return {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
    };
}

describe('getReadBlocks / saveReadBlocks', () => {
    test('returns an empty set when nothing is stored', () => {
        expect(getReadBlocks(fakeStorage())).toEqual(new Set());
    });

    test('round-trips a saved set', () => {
        const storage = fakeStorage();
        saveReadBlocks(new Set(['a_001_b_1', 'q_001_b_1']), storage);
        expect(getReadBlocks(storage)).toEqual(new Set(['a_001_b_1', 'q_001_b_1']));
    });

    test('falls back to an empty set on malformed storage content', () => {
        const storage = fakeStorage();
        storage.setItem(READ_BLOCKS_KEY, 'not valid json');
        expect(getReadBlocks(storage)).toEqual(new Set());
    });
});

describe('toggleBlockRead', () => {
    test('adds a block id that is not yet in the set', () => {
        const result = toggleBlockRead('a_001_b_1', new Set());
        expect(result.has('a_001_b_1')).toBe(true);
    });

    test('removes a block id that is already in the set', () => {
        const result = toggleBlockRead('a_001_b_1', new Set(['a_001_b_1']));
        expect(result.has('a_001_b_1')).toBe(false);
    });

    test('does not mutate the input set (pure function)', () => {
        const input = new Set(['a_001_b_1']);
        toggleBlockRead('a_001_b_1', input);
        expect(input.has('a_001_b_1')).toBe(true); // unchanged
    });
});

// Shared across every view — the rule for what counts as "readable" lives
// here once, instead of each view (continuous, book, or a future one)
// reimplementing its own version of it.
describe('isBlockTrackable', () => {
    test('a block with text is trackable', () => {
        expect(isBlockTrackable({ content: { kn: ['ಪ'], en: [] }, videos: [] })).toBe(true);
    });

    test('a block with a video but no text is trackable — videos can run long, worth marking watched', () => {
        expect(isBlockTrackable({ content: { kn: [], en: [] }, videos: [{ url: 'https://youtu.be/x' }] })).toBe(true);
    });

    test('a block with neither text nor video (e.g. a standalone image) is not trackable', () => {
        expect(isBlockTrackable({ content: { kn: [], en: [] }, videos: [], images: [{ src: 'x.jpg' }] })).toBe(false);
    });

    test('blank-string-only content counts as no text', () => {
        expect(isBlockTrackable({ content: { kn: [''], en: [''] }, videos: [] })).toBe(false);
    });

    test('missing content/videos fields default to not-trackable rather than throwing', () => {
        expect(() => isBlockTrackable({})).not.toThrow();
        expect(isBlockTrackable({})).toBe(false);
    });
});

describe('computeProgress', () => {
    test('computes read/total/percentage', () => {
        expect(computeProgress(new Set(['a', 'b']), 4)).toEqual({ read: 2, total: 4, percentage: 50 });
    });

    test('returns 0% when total is 0, instead of dividing by zero', () => {
        expect(computeProgress(new Set(), 0)).toEqual({ read: 0, total: 0, percentage: 0 });
    });

    test('rounds the percentage', () => {
        expect(computeProgress(new Set(['a']), 3).percentage).toBe(33);
    });
});

// Shared by both views specifically so a view can't forget to call it on
// its own initial render — book view originally only updated the counter
// reactively (on tick click), never on load, which this centralizes and fixes.
describe('updateProgressDisplay', () => {
    beforeEach(() => {
        document.body.innerHTML = '<span id="read-progress"></span>';
    });

    test('writes the formatted read/total text into #read-progress', () => {
        updateProgressDisplay(new Set(['a', 'b']), 4);
        expect(document.getElementById('read-progress').textContent).toBe('✓ 2/4 read');
    });

    test('handles zero total without throwing', () => {
        expect(() => updateProgressDisplay(new Set(), 0)).not.toThrow();
        expect(document.getElementById('read-progress').textContent).toBe('✓ 0/0 read');
    });

    test('does nothing (no throw) when #read-progress is not present in the DOM', () => {
        document.body.innerHTML = '';
        expect(() => updateProgressDisplay(new Set(), 1)).not.toThrow();
    });
});

describe('countTrackableBlocks', () => {
    const text = id => ({ id, content: { kn: ['ಪ'], en: [] }, videos: [] });
    const image = id => ({ id, content: { kn: [], en: [] }, videos: [], images: [{ src: 'x.jpg' }] });
    const video = id => ({ id, content: { kn: [], en: [] }, videos: [{ url: 'https://youtu.be/x' }] });

    test('counts blocks with text or a video, across all items', () => {
        const data = [
            { id: 'q_1', type: 'question', blocks: [text('q_1_b_1')] },
            { id: 'a_1', type: 'answer', blocks: [text('a_1_b_1'), video('a_1_b_2'), image('a_1_b_3')] },
        ];
        expect(countTrackableBlocks(data)).toBe(3);   // the image-only block is not trackable
    });

    test('"insert" items never count, even when their block carries title text', () => {
        const data = [
            { id: 'i_1', type: 'insert', blocks: [text('i_1_b_1')] },
            { id: 'a_1', type: 'answer', blocks: [text('a_1_b_1')] },
        ];
        expect(countTrackableBlocks(data)).toBe(1);
    });

    test('items without blocks, and an empty book, count zero', () => {
        expect(countTrackableBlocks([{ id: 'a_1', type: 'answer' }])).toBe(0);
        expect(countTrackableBlocks([])).toBe(0);
    });
});

describe('pruneUnknownReadIds', () => {
    const blockById = { bw4n8c: {}, pq3w7a: {} };

    test('drops ticks for blocks that no longer exist (e.g. old position-based ids) and reports a change', () => {
        const { readSet, changed } = pruneUnknownReadIds(new Set(['bw4n8c', 'a_003_b_1']), blockById);
        expect([...readSet]).toEqual(['bw4n8c']);
        expect(changed).toBe(true);
    });

    test('keeps everything and reports no change when every tick is still valid', () => {
        const { readSet, changed } = pruneUnknownReadIds(new Set(['bw4n8c', 'pq3w7a']), blockById);
        expect(readSet.size).toBe(2);
        expect(changed).toBe(false);
    });

    test('does not mutate its input', () => {
        const input = new Set(['a_003_b_1']);
        pruneUnknownReadIds(input, blockById);
        expect([...input]).toEqual(['a_003_b_1']);
    });
});
