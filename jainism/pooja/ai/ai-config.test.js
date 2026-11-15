// The Configure dialog and how the picker reacts to it: what gets saved where
// (especially the API key), validation, and the Configure button's visibility.

const { initAi, applyAiSetting } = require('./ai-panel');
const { openAiConfig, closeAiConfig, isAiConfigOpen } = require('./ai-config');
const { saveSettings, loadSettings } = require('../core/settings');
const { KEY_STORAGE_KEY } = require('./engines/custom');

const KEY = 'sk-test-SECRET-123';
const $ = id => document.getElementById(id);
const fire = (el, value) => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
const settingsRaw = () => localStorage.getItem('settings') || '';

function setup() {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = `
        <button id="ai-btn" hidden></button>
        <select id="ai-engine-select"><option value="off"></option><option value="cloud"></option><option value="custom"></option><option value="local"></option></select>
        <button id="ai-config-btn" hidden></button>
        <span id="ai-engine-note"></span>
        <select id="home-ai-engine-select"><option value="off"></option><option value="custom"></option></select>
        <button id="home-ai-config-btn" hidden></button>
        <p id="home-ai-engine-note"></p>`;
    initAi({ data: [], onCite: jest.fn() });
}

beforeEach(setup);

describe('Configure button', () => {
    test('only shown for Custom and Local, on both the menu and Home', () => {
        ['off', 'cloud'].forEach(e => {
            saveSettings({ aiEngine: e });
            applyAiSetting();
            expect($('ai-config-btn').hidden).toBe(true);
            expect($('home-ai-config-btn').hidden).toBe(true);
        });
        ['custom', 'local'].forEach(e => {
            saveSettings({ aiEngine: e });
            applyAiSetting();
            expect($('ai-config-btn').hidden).toBe(false);
            expect($('home-ai-config-btn').hidden).toBe(false);
        });
    });

    test('the button on Home opens the same dialog as the menu\u2019s', () => {
        saveSettings({ aiEngine: 'local' });
        applyAiSetting();
        $('home-ai-config-btn').click();
        expect(isAiConfigOpen()).toBe(true);
    });

    test('choosing Custom before it is set up goes straight to the dialog, and says what is missing', () => {
        fire($('ai-engine-select'), 'custom');
        expect(isAiConfigOpen()).toBe(true);
        expect($('ai-btn').hidden).toBe(true);
        expect($('ai-engine-note').textContent).toMatch(/API key/);
        expect($('home-ai-engine-note').textContent).toBe($('ai-engine-note').textContent);
    });

    test('choosing Local does not open it', () => {
        fire($('ai-engine-select'), 'local');
        expect(isAiConfigOpen()).toBe(false);
    });
});

describe('on-device size', () => {
    test('shows the three sizes with download and memory needs, the saved one selected', () => {
        saveSettings({ aiLocalModel: 'medium' });
        openAiConfig();
        const radios = [...document.querySelectorAll('input[name="ai-local-tier"]')];
        expect(radios.map(r => r.value)).toEqual(['small', 'medium', 'large']);
        expect(radios.find(r => r.checked).value).toBe('medium');
        expect($('ai-config').textContent).toMatch(/about 1 GB/);
        expect($('ai-config').textContent).toMatch(/about 5 GB/);
    });

    test('saving a different size stores it and refreshes the note', () => {
        Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });   // the note only describes the size when WebGPU exists
        saveSettings({ aiEngine: 'local' });
        applyAiSetting();
        expect($('ai-engine-note').textContent).toMatch(/about 1 GB/);
        openAiConfig({ onSaved: applyAiSetting });
        document.getElementById('ai-tier-large').click();
        $('ai-config-save').click();
        expect(loadSettings().aiLocalModel).toBe('large');
        expect($('ai-engine-note').textContent).toMatch(/about 5 GB/);
        expect(isAiConfigOpen()).toBe(false);
        delete navigator.gpu;
    });
});

