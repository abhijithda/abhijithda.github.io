// core/layout-signal.js — A tiny shared signal: some settings (paper
// size, font scale) change the *physical dimensions* book view paginates
// against, but book view only re-measures on the browser's native 'resize'
// event — a CSS/attribute change alone doesn't fire one. notifyLayoutChanged()
// fires a custom 'pooja:layout-changed' event that book-view.js listens for
// alongside 'resize', so those changes reliably re-trigger its pagination
// re-measure too.
//
// Kept as its own tiny module — rather than paper-size.js and font-scale.js
// each importing book-view.js directly, or header.js doing so — so header/
// stays decoupled from view internals: it only knows it needs to announce
// "a layout-affecting setting changed", not who's listening or why.
export function notifyLayoutChanged() {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new Event('pooja:layout-changed'));
    }
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, { notifyLayoutChanged });
}
