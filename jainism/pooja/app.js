// app.js — Entry point. Composes all modules.
// Loaded via <script type="module" src="app.js"> in index.html.
// Both views share the same header; settings apply to whichever view is active.

import { renderContinuousView, filterContinuous, goBackToMessage } from './views/continuous/continuous-view.js';
import { initBookView, onBookLangChange, applyBookMediaVisibility, searchBookView } from './views/book/book-view.js';
import { initHeaderControls, applySettings, updateMediaVisibility, getActiveLangs } from './header/header.js';

let data;
const continuous = () => document.getElementById('continuous-container');

// ── View mode ─────────────────────────────────────────────────────────────
function setViewMode(mode) {
    const continuous = document.getElementById('continuous-container');
    const book       = document.getElementById('book-container');
    const backBtn    = document.getElementById('back-to-message');

    const isBook = mode === 'book';
    
    // Explicitly toggle inline display for BOTH containers so they stay hidden 
    // even when their respective CSS stylesheets are disabled!
    if (continuous) continuous.style.display = isBook ? 'none' : 'flex';
    if (book)       book.style.display = isBook ? 'flex' : 'none';

    if (book)       book.classList.toggle('active', isBook);
    if (backBtn && isBook) backBtn.style.display = 'none';

    // Swap view-specific stylesheets
    const cssContinuous = document.getElementById('css-continuous');
    const cssBook       = document.getElementById('css-book');
    if (cssContinuous) cssContinuous.disabled = isBook;
    if (cssBook)       cssBook.disabled       = !isBook;

    // Dynamically swap the <title> for perfect printing!
    if (isBook) {
        // Book View (Landscape): Uses Unicode Em Spaces (\u2003) to push English to the right
        document.title = "ಜೈನ ಪೂಜಾ ವಿಚಾರ ಸಂಕಲನ \u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003 Jaina Pooja Vichara Sankalana";
    } else {
        // Continuous View (Portrait): Uses a clean pipe separator for narrower paper
        document.title = "ಜೈನ ಪೂಜಾ ವಿಚಾರ ಸಂಕಲನ | Jaina Pooja Vichara Sankalana";
    }

    document.querySelectorAll('.view-toggle-btn').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.view === mode)
    );

    localStorage.setItem('viewMode', mode);
}

// Renders whichever view is being switched TO, using current data/settings,
// then makes it visible. Used both for the initial view on boot and for
// every subsequent toggle click — there's exactly one render path, not a
// separate "eager render both at boot" step plus a second "re-render on
// switch" step. Rendering the OTHER view eagerly at boot used to be needed
// because nothing else kept a not-yet-opened view in sync; now that
// switching always re-renders fresh, that eager work was just being
// thrown away and rebuilt the moment (if ever) the user opened it.
function activateView(mode) {
    const activeLangs = getActiveLangs();
    if (mode === 'book') {
        initBookView(data, activeLangs);
    } else {
        const cLang = activeLangs.length === 1 ? activeLangs[0] : 'all';
        renderContinuousView(data, continuous(), cLang);
        updateMediaVisibility();
    }
    setViewMode(mode);
}

// ── Boot ──────────────────────────────────────────────────────────────────
async function init() {
    // Restore saved settings (langs/videos/QR/read-tracking all live under one key)
    applySettings();

    try {
        data = await fetch('data.json').then(r => r.json());
    } catch (err) {
        console.error('Error loading data:', err);
        return;
    }

    // ── Header controls — shared by both views ────────────────────────────
    initHeaderControls(
        // Lang change: update both views. Only the currently-visible one
        // needs re-rendering now (not-yet-opened views pick up the new
        // lang the same way they pick up everything else — the first time
        // they're activated).
        (newActiveLangs) => {
            const mode = localStorage.getItem('viewMode') || 'book';
            if (mode === 'book') {
                onBookLangChange(newActiveLangs);
            } else {
                const cLang = newActiveLangs.length === 1 ? newActiveLangs[0] : 'all';
                renderContinuousView(data, continuous(), cLang);
                updateMediaVisibility();
            }
        },
        // Read-tracking toggle — no re-render needed (CSS class handles visibility)
        () => {},
    );

    // Media toggles also refresh book view (safe even if book hasn't been
    // opened yet — it just no-ops over an empty #book-container).
    ['toggle-videos', 'toggle-qrs'].forEach(id => {
        document.getElementById(id)
            ?.addEventListener('change', applyBookMediaVisibility);
    });

    // ── View toggle ───────────────────────────────────────────────────────
    document.querySelectorAll('.view-toggle-btn').forEach(btn =>
        btn.addEventListener('click', () => activateView(btn.dataset.view))
    );

    // ── Search — works in both views ──────────────────────────────────────
    const searchBar = document.getElementById('search-bar');
    if (searchBar) {
        searchBar.addEventListener('keyup', () => {
            const q = searchBar.value;
            const mode = localStorage.getItem('viewMode') || 'book';
            if (mode === 'book') {
                searchBookView(q);   // jumps to first matching spread
            } else {
                filterContinuous(q); // hides non-matching cards
            }
        });
    }

    // ── Back button (continuous view) ─────────────────────────────────────
    const backBtn = document.getElementById('back-to-message');
    if (backBtn) backBtn.onclick = goBackToMessage;

    // ── Restore scroll position (continuous view) ─────────────────────────
    setTimeout(() => {
        const saved = localStorage.getItem('scrollPosition');
        if (saved) window.scrollTo(0, parseInt(saved));
    }, 100);

    // ── Activate the initial view ────────────────────────────────────────
    activateView(localStorage.getItem('viewMode') || 'book');
}

window.addEventListener('scroll', () => {
    localStorage.setItem('scrollPosition', window.scrollY);
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
