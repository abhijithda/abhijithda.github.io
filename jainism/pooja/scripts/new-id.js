#!/usr/bin/env node
// new-id.js — permanent ids for new items and blocks.
//
//   node scripts/new-id.js --fill   Give an id to every item and block in data.json
//                                   that has none. Nothing else is changed. THE USUAL WAY.
//   node scripts/new-id.js          Print one fresh id (to paste by hand).
//   node scripts/new-id.js 5        Print five.
//
// Ids are 6 characters, opaque, never reused, and unique against everything
// already in data.json. They only identify — the number readers see comes from
// the `num` fields, which you can change freely when reordering.
//
// Typical new content: write the item/block with no "id" line (or copy an
// existing one and delete its "id" line), then run `--fill`.
const fs = require('fs');
const path = require('path');
const { randomInt } = require('crypto');

const DATA_PATH = path.join(__dirname, '..', 'data.json');
const FILL_COMMAND = 'node scripts/new-id.js --fill';

const LETTERS = 'abcdefghjkmnpqrstuvwxyz';              // first char: a letter, so ids are always valid CSS selectors
const ALPHABET = '23456789' + LETTERS;                  // no 0/o/1/l/i — safe to read aloud or copy from print
const ID_PATTERN = /^[a-hj-km-np-z][2-9a-hj-km-np-z]{5}$/;

const hasId = (x) => typeof x.id === 'string' && x.id.trim() !== '';

function collectIds(data) {
    const ids = new Set();
    for (const item of data) {
        if (hasId(item)) ids.add(item.id);
        for (const block of item.blocks || []) if (hasId(block)) ids.add(block.id);
    }
    return ids;
}

function newId(existing) {
    for (;;) {
        let id = LETTERS[randomInt(LETTERS.length)];
        for (let i = 0; i < 5; i++) id += ALPHABET[randomInt(ALPHABET.length)];
        if (!existing.has(id)) { existing.add(id); return id; }
    }
}

// Put `id` first in the object, as in the rest of the file; other keys keep their order.
function withId(obj, id) {
    const { id: _ignored, ...rest } = obj;
    return { id, ...rest };
}

/**
 * Give an id to every item and block that has none. Pure: returns new data
 * and how many were added. Existing ids (even duplicates) are left alone.
 */
function fillMissingIds(data) {
    const existing = collectIds(data);
    let items = 0, blocks = 0;
    const out = data.map((item) => {
        let next = item;
        if (!hasId(item)) { next = withId(item, newId(existing)); items++; }
        if (Array.isArray(next.blocks)) {
            next = { ...next, blocks: next.blocks.map((block) => {
                if (hasId(block)) return block;
                blocks++;
                return withId(block, newId(existing));
            }) };
        }
        return next;
    });
    return { data: out, items, blocks };
}

module.exports = { newId, collectIds, fillMissingIds, hasId, ID_PATTERN, FILL_COMMAND };

if (require.main === module) {
    const arg = process.argv[2];
    if (arg === '--fill') {
        const raw = fs.readFileSync(DATA_PATH, 'utf8');
        const { data, items, blocks } = fillMissingIds(JSON.parse(raw));
        if (items + blocks === 0) {
            console.log('Nothing to do: every item and block already has an id.');
        } else {
            fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
            console.log(`Added ${items} item id(s) and ${blocks} block id(s) to data.json.`);
            console.log('Next: give each new item a "num" (an answer that references a question takes the question\'s) and each new block a "num".');
        }
    } else {
        const existing = collectIds(JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')));
        const count = Math.max(1, parseInt(arg || '1', 10) || 1);
        for (let i = 0; i < count; i++) console.log(newId(existing));
    }
}
