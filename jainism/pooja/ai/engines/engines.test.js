const { createCloudEngine } = require('./cloud');
const { createLocalEngine, LOCAL_GPU_FAILED, COMPAT_STORAGE_KEY } = require('./local');
const { getEngine } = require('./index');

const msgs = [{ role: 'system', content: 'rules' }, { role: 'user', content: 'hi' }];
const okResponse = body => ({ ok: true, status: 200, json: async () => body });

describe('cloud engine', () => {
    test('is unavailable, with a reason, until an endpoint is configured', () => {
        const a = createCloudEngine({ endpoint: '' }).available();
        expect(a.ok).toBe(false);
        expect(a.reason).toMatch(/isn.t set up/);
        expect(createCloudEngine({ endpoint: 'https://x.test' }).available().ok).toBe(true);
    });

    test('posts the system prompt separately from the messages and returns the text', async () => {
        const fetchImpl = jest.fn(async () => okResponse({ text: 'answer' }));
        const onToken = jest.fn();
        const text = await createCloudEngine({ endpoint: 'https://x.test', fetchImpl }).generate(msgs, { onToken });
        expect(text).toBe('answer');
        expect(onToken).toHaveBeenCalledWith('answer');
        const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
        expect(body.system).toBe('rules');
        expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
        expect(body).not.toHaveProperty('apiKey');
    });

    test('turns 429 and other failures into readable errors', async () => {
        const mk = status => createCloudEngine({ endpoint: 'https://x.test', fetchImpl: async () => ({ ok: false, status }) });
        await expect(mk(429).generate(msgs)).rejects.toThrow(/Too many questions/);
        await expect(mk(500).generate(msgs)).rejects.toThrow(/error 500/);
    });

    test('rejects an empty answer', async () => {
        const e = createCloudEngine({ endpoint: 'https://x.test', fetchImpl: async () => okResponse({ text: '  ' }) });
        await expect(e.generate(msgs)).rejects.toThrow(/empty/);
    });
});

describe('local engine', () => {
    const fakeLib = () => {
        const create = jest.fn(async () => ({
            chat: { completions: { create: async () => (async function* () {
                yield { choices: [{ delta: { content: 'Hel' } }] };
                yield { choices: [{ delta: { content: 'lo' } }] };
            })() } },
            interruptGenerate: jest.fn(),
        }));
        return { lib: { CreateMLCEngine: create }, create };
    };

    test('is unavailable without WebGPU', () => {
        expect(createLocalEngine().available().ok).toBe(false);
        Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
        expect(createLocalEngine().available().ok).toBe(true);
        delete navigator.gpu;
    });

    test('loads the model once, reports progress, and streams the answer', async () => {
        const { lib, create } = fakeLib();
        const engine = createLocalEngine({ loadLibrary: async () => lib, modelId: 'm' });
        const tokens = [];
        const text = await engine.generate(msgs, { onToken: t => tokens.push(t) });
        await engine.generate(msgs);
        expect(text).toBe('Hello');
        expect(tokens).toEqual(['Hel', 'Hello']);
        expect(create).toHaveBeenCalledTimes(1);
        expect(create.mock.calls[0][0]).toBe('m');
    });

    test('a failed load can be retried', async () => {
        const { lib } = fakeLib();
        let n = 0;
        const engine = createLocalEngine({ loadLibrary: async () => { if (n++ === 0) throw new Error('offline'); return lib; } });
        await expect(engine.prepare()).rejects.toThrow('offline');
        await expect(engine.prepare()).resolves.toBeUndefined();
    });
});

describe('local engine: remembering compatibility mode', () => {
    const okLib = (create) => ({ CreateMLCEngine: create });
    const okEngine = () => ({ chat: { completions: { create: async () => (async function* () {})() } }, interruptGenerate() {} });
    const DAY = 24 * 60 * 60 * 1000;
    beforeEach(() => localStorage.clear());

    test('after compatibility mode works, a fresh engine (a reload) starts in it and never tries the f16 build', async () => {
        const first = jest.fn(async () => okEngine());
        const e1 = createLocalEngine({ loadLibrary: async () => okLib(first), modelId: 'f16', compatModelId: 'f32' });
        e1.setCompatMode(true);
        await e1.prepare();
        expect(JSON.parse(localStorage.getItem(COMPAT_STORAGE_KEY)).model).toBe('f32');

        const second = jest.fn(async () => okEngine());
        const e2 = createLocalEngine({ loadLibrary: async () => okLib(second), modelId: 'f16', compatModelId: 'f32' });
        expect(e2.compatMode).toBe(true);
        await e2.prepare();
        expect(second.mock.calls.map(c => c[0])).toEqual(['f32']);
    });

    test('is not remembered when compatibility mode itself fails, and a remembered one that stops working is forgotten', async () => {
        const fail = jest.fn().mockRejectedValue(new Error('[Invalid ShaderModule (unlabeled)] is invalid'));
        const e = createLocalEngine({ loadLibrary: async () => okLib(fail), clearCache: async () => {}, modelId: 'f16', compatModelId: 'f32' });
        e.setCompatMode(true);
        await e.prepare().catch(() => {});
        expect(localStorage.getItem(COMPAT_STORAGE_KEY)).toBeNull();

        localStorage.setItem(COMPAT_STORAGE_KEY, JSON.stringify({ model: 'f32', at: Date.now() }));
        const e2 = createLocalEngine({ loadLibrary: async () => okLib(fail), clearCache: async () => {}, modelId: 'f16', compatModelId: 'f32' });
        expect(e2.compatMode).toBe(true);
        await e2.prepare().catch(() => {});
        expect(localStorage.getItem(COMPAT_STORAGE_KEY)).toBeNull();
        expect(createLocalEngine({ modelId: 'f16', compatModelId: 'f32' }).compatMode).toBe(false);
    });

    test('a note older than 30 days, or for a different model id, is ignored', () => {
        const now = 1_000_000_000_000;
        localStorage.setItem(COMPAT_STORAGE_KEY, JSON.stringify({ model: 'f32', at: now - 31 * DAY }));
        expect(createLocalEngine({ compatModelId: 'f32', now: () => now }).compatMode).toBe(false);
        localStorage.setItem(COMPAT_STORAGE_KEY, JSON.stringify({ model: 'f32', at: now - 29 * DAY }));
        expect(createLocalEngine({ compatModelId: 'f32', now: () => now }).compatMode).toBe(true);
        expect(createLocalEngine({ compatModelId: 'other', now: () => now }).compatMode).toBe(false);
    });

    test('unreadable or missing storage never breaks the engine', async () => {
        localStorage.setItem(COMPAT_STORAGE_KEY, '{not json');
        expect(createLocalEngine().compatMode).toBe(false);
        const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
        const e = createLocalEngine({ storage: broken, loadLibrary: async () => okLib(async () => okEngine()) });
        e.setCompatMode(true);
        await expect(e.prepare()).resolves.toBeUndefined();
        expect(createLocalEngine({ storage: null }).compatMode).toBe(false);
    });
});