describe('own service and key', () => {
    function fill({ provider = 'anthropic', base = '', model = '', key = '', remember = false } = {}) {
        fire($('ai-config-provider'), provider);
        $('ai-config-base').value = base;
        $('ai-config-model').value = model;
        $('ai-config-key').value = key;
        $('ai-config-remember').checked = remember;
    }

    test('the address row appears only for the OpenAI-compatible format', () => {
        openAiConfig();
        expect($('ai-config-base-row').hidden).toBe(true);
        fire($('ai-config-provider'), 'openai');
        expect($('ai-config-base-row').hidden).toBe(false);
    });

    test('saving stores the details in settings and the key only in session storage by default', () => {
        saveSettings({ aiEngine: 'custom' });
        openAiConfig({ onSaved: applyAiSetting });
        fill({ key: KEY, model: 'my-model' });
        $('ai-config-save').click();
        expect(loadSettings().aiCustom).toEqual({ provider: 'anthropic', baseUrl: '', model: 'my-model' });
        expect(settingsRaw()).not.toContain(KEY);
        expect(sessionStorage.getItem(KEY_STORAGE_KEY)).toBe(KEY);
        expect(localStorage.getItem(KEY_STORAGE_KEY)).toBeNull();
        expect($('ai-btn').hidden).toBe(false);                  // usable now
        expect($('ai-engine-note').textContent).toMatch(/api\.anthropic\.com/);
    });

    test('"remember" keeps the key on the device instead', () => {
        openAiConfig();
        fill({ key: KEY, remember: true });
        $('ai-config-save').click();
        expect(localStorage.getItem(KEY_STORAGE_KEY)).toBe(KEY);
        expect(sessionStorage.getItem(KEY_STORAGE_KEY)).toBeNull();
        expect(settingsRaw()).not.toContain(KEY);
    });

    test('the saved key is never put back into the dialog; leaving the box empty keeps it', () => {
        openAiConfig();
        fill({ key: KEY });
        $('ai-config-save').click();
        openAiConfig();
        expect($('ai-config-key').value).toBe('');
        expect(document.body.innerHTML).not.toContain(KEY);
        expect($('ai-config-key').placeholder).toMatch(/Saved/);
        $('ai-config-save').click();
        expect(sessionStorage.getItem(KEY_STORAGE_KEY)).toBe(KEY);
    });

    test('typing a new key replaces the old one', () => {
        openAiConfig();
        fill({ key: KEY });
        $('ai-config-save').click();
        openAiConfig();
        fill({ key: 'sk-new' });
        $('ai-config-save').click();
        expect(sessionStorage.getItem(KEY_STORAGE_KEY)).toBe('sk-new');
    });

    test('"Forget my key" removes it everywhere and updates the picker at once', () => {
        saveSettings({ aiEngine: 'custom' });
        openAiConfig({ onSaved: applyAiSetting });
        fill({ key: KEY, remember: true });
        $('ai-config-save').click();
        expect($('ai-btn').hidden).toBe(false);
        openAiConfig({ onSaved: applyAiSetting });
        $('ai-config-forget').click();
        expect(localStorage.getItem(KEY_STORAGE_KEY)).toBeNull();
        expect(sessionStorage.getItem(KEY_STORAGE_KEY)).toBeNull();
        expect($('ai-btn').hidden).toBe(true);
        expect($('ai-config-forget').hidden).toBe(true);
    });

    test('an address that isn\u2019t allowed shows an error and saves nothing', () => {
        openAiConfig();
        fill({ provider: 'openai', base: 'http://evil.test/v1', model: 'm', key: KEY });
        $('ai-config-save').click();
        expect($('ai-config-error').hidden).toBe(false);
        expect(isAiConfigOpen()).toBe(true);
        expect(loadSettings().aiCustom.baseUrl).toBe('');
        expect(sessionStorage.getItem(KEY_STORAGE_KEY)).toBeNull();
    });

    test('a good address is saved tidied up, and the privacy note names that host', () => {
        saveSettings({ aiEngine: 'custom' });
        openAiConfig({ onSaved: applyAiSetting });
        fill({ provider: 'openai', base: 'https://llm.example.test/v1/', model: 'm1', key: KEY });
        $('ai-config-save').click();
        expect(loadSettings().aiCustom).toEqual({ provider: 'openai', baseUrl: 'https://llm.example.test/v1', model: 'm1' });
        expect($('ai-engine-note').textContent).toMatch(/llm\.example\.test/);
    });

    test('switching to the Anthropic format drops a leftover address', () => {
        saveSettings({ aiCustom: { provider: 'openai', baseUrl: 'https://llm.example.test/v1', model: 'm' } });
        openAiConfig();
        fill({ provider: 'anthropic', base: 'https://llm.example.test/v1', key: KEY });
        $('ai-config-save').click();
        expect(loadSettings().aiCustom.baseUrl).toBe('');
    });
});

describe('closing', () => {
    test('Cancel, Escape and a click outside close it without saving', () => {
        for (const close of [
            () => $('ai-config-cancel').click(),
            () => $('ai-config').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
            () => $('ai-config').click(),
        ]) {
            openAiConfig();
            document.getElementById('ai-tier-large').click();
            close();
            expect(isAiConfigOpen()).toBe(false);
            expect(loadSettings().aiLocalModel).toBe('small');
        }
        closeAiConfig();   // closing when already closed is harmless
    });

    test('nothing typed is parsed as HTML', () => {
        openAiConfig();
        $('ai-config-model').value = '<img src=x onerror=alert(1)>';
        $('ai-config-save').click();
        saveSettings({ aiEngine: 'custom' });
        applyAiSetting();
        expect(document.querySelector('img')).toBeNull();
    });
});
