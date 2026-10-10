const {
    loadSettings,
    saveSettings,
    SETTINGS_KEY,
    PAPER_SIZES,
} = require('./settings');

// Every assertion below that checks the full loadSettings() object includes
// these two defaults alongside langs/videos/qrs/readTracking — paper-size.js
// and font-scale.js each cover their own setting's applied *behavior*; this
// file only covers the shared schema (defaults/validation) that both of
// those settings, and every other one, are validated against here.
const DEFAULT_PAPER_FONT = { paperSize: 'dynamic', fontScale: 1 };

beforeEach(() => {
    localStorage.clear();
});

describe('loadSettings / saveSettings', () => {
    test('defaults every field when nothing has ever been saved', () => {
        expect(loadSettings()).toEqual({ langs: ['kn', 'en'], videos: true, qrs: false, readTracking: false, ...DEFAULT_PAPER_FONT });
    });

    test('saveSettings merges a partial update into the existing saved settings', () => {
        saveSettings({ qrs: true });
        saveSettings({ readTracking: true });

        expect(loadSettings()).toEqual({ langs: ['kn', 'en'], videos: true, qrs: true, readTracking: true, ...DEFAULT_PAPER_FONT });
    });

    test('drops unknown/stale lang codes and falls back to defaults if none remain valid', () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ langs: ['xx', 'yy'] }));
        expect(loadSettings().langs).toEqual(['kn', 'en']);
    });

    test('invalid/unknown paperSize falls back to dynamic', () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ paperSize: 'letter' }));
        expect(loadSettings().paperSize).toBe('dynamic');
    });

    test.each(PAPER_SIZES)('accepts a saved paperSize of %s', (size) => {
        saveSettings({ paperSize: size });
        expect(loadSettings().paperSize).toBe(size);
    });

    test('out-of-range or non-numeric fontScale falls back to 1', () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ fontScale: 99 }));
        expect(loadSettings().fontScale).toBe(1);

        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ fontScale: 'big' }));
        expect(loadSettings().fontScale).toBe(1);
    });

    test('accepts a saved fontScale within range', () => {
        saveSettings({ fontScale: 1.3 });
        expect(loadSettings().fontScale).toBe(1.3);
    });

    test('every field persists under the same single settings key', () => {
        saveSettings({ qrs: true });
        saveSettings({ fontScale: 1.1 });
        saveSettings({ paperSize: 'a3' });

        expect(localStorage.length).toBe(1);
        const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        expect(raw).toEqual({
            langs: ['kn', 'en'], videos: true, readTracking: false,
            qrs: true, fontScale: 1.1, paperSize: 'a3',
        });
    });
});
