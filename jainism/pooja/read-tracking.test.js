const { READ_BLOCKS_KEY, getReadBlocks, saveReadBlocks, toggleBlockRead, computeProgress } = require('./read-tracking.js');

// Mock localStorage
const createMockStorage = () => {
    const store = {};
    return {
        getItem: jest.fn((key) => store[key] || null),
        setItem: jest.fn((key, val) => { store[key] = val; }),
        removeItem: jest.fn((key) => { delete store[key]; }),
        clear: jest.fn(() => { for (const k in store) delete store[k]; }),
        _store: store,
    };
};

describe('READ_BLOCKS_KEY', () => {
    test('is a string constant', () => {
        expect(typeof READ_BLOCKS_KEY).toBe('string');
        expect(READ_BLOCKS_KEY).toBe('readBlocks');
    });
});

describe('getReadBlocks', () => {
    test('returns empty set for empty storage', () => {
        const storage = createMockStorage();
        const result = getReadBlocks(storage);
        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
    });

    test('returns set from stored data', () => {
        const storage = createMockStorage();
        storage._store[READ_BLOCKS_KEY] = JSON.stringify(['q_001_b_1', 'a_001_b_1']);
        const result = getReadBlocks(storage);
        expect(result.size).toBe(2);
        expect(result.has('q_001_b_1')).toBe(true);
        expect(result.has('a_001_b_1')).toBe(true);
    });

    test('returns empty set for invalid JSON', () => {
        const storage = createMockStorage();
        storage._store[READ_BLOCKS_KEY] = 'not json{';
        const result = getReadBlocks(storage);
        expect(result.size).toBe(0);
    });
});

describe('saveReadBlocks', () => {
    test('persists set to storage', () => {
        const storage = createMockStorage();
        const readSet = new Set(['q_001_b_1', 'q_002_b_1']);
        saveReadBlocks(readSet, storage);
        expect(storage.setItem).toHaveBeenCalledWith(
            READ_BLOCKS_KEY,
            JSON.stringify(['q_001_b_1', 'q_002_b_1'])
        );
    });

    test('persists empty set', () => {
        const storage = createMockStorage();
        saveReadBlocks(new Set(), storage);
        expect(storage.setItem).toHaveBeenCalledWith(READ_BLOCKS_KEY, '[]');
    });
});

describe('toggleBlockRead', () => {
    test('adds a block that is not read', () => {
        const readSet = new Set();
        const newSet = toggleBlockRead('q_001_b_1', readSet);
        expect(newSet.has('q_001_b_1')).toBe(true);
        expect(newSet.size).toBe(1);
    });

    test('removes a block that is already read', () => {
        const readSet = new Set(['q_001_b_1']);
        const newSet = toggleBlockRead('q_001_b_1', readSet);
        expect(newSet.has('q_001_b_1')).toBe(false);
        expect(newSet.size).toBe(0);
    });

    test('does not mutate original set (pure)', () => {
        const readSet = new Set(['q_001_b_1']);
        const newSet = toggleBlockRead('q_002_b_1', readSet);
        expect(readSet.size).toBe(1); // Original unchanged
        expect(readSet.has('q_002_b_1')).toBe(false);
        expect(newSet.size).toBe(2);
    });

    test('preserves other blocks when toggling one', () => {
        const readSet = new Set(['q_001_b_1', 'q_002_b_1']);
        const newSet = toggleBlockRead('q_003_b_1', readSet);
        expect(newSet.has('q_001_b_1')).toBe(true);
        expect(newSet.has('q_002_b_1')).toBe(true);
        expect(newSet.has('q_003_b_1')).toBe(true);
        expect(newSet.size).toBe(3);
    });
});

describe('computeProgress', () => {
    test('computes zero progress', () => {
        const result = computeProgress(new Set(), 131);
        expect(result.read).toBe(0);
        expect(result.total).toBe(131);
        expect(result.percentage).toBe(0);
    });

    test('computes partial progress', () => {
        const result = computeProgress(new Set(['a', 'b', 'c']), 131);
        expect(result.read).toBe(3);
        expect(result.total).toBe(131);
        expect(result.percentage).toBe(2); // Math.round(3/131 * 100) = 2
    });

    test('computes full progress', () => {
        const readSet = new Set();
        for (let i = 0; i < 10; i++) readSet.add(`block_${i}`);
        const result = computeProgress(readSet, 10);
        expect(result.read).toBe(10);
        expect(result.total).toBe(10);
        expect(result.percentage).toBe(100);
    });

    test('handles zero total without division error', () => {
        const result = computeProgress(new Set(), 0);
        expect(result.read).toBe(0);
        expect(result.total).toBe(0);
        expect(result.percentage).toBe(0);
    });
});
