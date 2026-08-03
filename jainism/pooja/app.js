// app.js — Entry point. Composes modules.
// Loaded via <script type="module" src="app.js"> in index.html.
// book-view.js is a future addition — import and wire it here when ready.

import { renderContinuousView, filterContinuous, goBackToMessage } from './continuous-view.js';
import { initHeaderControls, applyDisplaySettings, updateMediaVisibility } from './header.js';

function setViewMode(mode) {
    const continuous = document.getElementById('continuous-container');
    if (continuous) continuous.style.display = (mode === 'continuous') ? 'flex' : 'none';
    // book container: wire up here when book-view.js is added
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === mode);
    });
    localStorage.setItem('viewMode', mode);
}

async function init() {
    // Restore saved settings before reading lang (so langSelect.value is correct)
    applyDisplaySettings();

    let data;
    try {
        data = await fetch('data.json').then(r => r.json());
    } catch (err) {
        console.error('Error loading data:', err);
        return;
    }

    const container  = document.getElementById('continuous-container');
    const langSelect = document.getElementById('lang-select');
    const lang       = langSelect ? langSelect.value : 'all';

    // Wire header controls
    initHeaderControls(
        (newLang) => {
            renderContinuousView(data, container, newLang);
            updateMediaVisibility();
        },
    );

    // Initial continuous view render
    renderContinuousView(data, container, lang);
    updateMediaVisibility();

    // View toggle buttons
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => setViewMode(btn.dataset.view));
    });

    // Back button
    const backBtn = document.getElementById('back-to-message');
    if (backBtn) backBtn.onclick = goBackToMessage;

    // Search
    const searchBar = document.getElementById('search-bar');
    if (searchBar) searchBar.addEventListener('keyup', () => filterContinuous(searchBar.value));

    // Restore scroll position
    setTimeout(() => {
        const saved = localStorage.getItem('scrollPosition');
        if (saved) window.scrollTo(0, parseInt(saved));
    }, 100);

    // Apply saved view mode
    const savedMode = localStorage.getItem('viewMode') || 'continuous';
    setViewMode(savedMode);
}

// Save scroll position
window.addEventListener('scroll', () => {
    localStorage.setItem('scrollPosition', window.scrollY);
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
