// blocks.js — Pure data-model helpers for blocks/items. No DOM, no view
// assumptions — shared across every view (continuous, book, or any future
// one) so ID formatting and reference resolution live in exactly one place.

/**
 * Format a block's short display label, e.g. "A-3.1" for an answer block,
 * "S-3.2" for a shloka, "N-4.1" for a note (type overrides the id's own
 * first letter for these two).
 * @param {Object} block
 * @returns {string}
 */
export function formatIdForDisplay(block) {
    let typeInitial = block.id[0].toUpperCase();
    if (block.type === 'shloka') typeInitial = 'S';
    else if (block.type === 'note') typeInitial = 'N';
    const parts = block.id.split('_');
    const number = parseInt(parts[1], 10);
    const subNumber = parts[3];
    return `${typeInitial}-${number}.${subNumber}`;
}

/**
 * Build lookup maps for every item and block in the dataset. Every view
 * needs the same two maps to resolve references — build them once per
 * render rather than each view re-deriving its own copy.
 * @param {Array} data
 * @returns {{blockById: Object, itemById: Object}}
 */
export function buildBlockIndex(data) {
    const blockById = {};
    const itemById  = {};
    data.forEach(item => {
        itemById[item.id] = item;
        item.blocks.forEach(block => { blockById[block.id] = block; });
    });
    return { blockById, itemById };
}

/**
 * Resolve a reference id to a block: a direct block id match, or an item
 * id falling back to that item's first block.
 * @param {string} refId
 * @param {Object} blockById
 * @param {Object} itemById
 * @returns {Object|null}
 */
export function resolveReference(refId, blockById, itemById) {
    if (blockById[refId]) return blockById[refId];
    const item = itemById[refId];
    if (item && item.blocks && item.blocks.length > 0) return item.blocks[0];
    return null;
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, { formatIdForDisplay, buildBlockIndex, resolveReference });
}
