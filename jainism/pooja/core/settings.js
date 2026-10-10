// core/settings.js — The single unified `settings` object: one
// localStorage key, one load/save pair, for every persisted preference
// (languages, videos, QR codes, read-tracking, paper size, font scale).
// Feature modules (paper-size.js, font-scale.js, the lang picker in
// header.js) read/write through loadSettings()/saveSettings() here rather
// than owning storage of their own — so any caller can save "everything",
// or just the one field it changed, with a single function call, and
// nothing drifts into a second storage key. This module owns the schema
// (what fields exist, their valid values/ranges, their defaults);
// paper-size.js and font-scale.js own how their setting is applied to the
// DOM and wired to its control.

import { KNOWN_LANGS } from './langs.js';

export const SETTINGS_KEY = 'settings';

// Paper-size options for the Settings dropdown. 'dynamic' is the
// current/default behavior (fully responsive on screen, always prints A4 —
// see paper-size.js's applyPaperSize()); 'a4'/'a3' cap on-screen sizing to
// that paper's physical proportions too.
export const PAPER_SIZES = ['dynamic', 'a4', 'a3'];
const DEFAULT_PAPER_SIZE = 'dynamic';

// Font-scale multiplier bounds/step for the increase/decrease control.
// Applied as a multiplier (via the --font-scale CSS custom property), not
// an absolute override, so it composes with paper-size width capping.
export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 1.6;
export const FONT_SCALE_STEP = 0.1;
const DEFAULT_FONT_SCALE = 1;

function defaultLangs() {
    return KNOWN_LANGS.slice(0, 2).map(l => l.code); // Kannada + English
}

export function round1(n) {
    // Avoids float drift (e.g. 1 + 0.1 + 0.1 !== 1.2) across repeated clicks.
    return Math.round(n * 10) / 10;
}

/** Reads the full settings object, filling in defaults for anything missing/invalid. */
export function loadSettings() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch (_) {}

    const langs = Array.isArray(saved?.langs) ? saved.langs.filter(c => KNOWN_LANGS.some(l => l.code === c)) : [];

    const paperSize = PAPER_SIZES.includes(saved?.paperSize) ? saved.paperSize : DEFAULT_PAPER_SIZE;

    const fontScale = typeof saved?.fontScale === 'number' &&
        saved.fontScale >= FONT_SCALE_MIN && saved.fontScale <= FONT_SCALE_MAX
        ? round1(saved.fontScale)
        : DEFAULT_FONT_SCALE;

    return {
        langs:        langs.length ? langs : defaultLangs(),
        videos:       typeof saved?.videos       === 'boolean' ? saved.videos       : true,
        qrs:          typeof saved?.qrs          === 'boolean' ? saved.qrs          : false,
        readTracking: typeof saved?.readTracking === 'boolean' ? saved.readTracking : false,
        paperSize,
        fontScale,
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

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        SETTINGS_KEY, PAPER_SIZES, FONT_SCALE_MIN, FONT_SCALE_MAX, FONT_SCALE_STEP,
        loadSettings, saveSettings, round1,
    });
}
