const fs = require('fs');
const path = require('path');
const { tokenize, foldLatin, createIndex, search, getContext, moreMatches } = require('./retrieval');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data.json'), 'utf8'));
const index = createIndex(data);
const labels = hits => hits.map(h => h.chunk.label);

describe('tokenize', () => {
    test('lower-cases Latin, drops stop words and a plural s', () => {
        expect(tokenize('What are the Devatas?')).toEqual([foldLatin('devata')]);
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

    test('common spellings of one transliterated word fold to the same term', () => {
        const same = [
            ['Pujyapada', 'Poojyapaada'], ['Manatunga', 'Maanatunga'], ['Moodhata', 'Mudhata'],
            ['Shripala', 'Shreepala'], ['Arghya', 'Argya'], ['Nishchaya', 'Nischaya'],
            ['Shasana', 'Shaasana'], ['Samyaktva', 'Samyaktv'], ['Abhisheka', 'Abhishek'],
            ['Bhagawan', 'Bhagavan'], ['Chakreshwari', 'Chakreswari'], ['Tirthankara', 'Thirthankara'],
        ];
        same.forEach(([a, b]) => expect([a, tokenize(a)]).toEqual([a, tokenize(b)]));
    });

    test('different words stay different', () => {
        expect(tokenize('Daana')).not.toEqual(tokenize('Dharma'));
        expect(tokenize('Vrati')).not.toEqual(tokenize('Avrati'));
        expect(tokenize('Indra')).not.toEqual(tokenize('Indrani'));
    });

    test('Latin diacritics are ignored', () => {
        expect(tokenize('Śāsana')).toEqual(tokenize('Shasana'));
    });

    test('handles empty / non-string input', () => {
        expect(tokenize('')).toEqual([]);
        expect(tokenize(undefined)).toEqual([]);
    });
});

describe('createIndex', () => {
    test('indexes blocks that have text, one chunk each, with display labels', () => {
        expect(index.chunks.length).toBeGreaterThan(100);
        index.chunks.forEach(c => {
            if (!c.textless) expect(Object.keys(c.text).length).toBeGreaterThan(0);
            expect(c.label).not.toBe('?');
        });
    });

    test('a tagged block with no text (a photo) is indexed, marked textless; an untagged one is not', () => {
        const photos = index.chunks.filter(c => c.textless);
        expect(photos.length).toBeGreaterThan(0);
        photos.forEach(c => {
            expect(c.tags.length).toBeGreaterThan(0);
            expect(Object.keys(c.text)).toEqual([]);
        });
        const withTags = data.flatMap(i => i.blocks || []).filter(b => (b.tags || []).length);
        const untaggedEmpty = data.flatMap(i => i.blocks || []).filter(b => !(b.tags || []).length && !index.chunks.some(c => c.id === b.id));
        expect(withTags.every(b => index.chunks.some(c => c.id === b.id))).toBe(true);
        untaggedEmpty.forEach(b => expect(index.chunks.some(c => c.id === b.id)).toBe(false));
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
        expect(hits.some(h => h.chunk.tags.includes('Shasana Devata'))).toBe(true);
    });

    test('a spaced tag matches on either of its words, and in other spellings', () => {
        ['shasana', 'devata', 'shaasana devata'].forEach(q => {
            const hits = search(index, q, { k: 5 });
            expect(hits.length).toBeGreaterThan(0);
            expect(hits.some(h => h.chunk.tags.includes('Shasana Devata'))).toBe(true);
        });
    });

    test('a reader\'s spelling finds the same blocks as the tag spelling', () => {
        const ids = q => new Set(search(index, q, { k: 30 }).map(h => h.chunk.id));
        [['pujyapada', 'poojyapaada'], ['manatunga', 'maanatunga'], ['moodhata', 'mudhata'],
         ['shripala', 'shreepala'], ['arghya', 'argya'], ['nishchaya', 'nischaya']].forEach(([a, b]) => {
            expect(ids(a).size).toBeGreaterThan(0);
            expect(ids(b)).toEqual(ids(a));
        });
    });

    test('a photo is found through its tag', () => {
        const hits = search(index, 'bawangaja', { k: 10 });
        expect(hits.some(h => h.chunk.textless)).toBe(true);
    });

    test('textOnly leaves photos out', () => {
        const hits = search(index, 'bawangaja', { k: 10, textOnly: true });
        expect(hits.length).toBeGreaterThan(0);
        hits.forEach(h => expect(h.chunk.textless).toBe(false));
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

    test('never hands the model or the cards a block with no text', () => {
        const ctx = getContext(index, 'bawangaja adinatha', { k: 8 });
        expect(ctx.length).toBeGreaterThan(0);
        ctx.forEach(p => expect(Object.keys(p.text).length).toBeGreaterThan(0));
        moreMatches(index, 'bawangaja adinatha').forEach(p => expect(Object.keys(p.text).length).toBeGreaterThan(0));
    });
});

describe('moreMatches', () => {
    test('returns further matches, best first, never repeating an excluded passage', () => {
        const first = getContext(index, 'abhisheka', { langs: ['en'], k: 3 }).map(p => p.id);
        const more = moreMatches(index, 'abhisheka', { langs: ['en'], exclude: first, limit: 12 });
        expect(more.length).toBeGreaterThan(3);
        expect(more.length).toBeLessThanOrEqual(12);
        more.forEach(p => expect(first).not.toContain(p.id));
        expect(new Set(more.map(p => p.id)).size).toBe(more.length);
    });

    test('nothing for a query that matches nothing', () => {
        expect(moreMatches(index, 'zzqxv wwkjh')).toEqual([]);
    });
});
