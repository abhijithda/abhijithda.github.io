const fs = require('fs');
const path = require('path');
const { tokenize, createIndex, search, getContext } = require('./retrieval');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data.json'), 'utf8'));
const index = createIndex(data);
const labels = hits => hits.map(h => h.chunk.label);

describe('tokenize', () => {
    test('lower-cases Latin, drops stop words and a plural s', () => {
        expect(tokenize('What are the Devatas?')).toEqual(['devata']);
    });

    test('keeps short Kannada words whole and splits long ones into overlapping trigrams', () => {
        expect(tokenize('ದಾನ')).toEqual(['ದಾನ']);
        const grams = tokenize('ಅಭಿಷೇಕವನ್ನು');
        expect(grams.length).toBeGreaterThan(2);
        grams.forEach(g => expect(Array.from(g).length).toBe(3));
    });

    test('a suffixed Kannada word shares terms with its root', () => {
        const root = new Set(tokenize('ಅಭಿಷೇಕ'));
        expect(tokenize('ಅಭಿಷೇಕವನ್ನು').some(t => root.has(t))).toBe(true);
    });

    test('handles empty / non-string input', () => {
        expect(tokenize('')).toEqual([]);
        expect(tokenize(undefined)).toEqual([]);
    });
});

describe('createIndex', () => {
    test('indexes only blocks that have text, one chunk each, with display labels', () => {
        expect(index.chunks.length).toBeGreaterThan(100);
        index.chunks.forEach(c => {
            expect(Object.keys(c.text).length).toBeGreaterThan(0);
            expect(c.label).not.toBe('?');
        });
    });
});

describe('search (real data.json)', () => {
    test('an English question finds the block that answers it', () => {
        const hits = search(index, 'what is the result of worshipping shasana devata as bhagawan', { k: 3 });
        expect(labels(hits)).toContain('A-1.1');
    });

    test('a Latin topic word is boosted by tags', () => {
        const hits = search(index, 'abhisheka', { k: 5 });
        expect(hits.length).toBe(5);
        hits.forEach(h => {
            const mentions = h.chunk.tags.includes('Abhisheka') || JSON.stringify(h.chunk.text).toLowerCase().includes('abhisheka');
            expect(mentions).toBe(true);
        });
    });

    test('a Kannada-script query reaches Kannada text', () => {
        const hits = search(index, 'ಶಾಸನ ದೇವತೆ', { k: 3 });
        expect(hits.some(h => h.chunk.tags.includes('ShasanaDevata'))).toBe(true);
    });

    test('results are best-first and limited to k', () => {
        const hits = search(index, 'pooja bhagawan', { k: 4 });
        expect(hits.length).toBeLessThanOrEqual(4);
        for (let i = 1; i < hits.length; i++) expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    });

    test('nothing matches gibberish or an empty query', () => {
        expect(search(index, 'zzqxv wwkjh')).toEqual([]);
        expect(search(index, '   ')).toEqual([]);
    });
});

describe('getContext', () => {
    test('adds the question an answer replies to, marked as such', () => {
        const ctx = getContext(index, 'what is the result of worshipping shasana devata as bhagawan', { langs: ['en'], k: 3 });
        const answer = ctx.find(p => p.label === 'A-1.1');
        expect(answer).toBeTruthy();
        expect(ctx.some(p => p.viaReference)).toBe(true);
    });

    test('only includes the requested languages', () => {
        const ctx = getContext(index, 'shasana devata', { langs: ['en'] });
        ctx.forEach(p => {
            const hasEn = 'en' in p.text;
            const onlyEn = Object.keys(p.text).every(l => l === 'en');
            // a block with no English at all falls back to what it has
            expect(hasEn ? onlyEn : true).toBe(true);
        });
    });

    test('stays within the character budget (after the first passage)', () => {
        const budget = 1500;
        const ctx = getContext(index, 'pooja bhagawan abhisheka', { budgetChars: budget, k: 8 });
        const size = ctx.reduce((s, p) => s + Object.values(p.text).reduce((n, t) => n + t.length, 0), 0);
        const first = Object.values(ctx[0].text).reduce((n, t) => n + t.length, 0);
        expect(size).toBeLessThanOrEqual(Math.max(budget, first));
    });

    test('returns nothing when no block is relevant', () => {
        expect(getContext(index, 'zzqxv wwkjh')).toEqual([]);
    });
});
