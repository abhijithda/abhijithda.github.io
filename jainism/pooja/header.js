// header.js — Header UI: language, video/QR toggles, read-tracking, settings dropdown.
// Persists and restores display settings via localStorage.

export const DISPLAY_SETTINGS_KEY = 'displaySettings';

export function saveDisplaySettings() {
    const langSelect         = document.getElementById('lang-select');
    const toggleVideos       = document.getElementById('toggle-videos');
    const toggleQrs          = document.getElementById('toggle-qrs');
    const toggleReadTracking = document.getElementById('toggle-read-tracking');
    const settings = {
        lang:         langSelect         ? langSelect.value         : 'all',
        videos:       toggleVideos       ? toggleVideos.checked     : true,
        qrs:          toggleQrs          ? toggleQrs.checked        : false,
        readTracking: toggleReadTracking ? toggleReadTracking.checked : false,
    };
    localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(settings));
}

export function loadDisplaySettings() {
    try { return JSON.parse(localStorage.getItem(DISPLAY_SETTINGS_KEY)) || {}; }
    catch (e) { return {}; }
}

export function applyDisplaySettings() {
    const saved              = loadDisplaySettings();
    const langSelect         = document.getElementById('lang-select');
    const toggleVideos       = document.getElementById('toggle-videos');
    const toggleQrs          = document.getElementById('toggle-qrs');
    const toggleReadTracking = document.getElementById('toggle-read-tracking');

    if (langSelect         && typeof saved.lang         === 'string')  langSelect.value         = saved.lang;
    if (toggleVideos       && typeof saved.videos       === 'boolean') toggleVideos.checked     = saved.videos;
    if (toggleQrs          && typeof saved.qrs          === 'boolean') toggleQrs.checked        = saved.qrs;
    if (toggleReadTracking && typeof saved.readTracking === 'boolean') toggleReadTracking.checked = saved.readTracking;
}

/**
 * Toggle body classes for video/QR visibility — verbatim from master,
 * using .video-card / .qr-code class names (not pip-thumbnail).
 */
export function updateMediaVisibility() {
    const toggleVideos = document.getElementById('toggle-videos');
    const toggleQrs    = document.getElementById('toggle-qrs');
    const showVideos   = toggleVideos ? toggleVideos.checked : false;
    const showQrs      = toggleQrs    ? toggleQrs.checked    : false;

    document.body.classList.toggle('show-videos', showVideos);
    document.body.classList.toggle('show-qrs',    showQrs);

    // Inline styles for deterministic visibility (verbatim from master)
    document.querySelectorAll('.video-card').forEach(el => {
        el.style.display = showVideos ? '' : 'none';
    });
    document.querySelectorAll('.qr-code').forEach(el => {
        el.style.display = showQrs ? '' : 'none';
    });

    saveDisplaySettings();
}

export function updateReadTrackingVisibility() {
    const toggle = document.getElementById('toggle-read-tracking');
    document.body.classList.toggle('show-read-tracking', toggle ? toggle.checked : false);
    saveDisplaySettings();
}

export function initHeaderDropdown() {
    const btn  = document.getElementById('settings-btn');
    const menu = document.getElementById('settings-menu');
    if (!btn || !menu) return;

    btn.onclick = (e) => {
        e.stopPropagation();
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    };
    document.addEventListener('click', (e) => {
        if (menu && !menu.contains(e.target) && e.target !== btn) {
            menu.style.display = 'none';
        }
    });
}

/**
 * Initialize all header controls with saved settings and event listeners.
 * @param {Function} onLanguageChange - callback(lang) called when lang select changes
 * @param {Function} [onReadToggle]   - callback called when read-tracking toggle changes
 */
export function initHeaderControls(onLanguageChange, onReadToggle) {
    applyDisplaySettings();

    const toggleVideos       = document.getElementById('toggle-videos');
    const toggleQrs          = document.getElementById('toggle-qrs');
    const toggleReadTracking = document.getElementById('toggle-read-tracking');
    const langSelect         = document.getElementById('lang-select');

    if (toggleVideos)       toggleVideos.addEventListener('change', updateMediaVisibility);
    if (toggleQrs)          toggleQrs.addEventListener('change', updateMediaVisibility);
    if (toggleReadTracking) toggleReadTracking.addEventListener('change', () => {
        updateReadTrackingVisibility();
        if (onReadToggle) onReadToggle();
    });
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
        DISPLAY_SETTINGS_KEY, saveDisplaySettings, loadDisplaySettings,
        applyDisplaySettings, updateMediaVisibility, updateReadTrackingVisibility,
        initHeaderDropdown, initHeaderControls,
    });
}
