// ai/retrieval.js — In-browser search over data.json. No build step, no
// network: the whole book is ~40 KB of text, so it is indexed in memory the
// first time the assistant is opened and ranked with BM25 (plus a tag boost).
//
// This is the v1 baseline. The public surface — createIndex / search /
// getContext — is deliberately all the rest of ai/ depends on, so a semantic
// (embedding) retriever can replace it later without touching the engines or
// the panel, if the eval harness shows lexical search is not good enough.
//
// Kannada is agglutinative (a root takes many suffixes), so Kannada-script
// words are indexed as character trigrams: "ಅಭಿಷೇಕವನ್ನು" still overlaps with
// "ಅಭಿಷೇಕ". Latin words are lower-cased, lightly stemmed, and stop-worded.
// Known gap: nothing maps Kannada script <-> transliterated Latin yet
// (ಅಭಿಷೇಕ vs "abhisheka"), apart from the Latin tags on blocks.

import { buildBlockIndex, formatIdForDisplay, resolveReference, hasAnyText } from '../core/blocks.js';
import { LANG_CODES } from '../core/langs.js';

const K1 = 1.2;           // BM25 term-frequency saturation
const B = 0.75;           // BM25 length normalisation
const TAG_WEIGHT = 3;     // a tag hit counts as this many body hits
const KANNADA = /[\u0C80-\u0CFF]/;
const WORD = /[\p{L}\p{M}\p{N}]+/gu;

const STOPWORDS = new Set((
    'a an and are as at be but by do does for from how i if in is it its of on or so than that the their ' +
    'then there these this to was what when where which who whom why will with you your can could should would'
).split(' '));

/** Splits text into search terms (see header comment for the Kannada/Latin handling). */
export function tokenize(text) {
    const terms = [];
    const words = String(text ?? '').normalize('NFC').toLowerCase().match(WORD) || [];
    for (const word of words) {
        if (KANNADA.test(word)) {
            const chars = Array.from(word);
            if (chars.length <= 3) { terms.push(word); continue; }
            for (let i = 0; i + 3 <= chars.length; i++) terms.push(chars.slice(i, i + 3).join(''));
        } else {
            if (STOPWORDS.has(word) || word.length < 2) continue;
            terms.push(word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word);
        }
    }
    return terms;
}

/**
 * Turns the dataset into one searchable chunk per block that has text.
 * @param {Array} data  parsed data.json
 */
export function createIndex(data) {
    const { blockById, itemById } = buildBlockIndex(data);
    const chunks = [];

    for (const item of data) {
        for (const block of item.blocks || []) {
            if (!hasAnyText(block)) continue;
            const text = {};
            for (const lang of LANG_CODES) {
                const lines = (block.content?.[lang] || []).filter(l => l.trim() !== '');
                if (lines.length) text[lang] = lines.join(' ');
            }
            const tags = block.tags || [];
            const tf = new Map();
            const add = (term, n) => tf.set(term, (tf.get(term) || 0) + n);
            Object.values(text).forEach(t => tokenize(t).forEach(term => add(term, 1)));
            tags.forEach(tag => tokenize(tag).forEach(term => add(term, TAG_WEIGHT)));
            let length = 0;
            tf.forEach(n => { length += n; });
            chunks.push({
                id: block.id,
                label: formatIdForDisplay(block),
                itemId: item.id,
                itemType: item.type,
                blockType: block.type,
                tags, text, tf, length,
            });
        }
    }

    const df = new Map();
    chunks.forEach(c => c.tf.forEach((_, term) => df.set(term, (df.get(term) || 0) + 1)));
    const avgLength = chunks.length ? chunks.reduce((s, c) => s + c.length, 0) / chunks.length : 0;
    return { chunks, df, avgLength, blockById, itemById, data };
}

/**
 * BM25 ranking. Returns up to `k` chunks, best first, each with its score.
 * @returns {{chunk: Object, score: number}[]}
 */
export function search(index, query, { k = 6 } = {}) {
    const terms = [...new Set(tokenize(query))];
    if (!terms.length || !index.chunks.length) return [];
    const N = index.chunks.length;
    const scored = [];
    for (const chunk of index.chunks) {
        let score = 0;
        for (const term of terms) {
            const f = chunk.tf.get(term);
            if (!f) continue;
            const n = index.df.get(term) || 0;
            const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
            score += idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * chunk.length / (index.avgLength || 1)));
        }
        if (score > 0) scored.push({ chunk, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, k);
}

function passageFrom(chunk, langs) {
    const text = {};
    langs.forEach(lang => { if (chunk.text[lang]) text[lang] = chunk.text[lang]; });
    // A block with nothing in the reader's languages falls back to whatever it has.
    return { id: chunk.id, label: chunk.label, tags: chunk.tags, text: Object.keys(text).length ? text : chunk.text };
}

/**
 * The passages to show the model for a question: the best-matching blocks,
 * each followed by the block it replies to (an answer is hard to read without
 * its question — `references` is how the book links them), trimmed to a
 * character budget so a small local model's context is not blown.
 * @param {Object} index
 * @param {string} query
 * @param {{langs?: string[], k?: number, budgetChars?: number, minScore?: number}} [opts]
 * @returns {{id:string,label:string,tags:string[],text:Object,viaReference?:boolean}[]}
 */
export function getContext(index, query, { langs = LANG_CODES, k = 5, budgetChars = 6000, minScore = 0.5 } = {}) {
    const hits = search(index, query, { k }).filter(h => h.score >= minScore);
    const out = [];
    const seen = new Set();
    let used = 0;
    const size = p => Object.values(p.text).reduce((s, t) => s + t.length, 0);

    const push = (passage) => {
        if (seen.has(passage.id)) return true;
        const n = size(passage);
        if (out.length && used + n > budgetChars) return false;
        seen.add(passage.id);
        used += n;
        out.push(passage);
        return true;
    };

    for (const { chunk } of hits) {
        if (!push(passageFrom(chunk, langs))) break;
        const item = index.itemById[chunk.itemId];
        for (const refId of item?.references || []) {
            const refBlock = resolveReference(refId, index.blockById, index.itemById);
            const refChunk = refBlock && index.chunks.find(c => c.id === refBlock.id);
            if (refChunk) push({ ...passageFrom(refChunk, langs), viaReference: true });
        }
    }
    return out;
}

/**
 * More passages that match a question, past the ones already shown: for "show
 * me everything about X". Best match first, same minimum score as getContext.
 * @param {Object} index
 * @param {string} query
 * @param {{langs?: string[], exclude?: string[], limit?: number, minScore?: number}} [opts]
 */
export function moreMatches(index, query, { langs = LANG_CODES, exclude = [], limit = 12, minScore = 0.5 } = {}) {
    const skip = new Set(exclude);
    return search(index, query, { k: 60 })
        .filter(h => h.score >= minScore && !skip.has(h.chunk.id))
        .slice(0, limit)
        .map(h => passageFrom(h.chunk, langs));
}
