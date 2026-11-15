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

test('off and unknown give no engine; cloud, custom and local each give their own', () => {
    expect(getEngine('off')).toBeNull();
    expect(getEngine('gpt')).toBeNull();
    expect(getEngine('cloud').id).toBe('cloud');
    expect(getEngine('custom').id).toBe('custom');
    expect(getEngine('cloud')).toBe(getEngine('cloud'));
    expect(getEngine('custom')).toBe(getEngine('custom'));
});

test('custom reads the reader\u2019s service details afresh each time', () => {
    const engine = getEngine('custom');
    expect(engine.available().ok).toBe(false);
    saveSettings({ aiCustom: { provider: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'llama' } });
    expect(getEngine('custom').available().ok).toBe(true);     // no key needed for a local server
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
