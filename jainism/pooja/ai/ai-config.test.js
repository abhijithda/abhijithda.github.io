// The Configure dialog and how the picker reacts to it: which settings each engine shows, what gets
// saved where (especially the API key), validation, and the Configure button's visibility.

const { initAi, applyAiSetting } = require('./ai-panel');
const { openAiConfig, closeAiConfig, isAiConfigOpen } = require('./ai-config');
const { saveSettings, loadSettings } = require('../core/settings');
const { KEY_STORAGE_KEY } = require('./engines/custom');

const KEY = 'sk-test-SECRET-123';
const $ = id => document.getElementById(id);
const fire = (el, value) => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
const pick = id => $(id).click();
const settingsRaw = () => localStorage.getItem('settings') || '';

function setup() {
    localStorage.clear();
    sessionStorage.clear();
    document.body.innerHTML = `
        <button id="ai-btn" hidden></button>
        <select id="ai-engine-select"><option value="off"></option><option value="cloud"></option><option value="local"></option></select>
        <button id="ai-config-btn" hidden></button>
        <span id="ai-engine-note"></span>
        <select id="home-ai-engine-select"><option value="off"></option><option value="cloud"></option><option value="local"></option></select>
        <button id="home-ai-config-btn" hidden></button>
        <p id="home-ai-engine-note"></p>`;
    initAi({ data: [], onCite: jest.fn() });
}

beforeEach(setup);

describe('Configure button', () => {
    test('shown for Cloud and Local, hidden for Off, on both the menu and Home', () => {
        saveSettings({ aiEngine: 'off' });
        applyAiSetting();
        expect($('ai-config-btn').hidden).toBe(true);
        expect($('home-ai-config-btn').hidden).toBe(true);
        ['cloud', 'local'].forEach(e => {
            saveSettings({ aiEngine: e });
            applyAiSetting();
            expect($('ai-config-btn').hidden).toBe(false);
            expect($('home-ai-config-btn').hidden).toBe(false);
        });
    });

    test('the button on Home opens the same dialog as the menu\u2019s', () => {
        saveSettings({ aiEngine: 'cloud' });
        applyAiSetting();
        $('home-ai-config-btn').click();
        expect(isAiConfigOpen()).toBe(true);
    });

    test('choosing Cloud when it is set to your own service but that isn\u2019t set up goes straight to the dialog', () => {
        saveSettings({ aiCloudSource: 'own' });
        fire($('ai-engine-select'), 'cloud');
        expect(isAiConfigOpen()).toBe(true);
        expect($('ai-btn').hidden).toBe(true);
        expect($('ai-engine-note').textContent).toMatch(/API key/);
        expect($('home-ai-engine-note').textContent).toBe($('ai-engine-note').textContent);
    });

    test('choosing Cloud with this site\u2019s assistant, or Local, does not open it', () => {
        fire($('ai-engine-select'), 'cloud');
        expect(isAiConfigOpen()).toBe(false);
        fire($('ai-engine-select'), 'local');
        expect(isAiConfigOpen()).toBe(false);
    });
});

describe('only the chosen engine\u2019s settings are shown', () => {
    const shown = id => !$(id).hidden;

    test('Local: just the on-device sizes', () => {
        Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
        saveSettings({ aiEngine: 'local' });
        applyAiSetting();
        $('ai-config-btn').click();
        expect(shown('ai-config-local')).toBe(true);
        expect(shown('ai-config-cloud')).toBe(false);
        expect($('ai-config-title').textContent).toBe('On-device model');
        expect(getComputedStyle($('ai-config-cloud')).display).toBe('none');
        delete navigator.gpu;
    });

    test('Cloud: just the choice of service (no on-device sizes)', () => {
        saveSettings({ aiEngine: 'cloud' });
        applyAiSetting();
        $('ai-config-btn').click();
        expect(shown('ai-config-local')).toBe(false);
        expect(shown('ai-config-cloud')).toBe(true);
        expect($('ai-config-title').textContent).toBe('Cloud assistant');
    });

    test('with no section named, both are shown', () => {
        openAiConfig();
        expect(shown('ai-config-local')).toBe(true);
        expect(shown('ai-config-cloud')).toBe(true);
        expect($('ai-config-title').textContent).toBe('AI assistant settings');
    });

    test('no provider is called free or paid: a reader knows which key they are pasting', () => {
        openAiConfig({ section: 'cloud' });
        pick('ai-source-own');
        expect($('ai-config').textContent).not.toMatch(/\bpaid\b|\bfree server\b/i);
    });
});

