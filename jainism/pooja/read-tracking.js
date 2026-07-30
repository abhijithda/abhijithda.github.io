// read-tracking.js — Pure read/unread state functions.
// NO direct DOM side effects; DOM wiring is done by higher-level code.

export const READ_BLOCKS_KEY = 'readBlocks';

/**
 * Get the set of read block IDs from a storage-like object.
 * @param {Storage|Object} storage - localStorage or a mock
 * @returns {Set<string>}
 */
export function getReadBlocks(storage) {
    try {
        return new Set(JSON.parse(storage.getItem(READ_BLOCKS_KEY)) || []);
    } catch (e) {
        return new Set();
    }
}

/**
 * Persist the read set to storage.
 * @param {Set<string>} readSet
 * @param {Storage|Object} storage - localStorage or a mock
 */
export function saveReadBlocks(readSet, storage) {
    storage.setItem(READ_BLOCKS_KEY, JSON.stringify([...readSet]));
}

/**
 * Toggle a block's read state. Pure — returns a new Set, does not mutate input.
 * @param {string} blockId
 * @param {Set<string>} readSet - current read set
 * @returns {Set<string>} new set with the block toggled
 */
export function toggleBlockRead(blockId, readSet) {
    const newSet = new Set(readSet);
    if (newSet.has(blockId)) {
        newSet.delete(blockId);
    } else {
        newSet.add(blockId);
    }
    return newSet;
}

/**
 * Compute progress metrics for the header progress indicator.
 * @param {Set<string>} readSet
 * @param {number} totalBlockCount
 * @returns {{read: number, total: number, percentage: number}}
 */
export function computeProgress(readSet, totalBlockCount) {
    const read = readSet.size;
    const total = totalBlockCount;
    const percentage = total > 0 ? Math.round((read / total) * 100) : 0;
    return { read, total, percentage };
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        READ_BLOCKS_KEY,
        getReadBlocks,
        saveReadBlocks,
        toggleBlockRead,
        computeProgress,
    });
}
