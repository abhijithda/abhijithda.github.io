// header.js — Header UI: language picker, media/QR toggles, read-tracking, settings dropdown.
// All persisted settings (languages, videos, QR codes, read-tracking) live
// under one localStorage key and go through one load/save pair, so any
// caller can save "everything" — or just the one field it changed — with a
// single function call instead of juggling separate keys per setting.

import { KNOWN_LANGS } from './langs.js';

export const SETTINGS_KEY = 'settings';

function defaultLangs() {
    return KNOWN_LANGS.slice(0, 2).map(l => l.code); // Kannada + English
}

/** Reads the full settings object, filling in defaults for anything missing/invalid. */
export function loadSettings() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch (_) {}

    const langs = Array.isArray(saved?.langs) ? saved.langs.filter(c => KNOWN_LANGS.some(l => l.code === c)) : [];

    return {
        langs:        langs.length ? langs : defaultLangs(),
        videos:       typeof saved?.videos       === 'boolean' ? saved.videos       : true,
        qrs:          typeof saved?.qrs          === 'boolean' ? saved.qrs          : false,
        readTracking: typeof saved?.readTracking === 'boolean' ? saved.readTracking : false,
    };
}

/**
 * Merge `partial` into the currently saved settings and persist the result.
 * Callers pass only the field(s) they changed — e.g. saveSettings({ qrs: true })
 * — everything else is preserved. Returns the merged settings object.
 */
export function saveSettings(partial) {
    const merged = { ...loadSettings(), ...partial };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    return merged;
}

/** Reads current settings and pushes them onto the header controls (checkboxes). */
export function applySettings() {
    const saved              = loadSettings();
    const toggleVideos       = document.getElementById('toggle-videos');
    const toggleQrs          = document.getElementById('toggle-qrs');
    const toggleReadTracking = document.getElementById('toggle-read-tracking');

    if (toggleVideos)       toggleVideos.checked       = saved.videos;
    if (toggleQrs)          toggleQrs.checked          = saved.qrs;
    if (toggleReadTracking) toggleReadTracking.checked = saved.readTracking;
    // Lang checkboxes are built by initLangPicker itself, reading loadSettings().langs.
}

// ── Lang picker ───────────────────────────────────────────────────────────
// Searchable, collapsible multi-select — scales past a couple of languages
// (e.g. adding more Indian languages later) without turning the settings
// menu into a wall of checkboxes.

export function getActiveLangs() {
    return loadSettings().langs;
}

export function saveActiveLangs(langs) {
    saveSettings({ langs });
}

/**
 * Wire up the searchable, collapsible multi-select lang picker.
 * Expects this markup inside the Settings menu (see index.html):
 *   #lang-trigger  (button — shows a summary, toggles #lang-panel)
 *   #lang-summary  (span inside the trigger)
 *   #lang-panel    (hidden by default)
 *   #lang-search   (text input inside the panel)
 *   #lang-list     (checkbox rows render here)
 * Calls onLangChange(activeLangs[]) whenever selection changes.
 * At least one language must remain active.
 */
