// header.js — Header UI: language picker, media toggles, read-tracking, settings dropdown.
// The lang picker is a multi-checkbox list inside the Settings menu, shared by both views.

import { KNOWN_LANGS } from './book-view.js';

export const DISPLAY_SETTINGS_KEY = 'displaySettings';

// ── Persist / restore ─────────────────────────────────────────────────────

export function saveDisplaySettings() {
    const toggleVideos = document.getElementById('toggle-videos');
    const toggleQrs = document.getElementById('toggle-qrs');
    const toggleReadTracking = document.getElementById('toggle-read-tracking');
    const settings = {
        // Active langs saved separately via saveLangSettings()
        videos: toggleVideos ? toggleVideos.checked : true,
        qrs: toggleQrs ? toggleQrs.checked : false,
        readTracking: toggleReadTracking ? toggleReadTracking.checked : false,
    };
    localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(settings));
}

export function loadDisplaySettings() {
    try { return JSON.parse(localStorage.getItem(DISPLAY_SETTINGS_KEY)) || {}; }
    catch (e) { return {}; }
}

export function applyDisplaySettings() {
    const saved = loadDisplaySettings();
    const toggleVideos = document.getElementById('toggle-videos');
    const toggleQrs = document.getElementById('toggle-qrs');
    const toggleReadTracking = document.getElementById('toggle-read-tracking');

    if (toggleVideos && typeof saved.videos === 'boolean') toggleVideos.checked = saved.videos;
    if (toggleQrs && typeof saved.qrs === 'boolean') toggleQrs.checked = saved.qrs;
    if (toggleReadTracking && typeof saved.readTracking === 'boolean') toggleReadTracking.checked = saved.readTracking;
}

// ── Lang picker ───────────────────────────────────────────────────────────
// Stored as an ordered array of active language codes, e.g. ['kn', 'en'].

const LANG_SETTINGS_KEY = 'activeLangs';

export function getActiveLangs() {
    try {
        const saved = JSON.parse(localStorage.getItem(LANG_SETTINGS_KEY));
        if (Array.isArray(saved) && saved.length > 0) {
            // Keep only codes that still exist in KNOWN_LANGS
            const valid = saved.filter(c => KNOWN_LANGS.some(l => l.code === c));
            if (valid.length > 0) return valid;
        }
    } catch (_) { }
    // Default: first two known languages (kn + en)
    return KNOWN_LANGS.slice(0, 2).map(l => l.code);
}

export function saveActiveLangs(langs) {
    localStorage.setItem(LANG_SETTINGS_KEY, JSON.stringify(langs));
}

/**
 * Build the multi-checkbox lang picker inside #lang-checkboxes.
 * Calls onLangChange(activeLangs[]) whenever selection changes.
 * At least one language must remain active.
 */
export function initLangPicker(onLangChange) {
    const container = document.getElementById('lang-checkboxes');
    if (!container) return;

    container.innerHTML = '';

    KNOWN_LANGS.forEach((lang, i) => {
        // Visual divider before "future" languages
        if (i > 0 && lang.future) {
            const div = document.createElement('div');
            div.className = 'lang-divider';
            container.appendChild(div);
        }

        const row = document.createElement('label');
        row.className = 'lang-opt';
        row.htmlFor = `lang-chk-${lang.code}`;

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.id = `lang-chk-${lang.code}`;
        chk.checked = getActiveLangs().includes(lang.code);

        const labelText = document.createElement('span');
        labelText.className = 'lang-opt-label';
        labelText.textContent = lang.label;

        const nameText = document.createElement('span');
        nameText.className = 'lang-opt-name';
        nameText.textContent = lang.name;

        row.appendChild(chk);
        row.appendChild(labelText);
        row.appendChild(nameText);
        container.appendChild(row);

        chk.addEventListener('change', () => {
            const newActive = KNOWN_LANGS
                .filter(l => document.getElementById(`lang-chk-${l.code}`)?.checked)
                .map(l => l.code);

            // Enforce at least one active lang — revert if all unchecked
            if (newActive.length === 0) {
                chk.checked = true;
                return;
            }

            saveActiveLangs(newActive);
            if (onLangChange) onLangChange(newActive);
        });
    });
}

// ── Media visibility ──────────────────────────────────────────────────────

export function updateMediaVisibility() {
    const toggleVideos = document.getElementById('toggle-videos');
    const toggleQrs = document.getElementById('toggle-qrs');
    const showVideos = toggleVideos ? toggleVideos.checked : false;
    const showQrs = toggleQrs ? toggleQrs.checked : false;

    document.body.classList.toggle('show-videos', showVideos);
    document.body.classList.toggle('show-qrs', showQrs);

    // Continuous view: .video-card / .qr-code (master's class names)
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

// ── Settings dropdown ─────────────────────────────────────────────────────

export function initHeaderDropdown() {
    const btn = document.getElementById('settings-btn');
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
 * Initialize all header controls.
 * @param {Function} onLangChange    - callback(activeLangs[]) on lang change
 * @param {Function} [onReadToggle] - callback when read-tracking toggle changes
 */
export function initHeaderControls(onLangChange, onReadToggle) {
    applyDisplaySettings();

    const toggleVideos = document.getElementById('toggle-videos');
    const toggleQrs = document.getElementById('toggle-qrs');
    const toggleReadTracking = document.getElementById('toggle-read-tracking');

    if (toggleVideos) toggleVideos.addEventListener('change', updateMediaVisibility);
    if (toggleQrs) toggleQrs.addEventListener('change', updateMediaVisibility);
    if (toggleReadTracking) toggleReadTracking.addEventListener('change', () => {
        updateReadTrackingVisibility();
        if (onReadToggle) onReadToggle();
    });

    initLangPicker(onLangChange);
    initHeaderDropdown();
    updateMediaVisibility();
    updateReadTrackingVisibility();
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        DISPLAY_SETTINGS_KEY, saveDisplaySettings, loadDisplaySettings,
        applyDisplaySettings, getActiveLangs, saveActiveLangs, initLangPicker,
        updateMediaVisibility, updateReadTrackingVisibility,
        initHeaderDropdown, initHeaderControls,
    });
}
