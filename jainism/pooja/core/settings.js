// core/settings.js — The single unified `settings` object: one
// localStorage key, one load/save pair, for every persisted preference
// (languages, videos, QR codes, read-tracking, offline copy, AI engine, paper size, font scale).
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

// AI assistant engine (see ai/). 'off' is the default: 'local' downloads a
// model of hundreds of MB, and 'cloud' sends the reader's question (plus the
// passages found for it) to a server, so neither happens until chosen.
//  - 'cloud' : a hosted service. Whose is a second setting, aiCloudSource below.
//  - 'local' : a model on the reader's own device, in one of three sizes.
export const AI_ENGINES = ['off', 'cloud', 'local'];
const DEFAULT_AI_ENGINE = 'off';

// Which hosted service 'cloud' means.
//  - 'site' : this site's own free assistant (ai/proxy/). The default: nothing to set up.
//  - 'own'  : the reader's own AI service and API key, called straight from the
//             browser. The key is NOT part of this object (see ai/engines/custom.js:
//             it has its own storage so it can be session-only and is never copied
//             along with the settings).
export const AI_CLOUD_SOURCES = ['site', 'own'];
const DEFAULT_AI_CLOUD_SOURCE = 'site';

// Size of the on-device model. The ids are stable; what each one means (model,
// download size) lives in ai/config.js so it can change without touching saved settings.
export const AI_LOCAL_TIERS = ['small', 'medium', 'large'];
const DEFAULT_AI_LOCAL_TIER = 'small';

// The reader's own service: which request format to speak. 'anthropic' is fixed to
// Anthropic's own address; 'openai' is the chat-completions format that OpenAI
// and many other services and local servers share, at a base URL the reader gives.
export const AI_PROVIDERS = ['anthropic', 'openai'];
const AI_CUSTOM_FIELD_MAX = 200;

function loadAiCustom(saved) {
    const clean = v => (typeof v === 'string' ? v.trim().slice(0, AI_CUSTOM_FIELD_MAX) : '');
    return {
        provider: AI_PROVIDERS.includes(saved?.provider) ? saved.provider : AI_PROVIDERS[0],
        baseUrl:  clean(saved?.baseUrl),
        model:    clean(saved?.model),
    };
}

// Width of the assistant drawer in px, set by dragging its edge (see ai/ai-panel.js).
export const AI_PANEL_WIDTH_MIN = 320;
export const AI_PANEL_WIDTH_MAX = 1400;
export const AI_PANEL_WIDTH_DEFAULT = 420;

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

    const aiPanelWidth = Number.isFinite(saved?.aiPanelWidth)
        ? Math.min(AI_PANEL_WIDTH_MAX, Math.max(AI_PANEL_WIDTH_MIN, Math.round(saved.aiPanelWidth)))
        : AI_PANEL_WIDTH_DEFAULT;
    const fontScale = typeof saved?.fontScale === 'number' &&
        saved.fontScale >= FONT_SCALE_MIN && saved.fontScale <= FONT_SCALE_MAX
        ? round1(saved.fontScale)
        : DEFAULT_FONT_SCALE;

    return {
        langs:        langs.length ? langs : defaultLangs(),
        videos:       typeof saved?.videos       === 'boolean' ? saved.videos       : true,
        qrs:          typeof saved?.qrs          === 'boolean' ? saved.qrs          : true,
        readTracking: typeof saved?.readTracking === 'boolean' ? saved.readTracking : false,
        // Off by default: saving the book for offline use downloads a few MB, so
        // it only starts when the reader turns it on (see core/offline.js).
        offline:      typeof saved?.offline      === 'boolean' ? saved.offline      : false,
        aiEngine:     AI_ENGINES.includes(saved?.aiEngine) ? saved.aiEngine : DEFAULT_AI_ENGINE,
        aiCloudSource: AI_CLOUD_SOURCES.includes(saved?.aiCloudSource) ? saved.aiCloudSource : DEFAULT_AI_CLOUD_SOURCE,
        aiLocalModel: AI_LOCAL_TIERS.includes(saved?.aiLocalModel) ? saved.aiLocalModel : DEFAULT_AI_LOCAL_TIER,
        aiCustom:     loadAiCustom(saved?.aiCustom),
        aiPanelWidth,
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
    // Keep only the known, non-secret fields, so nothing extra (an API key, say) can be saved by accident.
    if ('aiCustom' in partial) merged.aiCustom = loadAiCustom(partial.aiCustom);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    return merged;
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, {
        SETTINGS_KEY, PAPER_SIZES, AI_ENGINES, AI_CLOUD_SOURCES, AI_LOCAL_TIERS, AI_PROVIDERS, AI_PANEL_WIDTH_MIN, AI_PANEL_WIDTH_MAX, AI_PANEL_WIDTH_DEFAULT, FONT_SCALE_MIN, FONT_SCALE_MAX, FONT_SCALE_STEP,
        loadSettings, saveSettings, round1,
    });
}
