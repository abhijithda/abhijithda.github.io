// share.js — Share links: what they look like, and what they point at.
// Pure functions (no DOM), so they are unit-tested directly.
//
// A link is  <page address>#/s/<id>[,<id>…]  where each id is a permanent id
// from data.json: an ITEM id shows the whole card (all its blocks), a BLOCK id
// shows just that block. Hash routing, because the site is a static GitHub
// Pages site with no server to route paths. The links carry ids only — never
// numbers or positions — so reordering the book never breaks a link.

import { buildBlockIndex, formatIdForDisplay, itemNumber } from './blocks.js';

export const SHARE_PREFIX = '#/s/';
const ID_SHAPE = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_IDS = 30;

/**
 * Ids in a share hash, or null when the hash is not a share link at all.
 * A share link with no usable id gives [] (the page then says "nothing here").
 * @param {string} hash  location.hash
 * @returns {string[]|null}
 */
export function parseShareHash(hash) {
    if (typeof hash !== 'string' || !hash.startsWith(SHARE_PREFIX)) return null;
    const ids = hash.slice(SHARE_PREFIX.length).split(',')
        .map(s => { try { return decodeURIComponent(s.trim()); } catch { return ''; } })
        .filter(id => ID_SHAPE.test(id));
    return [...new Set(ids)].slice(0, MAX_IDS);
}

export function buildShareHash(ids) {
    return SHARE_PREFIX + ids.map(encodeURIComponent).join(',');
}

/** Full link for the current page: same address, hash replaced. */
export function buildShareUrl(loc, ids) {
    return `${loc.origin}${loc.pathname}${buildShareHash(ids)}`;
}

/**
 * What to show for a list of shared ids. Items come back in book order (not
 * link order). An item id wins over any of its blocks in the same link. A
 * block id gives a copy of its item holding only the shared block(s) — the
 * block objects themselves are the originals, so their labels still resolve.
 * @returns {{items: Object[], missing: string[]}}
 */
export function resolveShared(data, ids) {
    const wanted = new Set(ids);
    const known = new Set();
    data.forEach(item => {
        known.add(item.id);
        (item.blocks || []).forEach(b => known.add(b.id));
    });
    const items = [];
    data.forEach(item => {
        if (wanted.has(item.id)) { items.push(item); return; }
        const blocks = (item.blocks || []).filter(b => wanted.has(b.id));
        if (blocks.length) items.push({ ...item, blocks });
    });
    return { items, missing: ids.filter(id => !known.has(id)) };
}

const ITEM_WORD = { question: 'question', answer: 'answer' };

/**
 * Describe what an id can share, for the share sheet's wording.
 * @param {Object[]} data
 * @param {string} id  an item id or a block id
 * @returns {null | {itemId, blockId, blockLabel, itemLabel, itemWord, blockCount}}
 */
export function shareTarget(data, id) {
    const { blockById, itemById } = buildBlockIndex(data);
    let block = blockById[id] || null;
    const item = block ? data.find(i => (i.blocks || []).includes(block)) : itemById[id];
    if (!item) return null;
    const number = itemNumber(item, itemById);
    const letter = (item.type || 'x')[0].toUpperCase();
    return {
        itemId: item.id,
        blockId: block ? block.id : null,
        blockLabel: block ? formatIdForDisplay(block) : null,
        itemLabel: number === undefined ? null : `${letter}-${number}`,
        itemWord: ITEM_WORD[item.type] || 'item',
        blockCount: (item.blocks || []).length,
    };
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        SHARE_PREFIX, parseShareHash, buildShareHash, buildShareUrl, resolveShared, shareTarget,
    });
}
