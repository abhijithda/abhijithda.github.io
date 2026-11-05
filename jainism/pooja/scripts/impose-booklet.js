#!/usr/bin/env node
// scripts/impose-booklet.js — Arranges a PDF of single book pages onto sheets
// in booklet order, so the printed sheets can be folded in half into a book.
//
// Why this exists: the Book PDFs are one book page per PDF page (A4-sheet
// version = A5 pages, A3-sheet version = A4 pages) with real page numbers and
// mirrored binding margins. A book is not printed in reading order, though:
// the outer sheet of an 8-page booklet carries pages 8|1 on its front and
// 2|7 on its back, the next sheet 6|3 and 4|5, and so on. This script does
// that rearranging ("imposition").
//
// Usage:
//   node scripts/impose-booklet.js <book.pdf> [out.pdf] [--sheets-per-signature=N]
//
// Printing the result: double-sided, "flip on SHORT edge", 100% / actual size
// (no "fit to page"), then fold the stack in half. A single stack of sheets
// (saddle stitch: staples through the fold) is fine up to about 6-8 sheets
// (24-32 pages). Past that the fold gets too thick, so by default longer books
// are split into signatures of 4 sheets (16 pages): fold and nest each
// signature separately, then sew or glue the signatures together at the spine
// ("perfect binding" / "sewn signatures"). Use --sheets-per-signature=N to
// choose another size (0 = one single stack no matter how long).
//
// Page counts that aren't a multiple of 4 are padded with blank pages at the
// end of the last signature.

const fs = require('fs');
const path = require('path');

// Standard sheet sizes in PDF points (1/72 in), landscape.
const A4_LANDSCAPE = [841.89, 595.28];
const A3_LANDSCAPE = [1190.55, 841.89];

const AUTO_SINGLE_STACK_MAX_SHEETS = 6;   // up to 24 pages: one stack
const AUTO_SIGNATURE_SHEETS = 4;          // longer: signatures of 16 pages

/**
 * Pure page-ordering logic (exported for tests).
 *
 * @param {number} pageCount   number of pages in the source PDF
 * @param {number} sheetsPerSignature  0 = single stack, undefined = auto
 * @returns {{sides: Array<[number|null, number|null]>, signatures: number,
 *            paddedPages: number, sheets: number}}
 *   `sides` lists every printed side in print order (front, back, front,
 *   back, ...) as [leftPageIndex, rightPageIndex] (0-based; null = blank).
 */
function bookletOrder(pageCount, sheetsPerSignature) {
    if (!Number.isInteger(pageCount) || pageCount < 1) {
        throw new Error('bookletOrder: pageCount must be a positive integer');
    }

    let perSig;
    if (sheetsPerSignature === undefined) {
        const totalSheets = Math.ceil(pageCount / 4);
        perSig = totalSheets <= AUTO_SINGLE_STACK_MAX_SHEETS ? pageCount : AUTO_SIGNATURE_SHEETS * 4;
    } else if (sheetsPerSignature === 0) {
        perSig = pageCount;
    } else {
        perSig = sheetsPerSignature * 4;
    }

    const sides = [];
    let signatures = 0;
    let paddedPages = 0;

    for (let start = 0; start < pageCount; start += perSig) {
        const len = Math.min(perSig, pageCount - start);
        const padded = Math.ceil(len / 4) * 4;
        signatures++;
        paddedPages += padded;
        const at = i => (i < len ? start + i : null);   // blank when past the end

        for (let s = 0; s < padded / 4; s++) {
            // Saddle-stitch imposition: outermost sheet first.
            sides.push([at(padded - 1 - 2 * s), at(2 * s)]);          // front: last-ish | first-ish
            sides.push([at(2 * s + 1), at(padded - 2 - 2 * s)]);      // back
        }
    }

    return { sides, signatures, paddedPages, sheets: sides.length / 2 };
}

function sheetSizeFor(pageW, pageH) {
    const near = (a, b) => Math.abs(a - b) < 4;
    if (near(pageH, 595.28)) return A4_LANDSCAPE;   // A5 portrait pages (595pt tall) -> A4 sheet
    if (near(pageH, 841.89)) return A3_LANDSCAPE;   // A4 portrait pages (842pt tall) -> A3 sheet
    return [pageW * 2, pageH];                      // anything else: exactly two pages wide
}

async function imposeBooklet(inPath, outPath, { sheetsPerSignature } = {}) {
    const { PDFDocument } = require('pdf-lib');   // lazy: only needed when imposing

    const srcBytes = fs.readFileSync(inPath);
    const src = await PDFDocument.load(srcBytes);
    const pageCount = src.getPageCount();
    const { width: pageW, height: pageH } = src.getPage(0).getSize();

    const out = await PDFDocument.create();
    // pdf-lib embeds only the FIRST page unless told which pages, so list them all.
    const embedded = await out.embedPdf(srcBytes, src.getPageIndices());

    const [sheetW, sheetH] = sheetSizeFor(pageW, pageH);
    const plan = bookletOrder(pageCount, sheetsPerSignature);
    const y = (sheetH - pageH) / 2;

    for (const [left, right] of plan.sides) {
        const side = out.addPage([sheetW, sheetH]);
        // Pages meet exactly at the centre line (the fold).
        if (left !== null) side.drawPage(embedded[left], { x: sheetW / 2 - pageW, y, width: pageW, height: pageH });
        if (right !== null) side.drawPage(embedded[right], { x: sheetW / 2, y, width: pageW, height: pageH });
    }

    const title = src.getTitle();
    if (title) out.setTitle(`${title} — booklet (print double-sided, flip on short edge)`);
    fs.writeFileSync(outPath, await out.save());

    return { pages: pageCount, ...plan };
}

function defaultOutPath(inPath) {
    const dir = path.dirname(inPath);
    const base = path.basename(inPath, '.pdf');
    return path.join(dir, base.includes('-Book-') ? `${base.replace('-Book-', '-Booklet-')}.pdf` : `${base}-booklet.pdf`);
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const flag = args.find(a => a.startsWith('--sheets-per-signature='));
    const files = args.filter(a => !a.startsWith('--'));
    if (files.length < 1) {
        console.error('Usage: node scripts/impose-booklet.js <book.pdf> [out.pdf] [--sheets-per-signature=N]');
        process.exit(1);
    }
    const [inPath, outArg] = files;
    const outPath = outArg || defaultOutPath(inPath);
    const sheetsPerSignature = flag ? Number(flag.split('=')[1]) : undefined;
    if (flag && (!Number.isInteger(sheetsPerSignature) || sheetsPerSignature < 0)) {
        console.error('--sheets-per-signature must be 0 (single stack) or a positive whole number');
        process.exit(1);
    }

    imposeBooklet(inPath, outPath, { sheetsPerSignature }).then(r => {
        console.log(`${path.basename(outPath)}: ${r.pages} pages -> ${r.sheets} sheets` +
            ` in ${r.signatures} signature${r.signatures > 1 ? 's' : ''}` +
            (r.paddedPages > r.pages ? ` (+${r.paddedPages - r.pages} blank page${r.paddedPages - r.pages > 1 ? 's' : ''})` : ''));
    }).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { bookletOrder, imposeBooklet, defaultOutPath };
