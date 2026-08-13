// app.js — Entry point. Composes all modules.
// Both views share the same header; settings apply to whichever view is active.

import { renderContinuousView, filterContinuous, goBackToMessage } from './continuous-view.js';
import { initBookView, onBookLangChange, applyBookMediaVisibility, searchBookView } from './book-view.js';
import { initHeaderControls, applyDisplaySettings, updateMediaVisibility, getActiveLangs } from './header.js';

// ── View mode ─────────────────────────────────────────────────────────────
function setViewMode(mode) {
    const continuous = document.getElementById('continuous-container');
    const book = document.getElementById('book-container');
    const backBtn = document.getElementById('back-to-message');

    const isBook = mode === 'book';
    if (continuous) continuous.style.display = isBook ? 'none' : 'flex';
    if (book) book.classList.toggle('active', isBook);
    if (backBtn && isBook) backBtn.style.display = 'none';

    // Swap view-specific stylesheets — each view only loads its own CSS.
    // card-types.css stays loaded always (scoped selectors handle both).
    const cssContinuous = document.getElementById('css-continuous');
    const cssBook = document.getElementById('css-book');
    if (cssContinuous) cssContinuous.disabled = isBook;
    if (cssBook) cssBook.disabled = !isBook;

    document.querySelectorAll('.view-toggle-btn').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.view === mode)
    );

    localStorage.setItem('viewMode', mode);
}

// ── Boot ──────────────────────────────────────────────────────────────────
async function init() {
    applyDisplaySettings();

    let data;
    try {
        data = await fetch('data.json').then(r => r.json());
    } catch (err) {
        console.error('Error loading FAQ data:', err);
        return;
    }

    const continuous = document.getElementById('continuous-container');
    const activeLangs = getActiveLangs(); // restored from localStorage

    // ── Continuous view ───────────────────────────────────────────────────
    // Continuous view uses the first active lang ('kn', 'en', or 'all').
    // When multiple langs are selected, it shows 'all'.
    const continuousLang = activeLangs.length === 1 ? activeLangs[0] : 'all';
    renderContinuousView(data, continuous, continuousLang);
    updateMediaVisibility();

    // ── Book view ─────────────────────────────────────────────────────────
    initBookView(data, activeLangs);

    // ── Header controls — shared by both views ────────────────────────────
    initHeaderControls(
        // Lang change: update both views
        (newActiveLangs) => {
            const cLang = newActiveLangs.length === 1 ? newActiveLangs[0] : 'all';
            renderContinuousView(data, continuous, cLang);
            updateMediaVisibility();
            onBookLangChange(newActiveLangs);
        },
        // Read-tracking toggle — no re-render needed (CSS class handles visibility)
        () => { },
    );

    // Media toggles also refresh book view
    ['toggle-videos', 'toggle-qrs'].forEach(id => {
        document.getElementById(id)
            ?.addEventListener('change', applyBookMediaVisibility);
    });

    // ── View toggle ───────────────────────────────────────────────────────
    document.querySelectorAll('.view-toggle-btn').forEach(btn =>
        btn.addEventListener('click', () => setViewMode(btn.dataset.view))
    );

    // ── Search — works in both views ──────────────────────────────────────
    const searchBar = document.getElementById('search-bar');
    if (searchBar) {
        searchBar.addEventListener('keyup', () => {
            const q = searchBar.value;
            const mode = localStorage.getItem('viewMode') || 'continuous';
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

    // ── Restore view mode ─────────────────────────────────────────────────
    setViewMode(localStorage.getItem('viewMode') || 'continuous');
}

window.addEventListener('scroll', () => {
    localStorage.setItem('scrollPosition', window.scrollY);
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