describe('on-device size', () => {
    test('shows the three sizes with download and memory needs, the saved one selected', () => {
        saveSettings({ aiLocalModel: 'medium' });
        openAiConfig({ section: 'local' });
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
        openAiConfig({ section: 'local', onSaved: applyAiSetting });
        pick('ai-tier-large');
        $('ai-config-save').click();
        expect(loadSettings().aiLocalModel).toBe('large');
        expect($('ai-engine-note').textContent).toMatch(/about 5 GB/);
        expect(isAiConfigOpen()).toBe(false);
        delete navigator.gpu;
    });

    test('saving the size leaves the cloud choice, the saved service and the key untouched', () => {
        saveSettings({ aiCloudSource: 'own', aiCustom: { provider: 'openai', baseUrl: 'https://llm.example.test/v1', model: 'm1' } });
        sessionStorage.setItem(KEY_STORAGE_KEY, KEY);
        openAiConfig({ section: 'local' });
        pick('ai-tier-medium');
        $('ai-config-save').click();
        expect(loadSettings().aiLocalModel).toBe('medium');
        expect(loadSettings().aiCloudSource).toBe('own');
        expect(loadSettings().aiCustom).toEqual({ provider: 'openai', baseUrl: 'https://llm.example.test/v1', model: 'm1' });
        expect(sessionStorage.getItem(KEY_STORAGE_KEY)).toBe(KEY);
    });
});

