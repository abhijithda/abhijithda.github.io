const {
    loadSettings,
    saveSettings,
    SETTINGS_KEY,
    PAPER_SIZES,
    AI_ENGINES,
    AI_CLOUD_SOURCES,
    AI_LOCAL_TIERS,
    AI_PROVIDERS,
    AI_PANEL_WIDTH_MIN,
    AI_PANEL_WIDTH_MAX,
} = require('./settings');

// Every assertion below that checks the full loadSettings() object includes
// these two defaults alongside langs/videos/qrs/readTracking — paper-size.js
// and font-scale.js each cover their own setting's applied *behavior*; this
// file only covers the shared schema (defaults/validation) that both of
// those settings, and every other one, are validated against here.
const DEFAULT_PAPER_FONT = { paperSize: 'dynamic', fontScale: 1, aiEngine: 'off', aiCloudSource: 'site', aiLocalModel: 'small', aiCustom: { provider: 'anthropic', baseUrl: '', model: '' }, aiPanelWidth: 420 };

beforeEach(() => {
    localStorage.clear();
});

describe('loadSettings / saveSettings', () => {
    test('defaults every field when nothing has ever been saved', () => {
        expect(loadSettings()).toEqual({ langs: ['kn', 'en'], videos: true, qrs: true, readTracking: false, offline: false, ...DEFAULT_PAPER_FONT });
    });

    test('saveSettings merges a partial update into the existing saved settings', () => {
        saveSettings({ qrs: true });
        saveSettings({ readTracking: true });

        expect(loadSettings()).toEqual({ langs: ['kn', 'en'], videos: true, qrs: true, readTracking: true, offline: false, ...DEFAULT_PAPER_FONT });
    });

    test('drops unknown/stale lang codes and falls back to defaults if none remain valid', () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ langs: ['xx', 'yy'] }));
        expect(loadSettings().langs).toEqual(['kn', 'en']);
    });

    test('aiEngine accepts off/cloud/local and falls back to off for anything else', () => {
        AI_ENGINES.forEach(engine => {
            saveSettings({ aiEngine: engine });
            expect(loadSettings().aiEngine).toBe(engine);
        });
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ aiEngine: 'gpt' }));
        expect(loadSettings().aiEngine).toBe('off');
    });

    test('aiEngine has three choices: off, cloud and local', () => {
        expect(AI_ENGINES).toEqual(['off', 'cloud', 'local']);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ aiEngine: 'custom' }));
        expect(loadSettings().aiEngine).toBe('off');          // not a choice any more; no migration needed yet
    });

    test('aiCloudSource says whose cloud service to use: this site\u2019s (default) or the reader\u2019s own', () => {
        expect(AI_CLOUD_SOURCES).toEqual(['site', 'own']);
        expect(loadSettings().aiCloudSource).toBe('site');
        saveSettings({ aiCloudSource: 'own' });
        expect(loadSettings().aiCloudSource).toBe('own');
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ aiCloudSource: 'elsewhere' }));
        expect(loadSettings().aiCloudSource).toBe('site');
    });

    test('aiLocalModel accepts the three sizes and falls back to small', () => {
        expect(AI_LOCAL_TIERS).toEqual(['small', 'medium', 'large']);
        AI_LOCAL_TIERS.forEach(t => {
            saveSettings({ aiLocalModel: t });
            expect(loadSettings().aiLocalModel).toBe(t);
        });
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ aiLocalModel: 'huge' }));
        expect(loadSettings().aiLocalModel).toBe('small');
    });

    test('aiCustom keeps the provider, address and model; junk is cleaned or defaulted', () => {
        saveSettings({ aiCustom: { provider: 'openai', baseUrl: '  https://x.test/v1  ', model: ' m1 ' } });
        expect(loadSettings().aiCustom).toEqual({ provider: 'openai', baseUrl: 'https://x.test/v1', model: 'm1' });
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ aiCustom: { provider: 'bing', baseUrl: 5, model: 'x'.repeat(500) } }));
        const c = loadSettings().aiCustom;
        expect(AI_PROVIDERS).toContain(c.provider);
        expect(c.provider).toBe('anthropic');
        expect(c.baseUrl).toBe('');
        expect(c.model.length).toBe(200);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ aiCustom: 'nope' }));
        expect(loadSettings().aiCustom).toEqual({ provider: 'anthropic', baseUrl: '', model: '' });
    });

    test('the API key is never part of the settings', () => {
        saveSettings({ aiCustom: { provider: 'anthropic', baseUrl: '', model: '', key: 'sk-secret', apiKey: 'sk-secret' } });
        expect(JSON.stringify(loadSettings())).not.toContain('sk-secret');
        expect(localStorage.getItem(SETTINGS_KEY)).not.toContain('sk-secret');
    });

    test('aiPanelWidth is saved, rounded and kept within its limits; junk falls back to the default', () => {
        saveSettings({ aiPanelWidth: 640.4 });
        expect(loadSettings().aiPanelWidth).toBe(640);
        saveSettings({ aiPanelWidth: 10 });
        expect(loadSettings().aiPanelWidth).toBe(AI_PANEL_WIDTH_MIN);
        saveSettings({ aiPanelWidth: 99999 });
        expect(loadSettings().aiPanelWidth).toBe(AI_PANEL_WIDTH_MAX);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ aiPanelWidth: 'wide' }));
        expect(loadSettings().aiPanelWidth).toBe(420);
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
            langs: ['kn', 'en'], videos: true, readTracking: false, offline: false, aiEngine: 'off', aiCloudSource: 'site', aiLocalModel: 'small', aiCustom: { provider: 'anthropic', baseUrl: '', model: '' }, aiPanelWidth: 420,
            qrs: true, fontScale: 1.1, paperSize: 'a3',
        });
    });

    test('offline copy is off by default, can be turned on, and ignores junk values', () => {
        expect(loadSettings().offline).toBe(false);
        saveSettings({ offline: true });
        expect(loadSettings().offline).toBe(true);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ offline: 'yes' }));
        expect(loadSettings().offline).toBe(false);
    });
});
