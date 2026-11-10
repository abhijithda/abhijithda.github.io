// read-tracking.js — Read/unread state functions.
// Storage and counting are pure; the only DOM touch is updateProgressDisplay().
// The tick button itself is built by read-tick.js.

import { hasAnyText } from './blocks.js';

export const READ_BLOCKS_KEY = 'readBlocks';

/**
 * Get the set of read block IDs from storage.
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
 * Drop read ticks whose block no longer exists (deleted content, or ids from
 * before they became permanent). Without this, such ticks would still count
 * toward progress, because progress is the size of the read set. Pure —
 * returns the cleaned Set and whether anything was dropped, so the caller
 * only writes storage when needed.
 * @param {Set<string>} readSet
 * @param {Object} blockById  from buildBlockIndex
 * @returns {{readSet: Set<string>, changed: boolean}}
 */
export function pruneUnknownReadIds(readSet, blockById) {
    const kept = new Set([...readSet].filter(id => Object.prototype.hasOwnProperty.call(blockById, id)));
    return { readSet: kept, changed: kept.size !== readSet.size };
}

/**
 * Toggle a block's read state. Pure — returns a new Set, does not mutate input.
 * @param {string} blockId
 * @param {Set<string>} readSet - current read set
 * @returns {Set<string>}
 */
export function toggleBlockRead(blockId, readSet) {
    const newSet = new Set(readSet);
    if (newSet.has(blockId)) newSet.delete(blockId);
    else newSet.add(blockId);
    return newSet;
}

/**
 * Whether a block has anything worth marking read/watched at all.
 * A block with no text AND no video (e.g. a standalone image) isn't
 * trackable — it gets no tick and doesn't count toward the total in
 * computeProgress. A video-only block IS trackable: videos can run long,
 * so marking one "watched" is meaningful even with no accompanying text.
 * Shared across every view (continuous, book, or any future one) so the
 * rule for what counts as "readable" lives in exactly one place.
 * @param {Object} block
 * @returns {boolean}
 */
export function isBlockTrackable(block) {
    const hasVideo = !!(block.videos && block.videos.length > 0);
    return hasAnyText(block) || hasVideo;
}

/**
 * How many blocks count toward read progress. "insert" items (front cover,
 * dividers, standalone photos, blank pages) are decorative structure, not
 * content a reader marks as read, so they are excluded entirely — even if
 * their block happens to carry title text that would otherwise look
 * trackable by the per-block rule.
 * @param {Array} data
 * @returns {number}
 */
export function countTrackableBlocks(data) {
    return data.reduce((sum, item) =>
        item.type === 'insert' ? sum : sum + (item.blocks || []).filter(isBlockTrackable).length, 0);
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

/**
 * Compute progress and write it into the header's #read-progress element.
 * Shared by both views so the "find the element, format the text" logic
 * only exists once, and so a view can't silently forget to call it — book
 * view originally only updated this on each tick click, never on its
 * initial render, unlike continuous view; that gap is why this exists as
 * a single function both views call from both places.
 * @param {Set<string>} readSet
 * @param {number} totalBlockCount
 */
export function updateProgressDisplay(readSet, totalBlockCount) {
    const { read, total } = computeProgress(readSet, totalBlockCount);
    const el = document.getElementById('read-progress');
    if (el) el.textContent = `✓ ${read}/${total} read`;
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        READ_BLOCKS_KEY, getReadBlocks, saveReadBlocks, toggleBlockRead, pruneUnknownReadIds,
        isBlockTrackable, countTrackableBlocks, computeProgress, updateProgressDisplay,
    });
}