export function initLangPicker(onLangChange) {
    const trigger = document.getElementById('lang-trigger');
    const summary = document.getElementById('lang-summary');
    const panel   = document.getElementById('lang-panel');
    const search  = document.getElementById('lang-search');
    const list    = document.getElementById('lang-list');
    if (!trigger || !panel || !list) return;

    function updateSummary() {
        if (!summary) return;
        const active = getActiveLangs();
        const names = KNOWN_LANGS.filter(l => active.includes(l.code)).map(l => l.label);
        summary.textContent = names.length ? names.join(', ') : 'Select a language';
    }

    function renderList(filter) {
        const q = (filter || '').trim().toLowerCase();
        list.innerHTML = '';

        const matches = KNOWN_LANGS.filter(lang =>
            lang.label.toLowerCase().includes(q) || lang.name.toLowerCase().includes(q)
        );

        matches.forEach((lang, i) => {
            if (!q && i > 0 && lang.future && !matches[i - 1].future) {
                const div = document.createElement('div');
                div.className = 'lang-divider';
                list.appendChild(div);
            }

            const row = document.createElement('label');
            row.className = 'lang-row';
            row.htmlFor = `lang-chk-${lang.code}`;

            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.id   = `lang-chk-${lang.code}`;
            chk.checked = getActiveLangs().includes(lang.code);

            const labelText = document.createElement('span');
            labelText.className = 'lang-row-label';
            labelText.textContent = lang.label;

            const nameText = document.createElement('span');
            nameText.className = 'lang-row-name';
            nameText.textContent = lang.name;

            row.appendChild(chk);
            row.appendChild(labelText);
            row.appendChild(nameText);
            list.appendChild(row);

            chk.addEventListener('change', () => {
                const newActive = KNOWN_LANGS
                    .filter(l => document.getElementById(`lang-chk-${l.code}`)?.checked
                        ?? getActiveLangs().includes(l.code)) // langs filtered out of view keep their prior state
                    .map(l => l.code);

                if (newActive.length === 0) {
                    chk.checked = true; // enforce at least one active lang
                    return;
                }

                saveActiveLangs(newActive);
                updateSummary();
                if (onLangChange) onLangChange(newActive);
            });
        });

        if (!matches.length) {
            const empty = document.createElement('div');
            empty.className = 'lang-empty';
            empty.textContent = 'No languages match';
            list.appendChild(empty);
        }
    }

    function openPanel() {
        panel.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        if (search) search.focus();
    }
    function closePanel() {
        panel.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        if (search) search.value = '';
        renderList('');
    }

    trigger.onclick = (e) => {
        e.stopPropagation();
        if (panel.hidden) openPanel(); else closePanel();
    };

    document.addEventListener('click', (e) => {
        if (!panel.hidden && !panel.contains(e.target) && e.target !== trigger) {
            closePanel();
        }
    });

    if (search) search.addEventListener('input', () => renderList(search.value));

    renderList('');
    updateSummary();
}

// ── Media visibility ──────────────────────────────────────────────────────

export function updateMediaVisibility() {
    const toggleVideos = document.getElementById('toggle-videos');
    const toggleQrs    = document.getElementById('toggle-qrs');
    const showVideos   = toggleVideos ? toggleVideos.checked : false;
    const showQrs      = toggleQrs    ? toggleQrs.checked    : false;

    document.body.classList.toggle('show-videos', showVideos);
    document.body.classList.toggle('show-qrs',    showQrs);

    document.querySelectorAll('.video-card').forEach(el => {
        el.style.display = showVideos ? '' : 'none';
    });
    document.querySelectorAll('.qr-code').forEach(el => {
        el.style.display = showQrs ? '' : 'none';
    });

    saveSettings({ videos: showVideos, qrs: showQrs });
}

export function updateReadTrackingVisibility() {
    const toggle = document.getElementById('toggle-read-tracking');
    const readTracking = toggle ? toggle.checked : false;
    document.body.classList.toggle('show-read-tracking', readTracking);
    saveSettings({ readTracking });
}

// ── Settings dropdown ─────────────────────────────────────────────────────

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
 * Initialize all header controls.
 * @param {Function} onLangChange  - callback(activeLangs[]) on lang change
 * @param {Function} [onReadToggle] - callback when read-tracking toggle changes
 */
export function initHeaderControls(onLangChange, onReadToggle) {
    applySettings();

    const toggleVideos       = document.getElementById('toggle-videos');
    const toggleQrs          = document.getElementById('toggle-qrs');
    const toggleReadTracking = document.getElementById('toggle-read-tracking');

    if (toggleVideos)       toggleVideos.addEventListener('change', updateMediaVisibility);
    if (toggleQrs)          toggleQrs.addEventListener('change', updateMediaVisibility);
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
        SETTINGS_KEY, loadSettings, saveSettings, applySettings,
        getActiveLangs, saveActiveLangs, initLangPicker,
        updateMediaVisibility, updateReadTrackingVisibility,
        initHeaderDropdown, initHeaderControls,
    });
}
