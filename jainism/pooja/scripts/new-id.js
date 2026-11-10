#!/usr/bin/env node
// new-id.js — print fresh permanent ids for new items/blocks.
//   node scripts/new-id.js        → 1 id
//   node scripts/new-id.js 5      → 5 ids
// Ids are 6 characters, opaque, never reused, and unique against everything
// already in data.json. They only identify — the number readers see comes
// from the `num` fields, which you can change freely when reordering.
const fs = require('fs');
const path = require('path');
const { randomInt } = require('crypto');

const LETTERS = 'abcdefghjkmnpqrstuvwxyz';              // first char: a letter, so ids are always valid CSS selectors
const ALPHABET = '23456789' + LETTERS;                  // no 0/o/1/l/i — safe to read aloud or copy from print
const ID_PATTERN = /^[a-hj-km-np-z][2-9a-hj-km-np-z]{5}$/;

function collectIds(data) {
    const ids = new Set();
    for (const item of data) {
        ids.add(item.id);
        for (const block of item.blocks || []) ids.add(block.id);
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

module.exports = { newId, collectIds, ID_PATTERN };

if (require.main === module) {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data.json'), 'utf8'));
    const existing = collectIds(data);
    const count = Math.max(1, parseInt(process.argv[2] || '1', 10));
    for (let i = 0; i < count; i++) console.log(newId(existing));
}
