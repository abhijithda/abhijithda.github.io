// header.js — Header UI management: language, video/QR toggles, read-tracking.
// Persists and restores display settings via localStorage.

export const DISPLAY_SETTINGS_KEY = 'displaySettings';

/**
 * Save current display settings to localStorage.
 */
export function saveDisplaySettings() {
    const langSelect = document.getElementById('lang-select');
    const toggleVideos = document.getElementById('toggle-videos');
    const toggleQrs = document.getElementById('toggle-qrs');
    const toggleReadTracking = document.getElementById('toggle-read-tracking');

    const settings = {
        lang: langSelect ? langSelect.value : 'all',
        videos: toggleVideos ? toggleVideos.checked : true,
        qrs: toggleQrs ? toggleQrs.checked : false,
        readTracking: toggleReadTracking ? toggleReadTracking.checked : false,
    };
    localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Load saved display settings from localStorage.
 * @returns {Object}
 */
export function loadDisplaySettings() {
    try {
        return JSON.parse(localStorage.getItem(DISPLAY_SETTINGS_KEY)) || {};
    } catch (e) {
        return {};
    }
}

/**
 * Apply saved settings to the control elements before first render.
 */
export function applyDisplaySettings() {
    const saved = loadDisplaySettings();
    const langSelect = document.getElementById('lang-select');
    const toggleVideos = document.getElementById('toggle-videos');
    const toggleQrs = document.getElementById('toggle-qrs');
    const toggleReadTracking = document.getElementById('toggle-read-tracking');

    if (langSelect && typeof saved.lang === 'string') langSelect.value = saved.lang;
    if (toggleVideos && typeof saved.videos === 'boolean') toggleVideos.checked = saved.videos;
    if (toggleQrs && typeof saved.qrs === 'boolean') toggleQrs.checked = saved.qrs;
    if (toggleReadTracking && typeof saved.readTracking === 'boolean') toggleReadTracking.checked = saved.readTracking;
}

/**
 * Toggle body classes for video/QR visibility based on checkbox state.
 */
export function updateMediaVisibility() {
    const toggleVideos = document.getElementById('toggle-videos');
    const toggleQrs = document.getElementById('toggle-qrs');
    const showVideos = toggleVideos ? toggleVideos.checked : false;
    const showQrs = toggleQrs ? toggleQrs.checked : false;

    document.body.classList.toggle('show-videos', showVideos);
    document.body.classList.toggle('show-qrs', showQrs);

    // Also set inline styles for deterministic visibility
    document.querySelectorAll('.pip-thumbnail__media').forEach(el => {
        // Only toggle video-type PIPs, not graphic (image) types
        if (el.closest('.pip-thumbnail')?.dataset.pipType === 'video') {
            el.style.display = showVideos ? '' : 'none';
        }
    });
    document.querySelectorAll('.pip-thumbnail__qr').forEach(el => {
        el.style.display = showQrs ? '' : 'none';
    });

    saveDisplaySettings();
}

/**
 * Toggle body class for read-tracking visibility.
 */
export function updateReadTrackingVisibility() {
    const toggle = document.getElementById('toggle-read-tracking');
    const show = toggle ? toggle.checked : false;
    document.body.classList.toggle('show-read-tracking', show);
    saveDisplaySettings();
}

/**
 * Initialize the settings dropdown menu behavior (open/close on click).
 */
export function initHeaderDropdown() {
    const btn = document.getElementById('settings-btn');
    const menu = document.getElementById('settings-menu');

    if (!btn || !menu) return;

    btn.onclick = (e) => {
        e.stopPropagation();
        const isVisible = menu.style.display === 'block';
        menu.style.display = isVisible ? 'none' : 'block';
    };

    document.addEventListener('click', (e) => {
        if (menu && !menu.contains(e.target) && e.target !== btn) {
            menu.style.display = 'none';
        }
    });
}

/**
 * Initialize all header controls with saved settings and event listeners.
 * @param {Function} onLanguageChange - callback(lang) when language changes
 * @param {Function} onReadToggle - callback when read-tracking toggle changes
 */
export function initHeaderControls(onLanguageChange, onReadToggle) {
    // Restore saved settings before anything reads them
    applyDisplaySettings();

    const toggleVideos = document.getElementById('toggle-videos');
    const toggleQrs = document.getElementById('toggle-qrs');
    const toggleReadTracking = document.getElementById('toggle-read-tracking');
    const langSelect = document.getElementById('lang-select');

    if (toggleVideos) {
        toggleVideos.addEventListener('change', updateMediaVisibility);
    }
    if (toggleQrs) {
        toggleQrs.addEventListener('change', updateMediaVisibility);
    }
    if (toggleReadTracking) {
        toggleReadTracking.addEventListener('change', () => {
            updateReadTrackingVisibility();
            if (onReadToggle) onReadToggle();
        });
    }
    if (langSelect && onLanguageChange) {
        langSelect.addEventListener('change', (e) => {
            onLanguageChange(e.target.value);
            saveDisplaySettings();
        });
    }

    initHeaderDropdown();
    updateMediaVisibility();
    updateReadTrackingVisibility();
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        DISPLAY_SETTINGS_KEY,
        saveDisplaySettings,
        loadDisplaySettings,
        applyDisplaySettings,
        updateMediaVisibility,
        updateReadTrackingVisibility,
        initHeaderDropdown,
        initHeaderControls,
    });
}
