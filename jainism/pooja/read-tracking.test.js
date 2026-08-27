const {
    READ_BLOCKS_KEY,
    getReadBlocks,
    saveReadBlocks,
    toggleBlockRead,
    isBlockTrackable,
    computeProgress,
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
