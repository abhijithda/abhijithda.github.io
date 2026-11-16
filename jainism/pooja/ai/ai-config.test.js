// The Configure dialog and how the picker reacts to it: which settings each engine shows, what gets
// saved where (especially the API key), validation, and the Configure button's visibility.

const { initAi, applyAiSetting } = require('./ai-panel');
const { openAiConfig, closeAiConfig, isAiConfigOpen } = require('./ai-config');
const { saveSettings, loadSettings } = require('../core/settings');
const { KEY_STORAGE_KEY } = require('./engines/custom');
const modelFiles = require('./engines/model-files');

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

describe('local: a model in this browser, or one already on this computer', () => {
    const shown = id => !$(id).hidden;
    const flush = () => new Promise(r => setTimeout(r, 0));

    test('the browser is the default source: sizes shown, the server form hidden', () => {
        openAiConfig({ section: 'local' });
        expect($('ai-lsource-browser').checked).toBe(true);
        expect(shown('ai-config-browser')).toBe(true);
        expect(shown('ai-config-server')).toBe(false);
    });

    test('choosing the server shows its form, with Ollama\u2019s address ready, and hides the sizes', () => {
        openAiConfig({ section: 'local' });
        pick('ai-lsource-server');
        expect(shown('ai-config-server')).toBe(true);
        expect(shown('ai-config-browser')).toBe(false);
        expect($('ai-config-server-base').value).toBe('http://localhost:11434/v1');
        expect($('ai-config').textContent).toMatch(/OLLAMA_ORIGINS/);
        expect($('ai-config').textContent).toMatch(/Allow/);
    });

    test('saving the server stores the source, address and model, and the note names the server; no WebGPU needed', () => {
        saveSettings({ aiEngine: 'local' });
        openAiConfig({ section: 'local', onSaved: applyAiSetting });
        pick('ai-lsource-server');
        fire($('ai-config-server-base'), ' http://localhost:1234/v1/ ');
        fire($('ai-config-server-model'), ' llama3.2:3b ');
        $('ai-config-save').click();
        expect(loadSettings().aiLocalSource).toBe('server');
        expect(loadSettings().aiLocalServer).toEqual({ baseUrl: 'http://localhost:1234/v1', model: 'llama3.2:3b' });
        expect($('ai-engine-note').textContent).toMatch(/model server at localhost:1234, on this computer/);
        expect($('ai-engine-note').textContent).toMatch(/Nothing is downloaded/);
        expect($('ai-btn').hidden).toBe(false);                 // usable although this test browser has no WebGPU
    });

    test('an address that is not on this computer is refused, and nothing is saved', () => {
        openAiConfig({ section: 'local' });
        pick('ai-lsource-server');
        fire($('ai-config-server-base'), 'https://api.example.test/v1');
        fire($('ai-config-server-model'), 'm');
        $('ai-config-save').click();
        expect($('ai-config-error').hidden).toBe(false);
        expect($('ai-config-error').textContent).toMatch(/on this computer/);
        expect(isAiConfigOpen()).toBe(true);
        expect(loadSettings().aiLocalSource).toBe('browser');
    });

    test('saving with the browser chosen keeps the saved server details, and the cloud settings and key', () => {
        saveSettings({ aiLocalSource: 'server', aiLocalServer: { baseUrl: 'http://localhost:1234/v1', model: 'keep' }, aiCloudSource: 'own' });
        sessionStorage.setItem(KEY_STORAGE_KEY, KEY);
        openAiConfig({ section: 'local' });
        pick('ai-lsource-browser');
        $('ai-config-save').click();
        expect(loadSettings().aiLocalSource).toBe('browser');
        expect(loadSettings().aiLocalServer).toEqual({ baseUrl: 'http://localhost:1234/v1', model: 'keep' });
        expect(loadSettings().aiCloudSource).toBe('own');
        expect(sessionStorage.getItem(KEY_STORAGE_KEY)).toBe(KEY);
    });

    test('the dialog shows the saved source and details when it opens', () => {
        saveSettings({ aiLocalSource: 'server', aiLocalServer: { baseUrl: 'http://localhost:1234/v1', model: 'qwen2.5:7b' } });
        openAiConfig({ section: 'local' });
        expect($('ai-lsource-server').checked).toBe(true);
        expect(shown('ai-config-server')).toBe(true);
        expect($('ai-config-server-model').value).toBe('qwen2.5:7b');
    });

    describe('Check connection', () => {
        afterEach(() => { delete global.fetch; });
        const open = () => { openAiConfig({ section: 'local' }); pick('ai-lsource-server'); };

        test('lists the models the server has, as choices for the Model box', async () => {
            global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [{ id: 'llama3.2:3b' }, { id: 'qwen2.5:7b' }] }) });
            open();
            $('ai-config-server-check').click();
            await flush();
            expect(global.fetch.mock.calls[0][0]).toBe('http://localhost:11434/v1/models');
            expect([...$('ai-config-server-models').children].map(o => o.value)).toEqual(['llama3.2:3b', 'qwen2.5:7b']);
            expect($('ai-config-server-status').textContent).toMatch(/Connected.*llama3\.2:3b, qwen2\.5:7b/);
        });

        test('says when the chosen model is not one the server lists', async () => {
            global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [{ id: 'llama3.2:3b' }] }) });
            open();
            fire($('ai-config-server-model'), 'gemma');
            $('ai-config-server-check').click();
            await flush();
            expect($('ai-config-server-status').textContent).toMatch(/doesn.t list .gemma./);
        });

        test('a server that can\u2019t be reached gets the explanation of what to allow', async () => {
            global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
            open();
            $('ai-config-server-check').click();
            await flush();
            expect($('ai-config-server-status').textContent).toMatch(/OLLAMA_ORIGINS/);
        });

        test('an address that is not on this computer is not contacted', async () => {
            global.fetch = jest.fn();
            open();
            fire($('ai-config-server-base'), 'https://api.example.test/v1');
            $('ai-config-server-check').click();
            await flush();
            expect(global.fetch).not.toHaveBeenCalled();
            expect($('ai-config-server-status').textContent).toMatch(/on this computer/);
        });
    });

    describe('saving the downloaded model to a folder, and loading it back', () => {
        const flushAll = async () => { for (let i = 0; i < 5; i++) await flush(); };
        afterEach(() => { delete window.showDirectoryPicker; jest.restoreAllMocks(); });

        test('the Save button is offered only where a folder can be picked for writing', () => {
            openAiConfig({ section: 'local' });
            expect($('ai-config-save-folder').hidden).toBe(true);
            window.showDirectoryPicker = jest.fn();
            closeAiConfig();
            openAiConfig({ section: 'local' });
            expect($('ai-config-save-folder').hidden).toBe(false);
        });

        test('Load reports what it put back into the browser', async () => {
            window.showDirectoryPicker = jest.fn().mockResolvedValue({});
            jest.spyOn(modelFiles, 'loadRecordLookup').mockResolvedValue(() => ({}));
            jest.spyOn(modelFiles, 'loadModelsFromFolder').mockResolvedValue({ restored: ['m'], warnings: ['Note.'], bytes: 3 * 1024 * 1024 });
            openAiConfig({ section: 'local' });
            $('ai-config-load-folder').click();
            await flushAll();
            expect($('ai-config-folder-status').textContent).toMatch(/Loaded one model \(3 MB\).*without downloading.*Note\./);
            expect($('ai-config-load-folder').disabled).toBe(false);
        });

        test('Load shows a refused folder\u2019s own explanation', async () => {
            window.showDirectoryPicker = jest.fn().mockResolvedValue({});
            jest.spyOn(modelFiles, 'loadRecordLookup').mockResolvedValue(() => ({}));
            jest.spyOn(modelFiles, 'loadModelsFromFolder').mockRejectedValue(new modelFiles.ModelFolderError('That folder doesn\u2019t hold a saved model.'));
            openAiConfig({ section: 'local' });
            $('ai-config-load-folder').click();
            await flushAll();
            expect($('ai-config-folder-status').textContent).toBe('That folder doesn\u2019t hold a saved model.');
        });

        test('cancelling the folder picker says nothing', async () => {
            window.showDirectoryPicker = jest.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'));
            openAiConfig({ section: 'local' });
            $('ai-config-load-folder').click();
            await flushAll();
            expect($('ai-config-folder-status').textContent).toBe('');
        });

        test('Save says what it saved, or that nothing is downloaded yet', async () => {
            window.showDirectoryPicker = jest.fn().mockResolvedValue({});
            jest.spyOn(modelFiles, 'loadRecordLookup').mockResolvedValue(id => ({ model_id: id }));
            const save = jest.spyOn(modelFiles, 'saveModelsToFolder');
            save.mockResolvedValueOnce({ saved: ['a'], skipped: [], bytes: 5 * 1024 * 1024 });
            openAiConfig({ section: 'local' });
            $('ai-config-save-folder').click();
            await flushAll();
            expect($('ai-config-folder-status').textContent).toMatch(/Saved one model \(5 MB\)/);
            // every size's normal and compatibility build is offered to save; only fully downloaded ones are written
            expect(save.mock.calls[0][0].models).toHaveLength(6);
            save.mockResolvedValueOnce({ saved: [], skipped: [], bytes: 0 });
            $('ai-config-save-folder').click();
            await flushAll();
            expect($('ai-config-folder-status').textContent).toMatch(/Nothing to save yet.*downloads once/);
        });

        test('without a folder picker, Load falls back to a file input (a folder chosen with webkitdirectory)', () => {
            openAiConfig({ section: 'local' });
            const click = jest.spyOn($('ai-config-folder-input'), 'click').mockImplementation(() => {});
            $('ai-config-load-folder').click();
            expect(click).toHaveBeenCalled();
            expect($('ai-config-folder-input').hasAttribute('webkitdirectory')).toBe(true);
        });
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
