// app.js — Entry point. Composes all modules.
// Loaded via <script type="module" src="app.js"> in index.html.

import { renderContinuousView, filterContinuous, goBackToMessage } from './continuous-view.js';
import { createBookView, setViewMode } from './book-view.js';
import { initHeaderControls, applyDisplaySettings, updateMediaVisibility } from './header.js';

/**
 * Initialize the FAQ continuous/book view.
 * Loads persisted settings, initializes header controls, fetches data,
 * renders the continuous view, attaches listeners, and sets up view toggle.
 */
async function initFaqBookView() {
    // Restore saved settings before first render
    applyDisplaySettings();

    // Fetch FAQ data
    let data;
    try {
        const response = await fetch('data.json');
        data = await response.json();
    } catch (error) {
        console.error('Error loading data:', error);
        return;
    }

    const container = document.getElementById('continuous-container');
    const langSelect = document.getElementById('lang-select');
    const lang = langSelect ? langSelect.value : 'all';

    // Initialize header controls with callbacks
    initHeaderControls(
        // onLanguageChange
        (newLang) => {
            renderContinuousView(data, container, newLang);
            updateMediaVisibility();
        },
        // onReadToggle — re-render to show/hide tick marks
        () => {
            renderContinuousView(data, container, langSelect ? langSelect.value : 'all');
        }
    );

    // Initial render
    renderContinuousView(data, container, lang);

    // Build book view (hidden by default)
    createBookView(data);

    // Ensure media visibility applies to newly-rendered elements
    updateMediaVisibility();

    // Apply saved view mode (default: continuous)
    const savedMode = localStorage.getItem('viewMode') || 'continuous';
    setViewMode(savedMode);

    // Set up view toggle buttons
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            setViewMode(btn.dataset.view);
        });
    });

    // Back-to-message button
    const backBtn = document.getElementById('back-to-message');
    if (backBtn) backBtn.onclick = goBackToMessage;

    // Search bar
    const searchBar = document.getElementById('search-bar');
    if (searchBar) {
        searchBar.addEventListener('keyup', () => {
            filterContinuous(searchBar.value);
        });
    }

    // Restore scroll position after render
    setTimeout(() => {
        const savedPosition = localStorage.getItem('scrollPosition');
        if (savedPosition) {
            window.scrollTo(0, parseInt(savedPosition));
        }
    }, 100);
}

// Save scroll position periodically
window.addEventListener('scroll', () => {
    localStorage.setItem('scrollPosition', window.scrollY);
});

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFaqBookView);
} else {
    initFaqBookView();
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, { initFaqBookView });
}
