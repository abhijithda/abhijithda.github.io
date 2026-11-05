const { bookletOrder, defaultOutPath } = require('./impose-booklet');

// Pages are 0-based here; the comments use the 1-based numbers a reader sees.
describe('bookletOrder (saddle-stitch imposition)', () => {
    test('8 pages: 8|1, 2|7, 6|3, 4|5', () => {
        const { sides, sheets, signatures } = bookletOrder(8);
        expect(sides).toEqual([[7, 0], [1, 6], [5, 2], [3, 4]]);
        expect(sheets).toBe(2);
        expect(signatures).toBe(1);
    });

    test('4 pages: 4|1 then 2|3', () => {
        expect(bookletOrder(4).sides).toEqual([[3, 0], [1, 2]]);
    });

    test('a page count that is not a multiple of 4 is padded with blanks at the end', () => {
        // 6 pages -> 8: pages 7 and 8 are blank
        const { sides, paddedPages } = bookletOrder(6);
        expect(paddedPages).toBe(8);
        expect(sides).toEqual([[null, 0], [1, null], [5, 2], [3, 4]]);
    });

    test('every real page appears exactly once, blanks fill the rest, for many lengths', () => {
        for (let n = 1; n <= 70; n++) {
            for (const sps of [undefined, 0, 1, 2, 4, 5]) {
                const { sides, paddedPages, sheets } = bookletOrder(n, sps);
                expect(sides.length).toBe(sheets * 2);
                const flat = sides.flat();
                const real = flat.filter(p => p !== null).sort((a, b) => a - b);
                expect(real).toEqual([...Array(n).keys()]);
                expect(flat.length).toBe(paddedPages);
                expect(paddedPages % 4).toBe(0);
                expect(paddedPages - n).toBeLessThan(4);
            }
        }
    });

    test('odd book pages always land on the right-hand half of a sheet side (recto), even pages on the left', () => {
        // Matters because the book CSS gives right pages their wide binding margin on the LEFT.
        for (const n of [8, 24, 34, 61]) {
            for (const [left, right] of bookletOrder(n).sides) {
                if (left !== null) expect((left + 1) % 2).toBe(0);    // 1-based even
                if (right !== null) expect((right + 1) % 2).toBe(1);  // 1-based odd
            }
        }
    });

    test('auto: up to 24 pages is one stack; longer books split into 16-page signatures', () => {
        expect(bookletOrder(24).signatures).toBe(1);
        const long = bookletOrder(44);
        expect(long.signatures).toBe(3);          // 16 + 16 + 12
        expect(long.paddedPages).toBe(44);        // no padding needed: 44 is a multiple of 4
        // pages never mix between signatures
        const firstSig = long.sides.slice(0, 8).flat().filter(p => p !== null);
        expect(Math.max(...firstSig)).toBe(15);
    });

    test('sheetsPerSignature = 0 forces a single stack however long the book is', () => {
        expect(bookletOrder(60, 0).signatures).toBe(1);
    });

    test('rejects an empty book', () => {
        expect(() => bookletOrder(0)).toThrow();
    });
});

describe('defaultOutPath', () => {
    test('Book -> Booklet in the file name, same folder', () => {
        expect(defaultOutPath('/x/Pooja-Book-A4-2026-11-03.pdf')).toBe('/x/Pooja-Booklet-A4-2026-11-03.pdf');
    });
    test('other names get a -booklet suffix', () => {
        expect(defaultOutPath('/x/mybook.pdf')).toBe('/x/mybook-booklet.pdf');
    });
});