describe('cloud: this site\u2019s assistant or your own service', () => {
    function fill({ provider = 'anthropic', base = '', model = '', key = '', remember = false } = {}) {
        pick('ai-source-own');
        fire($('ai-config-provider'), provider);
        $('ai-config-base').value = base;
        $('ai-config-model').value = model;
        $('ai-config-key').value = key;
        $('ai-config-remember').checked = remember;
    }

    test('this site\u2019s assistant is the default; the service form stays hidden until your own is picked', () => {
        openAiConfig({ section: 'cloud' });
        expect($('ai-source-site').checked).toBe(true);
        expect($('ai-config-custom').hidden).toBe(true);
        pick('ai-source-own');
        expect($('ai-config-custom').hidden).toBe(false);
        pick('ai-source-site');
        expect($('ai-config-custom').hidden).toBe(true);
    });

    test('the address row appears only for the OpenAI-compatible format', () => {
        openAiConfig({ section: 'cloud' });
        pick('ai-source-own');
        expect($('ai-config-base-row').hidden).toBe(true);
        fire($('ai-config-provider'), 'openai');
        expect($('ai-config-base-row').hidden).toBe(false);
    });

    test('saving "this site\u2019s assistant" changes only the source: a service saved earlier and its key stay', () => {
        saveSettings({ aiCloudSource: 'own', aiCustom: { provider: 'openai', baseUrl: 'https://llm.example.test/v1', model: 'm1' } });
        sessionStorage.setItem(KEY_STORAGE_KEY, KEY);
        openAiConfig({ section: 'cloud', onSaved: applyAiSetting });
        pick('ai-source-site');
        $('ai-config-save').click();
        expect(loadSettings().aiCloudSource).toBe('site');
        expect(loadSettings().aiCustom).toEqual({ provider: 'openai', baseUrl: 'https://llm.example.test/v1', model: 'm1' });
        expect(sessionStorage.getItem(KEY_STORAGE_KEY)).toBe(KEY);
    });

    test('saving your own service stores the details in settings and the key only in session storage by default', () => {
        saveSettings({ aiEngine: 'cloud' });
        openAiConfig({ section: 'cloud', onSaved: applyAiSetting });
        fill({ key: KEY, model: 'my-model' });
        $('ai-config-save').click();
        expect(loadSettings().aiCloudSource).toBe('own');
        expect(loadSettings().aiCustom).toEqual({ provider: 'anthropic', baseUrl: '', model: 'my-model' });
        expect(settingsRaw()).not.toContain(KEY);
        expect(sessionStorage.getItem(KEY_STORAGE_KEY)).toBe(KEY);
        expect(localStorage.getItem(KEY_STORAGE_KEY)).toBeNull();
        expect($('ai-btn').hidden).toBe(false);                  // usable now
        expect($('ai-engine-note').textContent).toMatch(/api\.anthropic\.com/);
    });

    test('"remember" keeps the key on the device instead', () => {
        openAiConfig({ section: 'cloud' });
        fill({ key: KEY, remember: true });
        $('ai-config-save').click();
        expect(localStorage.getItem(KEY_STORAGE_KEY)).toBe(KEY);
        expect(sessionStorage.getItem(KEY_STORAGE_KEY)).toBeNull();
        expect(settingsRaw()).not.toContain(KEY);
    });

    test('the saved key is never put back into the dialog; leaving the box empty keeps it', () => {
        openAiConfig({ section: 'cloud' });
        fill({ key: KEY });
        $('ai-config-save').click();
        openAiConfig({ section: 'cloud' });
        expect($('ai-source-own').checked).toBe(true);
        expect($('ai-config-key').value).toBe('');
        expect(document.body.innerHTML).not.toContain(KEY);
        expect($('ai-config-key').placeholder).toMatch(/Saved/);
        $('ai-config-save').click();
        expect(sessionStorage.getItem(KEY_STORAGE_KEY)).toBe(KEY);
    });

    test('typing a new key replaces the old one', () => {
        openAiConfig({ section: 'cloud' });
        fill({ key: KEY });
        $('ai-config-save').click();
        openAiConfig({ section: 'cloud' });
        $('ai-config-key').value = 'sk-new';
        $('ai-config-save').click();
        expect(sessionStorage.getItem(KEY_STORAGE_KEY)).toBe('sk-new');
    });

    test('"Forget my key" removes it everywhere and updates the picker at once', () => {
        saveSettings({ aiEngine: 'cloud' });
        openAiConfig({ section: 'cloud', onSaved: applyAiSetting });
        fill({ key: KEY, remember: true });
        $('ai-config-save').click();
        expect($('ai-btn').hidden).toBe(false);
        openAiConfig({ section: 'cloud', onSaved: applyAiSetting });
        $('ai-config-forget').click();
        expect(localStorage.getItem(KEY_STORAGE_KEY)).toBeNull();
        expect(sessionStorage.getItem(KEY_STORAGE_KEY)).toBeNull();
        expect($('ai-btn').hidden).toBe(true);
        expect($('ai-config-forget').hidden).toBe(true);
    });

    test('an address that isn\u2019t allowed shows an error and saves nothing', () => {
        openAiConfig({ section: 'cloud' });
        fill({ provider: 'openai', base: 'http://evil.test/v1', model: 'm', key: KEY });
        $('ai-config-save').click();
        expect($('ai-config-error').hidden).toBe(false);
        expect(isAiConfigOpen()).toBe(true);
        expect(loadSettings().aiCustom.baseUrl).toBe('');
        expect(loadSettings().aiCloudSource).toBe('site');
        expect(sessionStorage.getItem(KEY_STORAGE_KEY)).toBeNull();
    });

    test('a good address is saved tidied up, and the privacy note names that host', () => {
        saveSettings({ aiEngine: 'cloud' });
        openAiConfig({ section: 'cloud', onSaved: applyAiSetting });
        fill({ provider: 'openai', base: 'https://llm.example.test/v1/', model: 'm1', key: KEY });
        $('ai-config-save').click();
        expect(loadSettings().aiCustom).toEqual({ provider: 'openai', baseUrl: 'https://llm.example.test/v1', model: 'm1' });
        expect($('ai-engine-note').textContent).toMatch(/llm\.example\.test/);
    });

    test('switching to the Anthropic format drops a leftover address', () => {
        saveSettings({ aiCustom: { provider: 'openai', baseUrl: 'https://llm.example.test/v1', model: 'm' } });
        openAiConfig({ section: 'cloud' });
        fill({ provider: 'anthropic', base: 'https://llm.example.test/v1', key: KEY });
        $('ai-config-save').click();
        expect(loadSettings().aiCustom.baseUrl).toBe('');
    });

    test('a server on this computer is described as that, not as "using your own key"', () => {
        saveSettings({ aiEngine: 'cloud' });
        openAiConfig({ section: 'cloud', onSaved: applyAiSetting });
        fill({ provider: 'openai', base: 'http://localhost:11434/v1', model: 'llama3' });
        $('ai-config-save').click();
        expect($('ai-engine-note').textContent).toMatch(/localhost:11434, a server on this computer/);
        expect($('ai-engine-note').textContent).not.toMatch(/your own key/);
    });

    test('this site\u2019s assistant: the note says nothing needs setting up', () => {
        saveSettings({ aiEngine: 'cloud' });
        applyAiSetting();
        expect($('ai-engine-note').textContent).toMatch(/Nothing to set up|isn.t set up/);
    });

    test('saving the service leaves the on-device size untouched', () => {
        saveSettings({ aiLocalModel: 'large' });
        openAiConfig({ section: 'cloud' });
        fill({ key: KEY });
        $('ai-config-save').click();
        expect(loadSettings().aiLocalModel).toBe('large');
    });
});

describe('closing', () => {
    test('Cancel, Escape and a click outside close it without saving', () => {
        for (const close of [
            () => $('ai-config-cancel').click(),
            () => $('ai-config').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
            () => $('ai-config').click(),
        ]) {
            openAiConfig({ section: 'local' });
            pick('ai-tier-large');
            close();
            expect(isAiConfigOpen()).toBe(false);
            expect(loadSettings().aiLocalModel).toBe('small');
        }
        closeAiConfig();   // closing when already closed is harmless
    });

    test('nothing typed is parsed as HTML', () => {
        openAiConfig({ section: 'cloud' });
        pick('ai-source-own');
        $('ai-config-model').value = '<img src=x onerror=alert(1)>';
        $('ai-config-save').click();
        saveSettings({ aiEngine: 'cloud' });
        applyAiSetting();
        expect(document.querySelector('img')).toBeNull();
    });
});
