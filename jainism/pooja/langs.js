// langs.js — Shared language registry. One place to add a language so it
// shows up everywhere it's needed (currently: header.js's language picker).

export const KNOWN_LANGS = [
    { code: 'kn', label: 'ಕನ್ನಡ', name: 'Kannada' },
    { code: 'en', label: 'English', name: 'English' },
];

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, { KNOWN_LANGS });
}
