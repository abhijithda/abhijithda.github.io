const {
    SHARE_PREFIX, parseShareHash, buildShareHash, buildShareUrl, resolveShared, shareTarget,
} = require('./share');

const data = () => [
    { id: 'qa1', num: 3, type: 'question', blocks: [{ id: 'qb1', num: 1, type: 'paragraph' }] },
    { id: 'aa1', type: 'answer', references: ['qa1'], blocks: [
        { id: 'ab1', num: 1, type: 'paragraph' },
        { id: 'ab2', num: 2, type: 'shloka' },
        { id: 'ab3', num: 3, type: 'paragraph' },
    ] },
    { id: 'ia1', num: 4, type: 'insert', blocks: [{ id: 'ib1', num: 1, type: 'images' }] },
];

describe('parseShareHash', () => {
    test('is null for anything that is not a share link', () => {
        expect(parseShareHash('')).toBeNull();
        expect(parseShareHash('#about')).toBeNull();
        expect(parseShareHash('#/s')).toBeNull();
        expect(parseShareHash(undefined)).toBeNull();
    });
    test('reads one or several ids', () => {
        expect(parseShareHash('#/s/bkr39k')).toEqual(['bkr39k']);
        expect(parseShareHash('#/s/ab1,ab2,qa1')).toEqual(['ab1', 'ab2', 'qa1']);
    });
    test('a share link with nothing usable is [] (not null), so the page can say "nothing here"', () => {
        expect(parseShareHash('#/s/')).toEqual([]);
        expect(parseShareHash('#/s/<script>,a b,%E0%A4%A')).toEqual([]);
    });
    test('drops bad ids, de-duplicates, and caps the list', () => {
        expect(parseShareHash('#/s/ab1,,ab1,bad id,ab2')).toEqual(['ab1', 'ab2']);
        const many = Array.from({ length: 50 }, (_, i) => `id${i}`).join(',');
        expect(parseShareHash(`#/s/${many}`)).toHaveLength(30);
    });
});

describe('building links', () => {
    test('hash and full url round-trip through parseShareHash', () => {
        expect(buildShareHash(['ab1', 'ab2'])).toBe(`${SHARE_PREFIX}ab1,ab2`);
        const loc = { origin: 'https://x.github.io', pathname: '/jainism/pooja/', search: '?sw=on', hash: '#old' };
        const url = buildShareUrl(loc, ['ab1']);
        expect(url).toBe('https://x.github.io/jainism/pooja/#/s/ab1');
        expect(parseShareHash(new URL(url).hash)).toEqual(['ab1']);
    });
});

describe('resolveShared', () => {
    test('an item id gives the whole item', () => {
        const d = data();
        const { items, missing } = resolveShared(d, ['aa1']);
        expect(items).toEqual([d[1]]);
        expect(items[0].blocks).toHaveLength(3);
        expect(missing).toEqual([]);
    });
    test('a block id gives its item holding only that block (same block object)', () => {
        const d = data();
        const { items } = resolveShared(d, ['ab2']);
        expect(items).toHaveLength(1);
        expect(items[0].id).toBe('aa1');
        expect(items[0].references).toEqual(['qa1']);
        expect(items[0].blocks).toEqual([d[1].blocks[1]]);
        expect(items[0].blocks[0]).toBe(d[1].blocks[1]);
        expect(d[1].blocks).toHaveLength(3);          // original untouched
    });
    test('several blocks of one item share one card, in book order; an item id wins over its blocks', () => {
        const d = data();
        expect(resolveShared(d, ['ab3', 'ab1']).items[0].blocks.map(b => b.id)).toEqual(['ab1', 'ab3']);
        expect(resolveShared(d, ['ab1', 'aa1']).items[0].blocks).toHaveLength(3);
    });
    test('items come back in book order, and unknown ids are reported, not fatal', () => {
        const { items, missing } = resolveShared(data(), ['ib1', 'qa1', 'nope']);
        expect(items.map(i => i.id)).toEqual(['qa1', 'ia1']);
        expect(missing).toEqual(['nope']);
        expect(resolveShared(data(), ['nope']).items).toEqual([]);
    });
});

describe('shareTarget', () => {
    test('describes a block: its label, its item, and how many blocks the item has', () => {
        expect(shareTarget(data(), 'ab2')).toEqual({
            itemId: 'aa1', blockId: 'ab2', blockLabel: 'S-3.2', itemLabel: 'A-3', itemWord: 'answer', blockCount: 3,
        });
    });
    test('an item id has no block; an answer takes its question\'s number', () => {
        expect(shareTarget(data(), 'aa1')).toMatchObject({ itemId: 'aa1', blockId: null, blockLabel: null, itemLabel: 'A-3' });
        expect(shareTarget(data(), 'qa1')).toMatchObject({ itemWord: 'question', itemLabel: 'Q-3' });
        expect(shareTarget(data(), 'ia1')).toMatchObject({ itemWord: 'item' });
    });
    test('unknown id gives null', () => {
        expect(shareTarget(data(), 'nope')).toBeNull();
    });
});