describe('local engine: GPU failures', () => {
    beforeEach(() => localStorage.clear());
    const shaderError = () => new Error('[Invalid ShaderModule (unlabeled)] is invalid due to a previous error.');
    const okEngine = () => ({ chat: { completions: { create: async () => (async function* () {})() } }, interruptGenerate() {} });

    test('retries once after clearing the cached model code, and then works', async () => {
        const create = jest.fn()
            .mockRejectedValueOnce(shaderError())
            .mockResolvedValueOnce(okEngine());
        const clearCache = jest.fn(async () => {});
        const engine = createLocalEngine({ loadLibrary: async () => ({ CreateMLCEngine: create }), clearCache });
        await expect(engine.prepare()).resolves.toBeUndefined();
        expect(clearCache).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledTimes(2);
    });

    test('if the retry fails too, gives a plain-language error flagged for the compatibility-mode button', async () => {
        const create = jest.fn().mockRejectedValue(shaderError());
        const engine = createLocalEngine({ loadLibrary: async () => ({ CreateMLCEngine: create }), clearCache: async () => {} });
        const err = await engine.prepare().catch(e => e);
        expect(err.code).toBe(LOCAL_GPU_FAILED);
        expect(err.compat).toBe(false);
        expect(err.message).not.toMatch(/ShaderModule/);
        expect(err.message).toMatch(/compatibility mode/);
    });

    test('compatibility mode loads the f32 model id; a failure there points away from compat mode', async () => {
        const create = jest.fn().mockRejectedValue(shaderError());
        const engine = createLocalEngine({ loadLibrary: async () => ({ CreateMLCEngine: create }), clearCache: async () => {}, modelId: 'f16', compatModelId: 'f32' });
        await engine.prepare().catch(() => {});
        engine.setCompatMode(true);
        const err = await engine.prepare().catch(e => e);
        expect(create.mock.calls.some(c => c[0] === 'f32')).toBe(true);
        expect(err.compat).toBe(true);
        expect(err.message).not.toMatch(/try compatibility mode/i);
    });

    test('errors that are not GPU errors are passed through untouched (e.g. offline)', async () => {
        const create = jest.fn().mockRejectedValue(new Error('Failed to fetch'));
        const clearCache = jest.fn();
        const engine = createLocalEngine({ loadLibrary: async () => ({ CreateMLCEngine: create }), clearCache });
        await expect(engine.prepare()).rejects.toThrow('Failed to fetch');
        expect(clearCache).not.toHaveBeenCalled();
        expect(create).toHaveBeenCalledTimes(1);
    });

    test('no usable GPU adapter is reported before anything is downloaded', async () => {
        Object.defineProperty(navigator, 'gpu', { value: { requestAdapter: async () => null }, configurable: true });
        const load = jest.fn();
        const err = await createLocalEngine({ loadLibrary: load }).prepare().catch(e => e);
        delete navigator.gpu;
        expect(err.code).toBe('LOCAL_NO_GPU');
        expect(err.message).toMatch(/no usable graphics/);
        expect(load).not.toHaveBeenCalled();
    });

    test('progress that arrives after a failure is not reported', async () => {
        let progressCb;
        const create = jest.fn(async (_id, { initProgressCallback }) => { progressCb = initProgressCallback; throw new Error('Failed to fetch'); });
        const onProgress = jest.fn();
        const engine = createLocalEngine({ loadLibrary: async () => ({ CreateMLCEngine: create }) });
        await engine.prepare(onProgress).catch(() => {});
        progressCb({ text: 'Loading GPU shader modules[7/75]', progress: 0.09 });
        expect(onProgress).not.toHaveBeenCalled();
    });
});

describe('getEngine', () => {
    test('maps settings values to engines, and off/unknown to null', () => {
        expect(getEngine('off')).toBeNull();
        expect(getEngine('gpt')).toBeNull();
        expect(getEngine('cloud').id).toBe('cloud');
        expect(getEngine('local').id).toBe('local');
        expect(getEngine('cloud')).toBe(getEngine('cloud'));   // reused, so a loaded model is kept
    });
});
