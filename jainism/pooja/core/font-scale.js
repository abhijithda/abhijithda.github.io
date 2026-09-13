// core/font-scale.js — Font-size scaling: a multiplier (not an absolute
// override) applied via the single --font-scale CSS custom property that
// both screen and @media print rules read (see core/font-scale.css,
// continuous-view.css, book-view.css), so print can't silently drift out
// of sync with what's shown on screen. Shared across both views — not
// per-view. Persistence goes through the single unified settings object in
// settings.js, not a store of its own.

import { loadSettings, saveSettings, round1, FONT_SCALE_MIN, FONT_SCALE_MAX, FONT_SCALE_STEP } from './settings.js';
import { notifyLayoutChanged } from './layout-signal.js';

export { FONT_SCALE_MIN, FONT_SCALE_MAX, FONT_SCALE_STEP };

export function applyFontScale() {
    const { fontScale } = loadSettings();

    if (document.documentElement) {
        document.documentElement.style.setProperty('--font-scale', String(fontScale));
    }

    const display = document.getElementById('font-scale-display');
    if (display) display.textContent = `${Math.round(fontScale * 100)}%`;

    notifyLayoutChanged();
    return fontScale;
}

export function changeFontScale(delta) {
    const current = loadSettings().fontScale;
    const next = Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, round1(current + delta)));
    saveSettings({ fontScale: next });
    applyFontScale();
    return next;
}

export function initFontScaleControl() {
    const inc = document.getElementById('font-scale-increase');
    const dec = document.getElementById('font-scale-decrease');
    if (inc) inc.addEventListener('click', () => changeFontScale(FONT_SCALE_STEP));
    if (dec) dec.addEventListener('click', () => changeFontScale(-FONT_SCALE_STEP));
    applyFontScale();
}

// Note: no manual CommonJS re-export shim — see paper-size.js for why (this
// file also re-exports imported bindings, which a manual
// Object.assign(module.exports, {...}) can't overwrite).
