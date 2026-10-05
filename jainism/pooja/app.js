// app.js — Entry point. Composes all modules.
// Loaded via <script type="module" src="app.js"> in index.html.
// Both views share the same header; settings apply to whichever view is active.

import { renderContinuousView, filterContinuous, goBackToMessage } from './views/continuous/continuous-view.js';
import { initBookView, onBookLangChange, applyBookMediaVisibility, searchBookView } from './views/book/book-view.js';
import { initHeaderControls, applySettings, updateMediaVisibility, getActiveLangs, applyPaperSize } from './header/header.js';
import { initHomeControls, refreshHomeView } from './home/home.js';

let data;
const continuous = () => document.getElementById('continuous-container');

// ── Home (landing page) ──────────────────────────────────────────────────
// Home is not a third value of viewMode — book/continuous stay the only
// two states that get remembered, and print/title logic only ever sees
// those. Home is just an extra layer shown on top: visible at boot and
// whenever the header's icon is clicked, hidden the moment either real
// view is opened.
//
// currentScreen tracks what's on screen *right now*, in memory — used to
// scope the scroll listener below so Home/book scrolling never overwrites
// continuous view's saved scroll position (see that listener's comment).
let currentScreen = null;

// Every place that changes which of the three areas (home/book/continuous)
// is visible goes through this one function, so there is exactly one
// source of truth for "what's on screen right now" — no separate
// show/hide pair that can fall out of sync with each other.
function setActiveScreen(screen) {
    currentScreen = screen;

    const home = document.getElementById('home-view');
    const book = document.getElementById('book-container');
    const cont = document.getElementById('continuous-container');
    if (home) home.style.display = screen === 'home' ? 'block' : 'none';
    if (book) book.style.display = screen === 'book' ? 'flex' : 'none';
    if (cont) cont.style.display = screen === 'continuous' ? 'flex' : 'none';
    if (screen === 'home') refreshHomeView();

    // Selected-state for the nav row: the Home icon and the Book/Continuous
    // toggle buttons are mutually exclusive, so this is the one place that
    // decides which (if any) looks selected — same reasoning as the rest
    // of this function: one source of truth instead of each caller having
    // to remember to update it themselves.
    document.getElementById('home-btn')?.classList.toggle('active', screen === 'home');
    document.querySelectorAll('.view-toggle-btn').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.view === screen)
    );

    // What to restore on the *next* reload is "whatever screen is showing
    // right now" — including Home — which is NOT the same thing as
    // `viewMode` below (that only ever holds book/continuous, for
    // print/title formatting, and deliberately never changes just because
    // Home was opened). Conflating the two was the bug: clicking the Home
    // icon left `viewMode` pointing at whichever real view was open
    // before, so a reload from Home jumped straight back into that view
    // instead of staying on Home.
    localStorage.setItem('lastScreen', screen);
}
function showHome() { setActiveScreen('home'); }

// ── View mode ─────────────────────────────────────────────────────────────
function setViewMode(mode) {
    const book       = document.getElementById('book-container');
    const backBtn    = document.getElementById('back-to-message');

    const isBook = mode === 'book';

    // Visibility of home/book/continuous all goes through setActiveScreen —
    // this just adds the view-specific bits (the .active class some CSS
    // hooks off, title/stylesheet swaps, remembering the choice).
    setActiveScreen(mode);

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

    // The .active class on the toggle buttons/Home icon is already handled
    // by setActiveScreen() above — nothing more to do here.
    localStorage.setItem('viewMode', mode);

    // The printed page's orientation follows whichever view is active (book
    // = landscape spread, continuous = portrait column); re-derive the
    // dynamic @page rule now that viewMode has just changed.
    applyPaperSize();
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

    // ── Home surface — the landing page, not a third view state ────────────
    initHomeControls(data);
    document.getElementById('home-btn')?.addEventListener('click', showHome);
    document.getElementById('home-open-book')?.addEventListener('click', () => activateView('book'));
    document.getElementById('home-open-continuous')?.addEventListener('click', () => activateView('continuous'));

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

    // ── Activate the initial screen ──────────────────────────────────────
    // Restore whatever screen — including Home — was showing before the
    // reload, via `lastScreen` (set by every setActiveScreen() call, so it
    // always reflects reality, Home included). This is deliberately NOT
    // `viewMode`: that only ever holds book/continuous and is never
    // touched by visiting Home, so using it here was the earlier bug —
    // refreshing while on Home jumped straight into whichever real view
    // had been open before, because `viewMode` still pointed at it.
    const lastScreen = localStorage.getItem('lastScreen');
    if (lastScreen === 'book' || lastScreen === 'continuous') {
        activateView(lastScreen);
    } else {
        showHome();
    }
}

// Only save scroll position while continuous view is actually the active
// screen. This listener is global (continuous view's own content isn't
// its own scroll container, the window is), so without this guard, simply
// visiting Home — whose content is short, so the window sits near scrollY
// 0 — fired this same listener and overwrote continuous view's saved
// position with 0, even though continuous view itself was never touched.
// That silently destroyed the position the moment you opened Home, well
// before any reload; the reload just revealed the damage already done.
window.addEventListener('scroll', () => {
    if (currentScreen === 'continuous') {
        localStorage.setItem('scrollPosition', window.scrollY);
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
