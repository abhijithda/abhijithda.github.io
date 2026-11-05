// core/paper-size.js — Paper size (Dynamic / A4 / A3): applying it to the
// DOM (both views' on-screen sizing and the printed @page rule) and wiring
// the Settings dropdown control. Persistence goes through the single
// unified settings object in settings.js, not a store of its own.
//
// Continuous view: a live width cap previewing print width only — no real
// pagination (no page numbers/breaks on screen). Book view: real physical
// pagination — page dimensions and count actually change (see
// views/book/book-view.css). Both read the same `data-paper-size` attribute
// on <body>, set here.
//
// Print is handled separately from screen sizing: a printer can't be handed
// "whatever fits your screen", so 'dynamic' always prints as A4, same as an
// explicit 'a4' choice — only 'a3' changes the printed sheet. Since @page
// can't be scoped to a class/attribute selector in plain CSS, the effective
// @page rules are written as text into the #print-page-size <style> element.
//
//   Continuous: one portrait A4/A3 page per printed page, 15mm margins.
//
//   Book: the paper size is the SHEET you will print on and fold, and a book
//   page is half a sheet — A4 sheet -> A5 portrait pages, A3 sheet -> A4
//   portrait pages. Every printed page is ONE book page, so Chrome's page
//   counter is the real page number (printed bottom-centre, hidden on the
//   title page), and @page :right / :left give mirrored margins with a wider
//   inner (binding) margin. scripts/impose-booklet.js then arranges those
//   pages onto sheets in booklet order for folding. (The old print put two
//   book pages side by side on a landscape sheet; CSS can only count sheets,
//   so real page numbers were impossible, and the PDF didn't fold into a book.)

import { loadSettings, saveSettings, PAPER_SIZES } from './settings.js';
import { notifyLayoutChanged } from './layout-signal.js';

export { PAPER_SIZES };

// Book page geometry per sheet size (mm). top + bottom always leave the same
// usable height the print CSS's photo caps are written against: 180mm on an A5
// page, 267mm on an A4 page. `inner` is the binding side.
const BOOK_PAGE = {
    a4: { size: 'A5 portrait', top: 12, bottom: 18, inner: 17, outer: 11 },
    a3: { size: 'A4 portrait', top: 14, bottom: 16, inner: 19, outer: 13 },
};

/**
 * The @page rules for a paper size and view. Exported for tests.
 * 'dynamic' prints exactly like 'a4'.
 */
export function buildPageCss(paperSize, mode) {
    const sheet = paperSize === 'a3' ? 'a3' : 'a4';

    if (mode !== 'book') {
        return `@page { size: ${sheet === 'a3' ? 'A3' : 'A4'} portrait; margin: 15mm; }`;
    }

    const g = BOOK_PAGE[sheet];
    // Chrome numbers the first page :right (recto), so right pages have their
    // inner margin on the left and left pages on the right.
    return [
        `@page { size: ${g.size}; margin: ${g.top}mm ${g.outer}mm ${g.bottom}mm ${g.inner}mm; }`,
        `@page :left { margin: ${g.top}mm ${g.inner}mm ${g.bottom}mm ${g.outer}mm; }`,
        `@page { @bottom-center { content: counter(page); font: 9pt Arial, sans-serif; color: #555; } }`,
        `@page :first { @bottom-center { content: none; } }`,
    ].join('\n');
}

export function applyPaperSize() {
    const { paperSize } = loadSettings();

    if (document.body) document.body.dataset.paperSize = paperSize;

    const select = document.getElementById('paper-size-select');
    if (select) select.value = paperSize;

    const mode = (typeof localStorage !== 'undefined' && localStorage.getItem('viewMode')) || 'book';

    const pageStyle = document.getElementById('print-page-size');
    if (pageStyle) pageStyle.textContent = buildPageCss(paperSize, mode);

    notifyLayoutChanged();
    return paperSize;
}

export function initPaperSizeControl() {
    const select = document.getElementById('paper-size-select');
    if (select) {
        select.addEventListener('change', () => {
            saveSettings({ paperSize: select.value });
            applyPaperSize();
        });
    }
    applyPaperSize();
}

// Note: no manual CommonJS re-export shim here — babel's ESM→CJS transform
// (see babel.config.js) already produces working `exports.X` bindings for
// every named export, including re-exports; a duplicate manual
// Object.assign(module.exports, {...}) throws on re-exported bindings
// specifically (they compile to getter-only properties), so unlike the
// view modules' plain-locally-declared exports, this file relies on
// babel's transform alone.
