// langs.js — Shared language registry. One place to add a language so it
// shows up everywhere it's needed (currently: header.js's language picker).

export const KNOWN_LANGS = [
    { code: 'kn', label: 'ಕನ್ನಡ', name: 'Kannada' },
    { code: 'en', label: 'English', name: 'English' },
];

export const LANG_CODES = KNOWN_LANGS.map(l => l.code);

/**
 * The language codes a single-language-or-'all' choice selects (continuous
 * view's `lang` argument: 'kn' | 'en' | 'all'), in registry order.
 * @param {string} selection
 * @returns {string[]}
 */
export function activeLangCodes(selection = 'all') {
    return LANG_CODES.filter(code => selection === code || selection === 'all');
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, { KNOWN_LANGS, LANG_CODES, activeLangCodes });
}
