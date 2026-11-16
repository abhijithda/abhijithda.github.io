// getEngine: one engine per kind, a separate on-device engine per model size,
// and only one on-device model kept in memory.

const created = [];
jest.mock('./local.js', () => ({
    createLocalEngine: jest.fn(opts => { const e = { id: 'local', opts, dispose: jest.fn(), available: () => ({ ok: true }) }; created.push(e); return e; }),
}));

const { getEngine } = require('./index');
const { createLocalEngine } = require('./local.js');
const { saveSettings } = require('../../core/settings');
const { LOCAL_TIERS } = require('../config');

beforeEach(() => { localStorage.clear(); });

test('off and unknown give no engine; cloud and local each give their own', () => {
    expect(getEngine('off')).toBeNull();
    expect(getEngine('gpt')).toBeNull();
    expect(getEngine('custom')).toBeNull();                // no longer a separate choice
    expect(getEngine('cloud').id).toBe('cloud');
    expect(getEngine('cloud')).toBe(getEngine('cloud'));
});

test('cloud is this site\u2019s assistant by default and the reader\u2019s own service when chosen, switching at once', () => {
    expect(getEngine('cloud').id).toBe('cloud');
    saveSettings({ aiCloudSource: 'own' });
    const own = getEngine('cloud');
    expect(own.id).toBe('custom');
    expect(getEngine('cloud')).toBe(own);
    saveSettings({ aiCloudSource: 'site' });
    expect(getEngine('cloud').id).toBe('cloud');
});

test('the reader\u2019s own service reads its details afresh each time', () => {
    saveSettings({ aiCloudSource: 'own' });
    expect(getEngine('cloud').available().ok).toBe(false);
    saveSettings({ aiCustom: { provider: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'llama' } });
    expect(getEngine('cloud').available().ok).toBe(true);     // no key needed for a local server
});

test('local uses the model of the chosen size, and its f32 build for compatibility mode', () => {
    saveSettings({ aiLocalModel: 'medium' });
    getEngine('local');
    const opts = createLocalEngine.mock.calls.pop()[0];
    expect(opts.modelId).toBe(LOCAL_TIERS.medium.model);
    expect(opts.compatModelId).toBe(LOCAL_TIERS.medium.compat);
});

test('the same size is reused; a different size frees the old model and loads the new one', () => {
    saveSettings({ aiLocalModel: 'small' });
    const a = getEngine('local');
    expect(getEngine('local')).toBe(a);
    saveSettings({ aiLocalModel: 'large' });
    const b = getEngine('local');
    expect(b).not.toBe(a);
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(b.opts.modelId).toBe(LOCAL_TIERS.large.model);
    expect(b.dispose).not.toHaveBeenCalled();
});

test('every size names real-looking model ids and sizes', () => {
    ['small', 'medium', 'large'].forEach(t => {
        expect(LOCAL_TIERS[t].model).toMatch(/^Qwen2\.5-(1\.5B|3B|7B)-Instruct-q4f16_1-MLC$/);
        expect(LOCAL_TIERS[t].compat).toBe(LOCAL_TIERS[t].model.replace('q4f16', 'q4f32'));
        expect(LOCAL_TIERS[t].size).toMatch(/GB/);
    });
});

describe('local: a model in this browser, or one already on this computer', () => {
    test('the browser model is the default source', () => {
        expect(getEngine('local').opts).toBeDefined();         // the (mocked) WebLLM engine
    });

    test('choosing the model server gives the server engine, which reads its details afresh each time', () => {
        saveSettings({ aiLocalSource: 'server', aiLocalServer: { baseUrl: 'http://localhost:11434/v1', model: '' } });
        const server = getEngine('local');
        expect(server.id).toBe('local');
        expect(server.opts).toBeUndefined();                    // not the WebLLM engine
        expect(server.available().ok).toBe(false);              // no model chosen yet
        saveSettings({ aiLocalServer: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2:3b' } });
        expect(getEngine('local')).toBe(server);
        expect(server.available().ok).toBe(true);
    });

    test('switching to the server frees the browser model, and back loads it afresh', () => {
        saveSettings({ aiLocalSource: 'browser', aiLocalModel: 'small' });
        const browser = getEngine('local');
        saveSettings({ aiLocalSource: 'server', aiLocalServer: { baseUrl: 'http://localhost:11434/v1', model: 'm' } });
        getEngine('local');
        expect(browser.dispose).toHaveBeenCalledTimes(1);
        saveSettings({ aiLocalSource: 'browser' });
        const again = getEngine('local');
        expect(again).not.toBe(browser);
        expect(again.opts.modelId).toBe(LOCAL_TIERS.small.model);
    });
});
