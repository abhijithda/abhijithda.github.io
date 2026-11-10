// blocks.js — Pure data-model helpers for blocks/items. No DOM, no view
// assumptions — shared across every view (continuous, book, or any future
// one) so ID formatting, reference resolution, "does this block have text",
// image URLs and "what kind of insert page is this" live in exactly one place.

import { LANG_CODES } from './langs.js';

// Display labels, computed once per dataset by buildBlockIndex (a block does
// not know its parent item's type or number, which its label needs). A
// WeakMap keeps this out of the data and lets labels vanish with the blocks.
const labelOf = new WeakMap();

// Label letter by block type; plain paragraphs take their item's initial (Q / A).
const BLOCK_LETTERS = { shloka: 'S', note: 'N', images: 'I', mantra: 'M' };

/**
 * The number shown for an item in labels (the 3 in A-3.1).
 * An item's own `num` wins. An answer without one takes the number of the
 * question it replies to (the first item in its `references` that is a
 * question), so a question and its answer always share a number and only the
 * question needs renumbering when content is reordered.
 * @param {Object} item
 * @param {Object} itemById
 * @returns {number|undefined}
 */
export function itemNumber(item, itemById) {
    if (item.num !== undefined) return item.num;
    if (item.type === 'answer') {
        for (const refId of item.references || []) {
            const target = itemById[refId];
            if (target && target.type === 'question' && target.num !== undefined) return target.num;
        }
    }
    return undefined;
}

function computeLabel(item, number, block) {
    const letter = BLOCK_LETTERS[block.type] || (item.type ? item.type[0] : 'x');
    return `${letter.toUpperCase()}-${number}.${block.num}`;
}

/**
 * Format a block's short display label, e.g. "A-3.1" for an answer block,
 * "S-3.2" for a shloka, "N-4.1" for a note.
 *
 * Ids are opaque and permanent (they only identify); the numbers shown come
 * from the item's number (see itemNumber) and the block's `num`. Labels are
 * computed by buildBlockIndex(data), so call that first. Legacy ids of the
 * form "a_003_b_1" (the e2e fixtures) still work: with no computed label, the
 * number and letter are read from the id itself.
 * @param {Object} block
 * @returns {string}
 */
export function formatIdForDisplay(block) {
    if (labelOf.has(block)) return labelOf.get(block);
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
        (item.blocks || []).forEach(block => { blockById[block.id] = block; });
    });
    // Second pass: labels need every item indexed first (an answer's number
    // comes from the question it replies to).
    data.forEach(item => {
        const number = itemNumber(item, itemById);
        if (number === undefined) return;
        (item.blocks || []).forEach(block => {
            if (block.num !== undefined) labelOf.set(block, computeLabel(item, number, block));
        });
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

/**
 * Whether a block has any non-blank line in one language.
 * @param {Object} block
 * @param {string} lang  e.g. 'kn'
 * @returns {boolean}
 */
export function hasLangText(block, lang) {
    return !!block?.content?.[lang]?.some(line => line.trim() !== '');
}

/**
 * Of the given languages (default: every known one), the ones this block
 * actually has text in, in the order given.
 * @param {Object} block
 * @param {string[]} [langs]
 * @returns {string[]}
 */
export function langsWithText(block, langs = LANG_CODES) {
    return langs.filter(lang => hasLangText(block, lang));
}

/**
 * Whether a block has text in any of the given languages (default: every
 * known one). Purely about text — a video-only block has none (see
 * read-tracking.js's isBlockTrackable for "worth marking read").
 * @param {Object} block
 * @param {string[]} [langs]
 * @returns {boolean}
 */
export function hasAnyText(block, langs = LANG_CODES) {
    return langsWithText(block, langs).length > 0;
}

/**
 * URL for an image entry's `src`: absolute URLs are used as-is, anything
 * else is a file name in the images/ folder.
 * @param {string} src
 * @returns {string}
 */
export function imageUrl(src) {
    return src.includes('://') ? src : `images/${src}`;
}

/**
 * Classify an "insert" item — the front cover, section dividers, plain
 * standalone photos and blank pages are all one item type, told apart only
 * by which fields their one block has. Both views used to work this out
 * separately; this is the single definition.
 *
 *   kind 'title'  block.content has text (in an active language): the big
 *                 centred title-style page, dash-ruled. Wins over an image.
 *   kind 'photo'  no such text, but an image: a plain standalone photo with
 *                 its per-image caption.
 *   kind 'blank'  neither: a genuinely blank page.
 *
 * `showId` is false only when `hideId: true` (meant for the front cover,
 * which nothing should ever cite) or there is no block at all.
 *
 * @param {Object} item
 * @param {string[]} [activeLangs]  languages that count for "has content"
 * @returns {{block: Object|null, image: Object|null, hasContent: boolean,
 *            kind: 'title'|'photo'|'blank', showId: boolean}}
 */
export function classifyInsert(item, activeLangs = LANG_CODES) {
    const block = item?.blocks?.[0] ?? null;
    const image = block?.images?.[0] ?? null;
    const hasContent = !!block && hasAnyText(block, activeLangs);
    const kind = hasContent ? 'title' : (image ? 'photo' : 'blank');
    return { block, image, hasContent, kind, showId: !!block && !item.hideId };
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        formatIdForDisplay, itemNumber, buildBlockIndex, resolveReference,
        hasLangText, langsWithText, hasAnyText, imageUrl, classifyInsert,
    });
}
