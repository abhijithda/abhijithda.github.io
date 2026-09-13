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
// size+orientation is written as text into the #print-page-size <style>
// element (orientation follows whichever view is currently active — book is
// a landscape two-page spread, continuous is a portrait single column).

import { loadSettings, saveSettings, PAPER_SIZES } from './settings.js';
import { notifyLayoutChanged } from './layout-signal.js';

export { PAPER_SIZES };

export function applyPaperSize() {
    const { paperSize } = loadSettings();

    if (document.body) document.body.dataset.paperSize = paperSize;

    const select = document.getElementById('paper-size-select');
    if (select) select.value = paperSize;

    const printSize   = paperSize === 'a3' ? 'A3' : 'A4';
    const mode        = (typeof localStorage !== 'undefined' && localStorage.getItem('viewMode')) || 'book';
    const orientation = mode === 'book' ? 'landscape' : 'portrait';

    const pageStyle = document.getElementById('print-page-size');
    if (pageStyle) pageStyle.textContent = `@page { size: ${printSize} ${orientation}; margin: 15mm; }`;

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
