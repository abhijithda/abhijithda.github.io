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

    test('turns each of the proxy\u2019s refusal codes into its own message', async () => {
        const mk = (status, error) => createCloudEngine({ endpoint: 'https://x.test', fetchImpl: async () => ({ ok: false, status, json: async () => ({ error }) }) });
        await expect(mk(429, 'rate').generate(msgs)).rejects.toThrow(/Too many questions/);
        await expect(mk(429, 'busy').generate(msgs)).rejects.toThrow(/very busy/);
        await expect(mk(429, 'ip-daily').generate(msgs)).rejects.toThrow(/today.s question limit/);
        await expect(mk(503, 'budget').generate(msgs)).rejects.toThrow(/limit for today/);
        await expect(mk(503, 'unavailable').generate(msgs)).rejects.toThrow(/temporarily unavailable/);
        await expect(mk(502, 'upstream').generate(msgs)).rejects.toThrow(/error 502/);
    });

    test('hands an empty answer on as it is, so the site can show the matching passages instead of an error', async () => {
        const e = createCloudEngine({ endpoint: 'https://x.test', fetchImpl: async () => okResponse({ text: '' }) });
        await expect(e.generate(msgs)).resolves.toBe('');
    });

    test('an answer in a form it can\u2019t read is an error', async () => {
        const e = createCloudEngine({ endpoint: 'https://x.test', fetchImpl: async () => okResponse({ nothing: true }) });
        await expect(e.generate(msgs)).rejects.toThrow(/can.t read/);
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

describe('local engine: dispose', () => {
    test('frees the loaded model and lets the next use load again', async () => {
        const unload = jest.fn();
        const create = jest.fn(async () => ({ unload, chat: { completions: { create: async () => (async function* () { yield { choices: [{ delta: { content: 'x' } }] }; })() } } }));
        const engine = createLocalEngine({ loadLibrary: async () => ({ CreateMLCEngine: create }), modelId: 'm' });
        await engine.prepare();
        engine.dispose();
        expect(unload).toHaveBeenCalledTimes(1);
        await engine.prepare();
        expect(create).toHaveBeenCalledTimes(2);
        expect(() => createLocalEngine().dispose()).not.toThrow();   // nothing loaded: harmless
    });
});


describe('cloud engine: unreachable', () => {
    test('a blocked or failed request (the browser says only "Failed to fetch") becomes a plain message, with a hint for the owner in the console', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const e = createCloudEngine({ endpoint: 'https://x.test', fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
        await expect(e.generate(msgs)).rejects.toThrow(/Couldn.t reach the cloud assistant/);
        expect(warn.mock.calls[0].join(' ')).toMatch(/ALLOWED_ORIGINS/);
        warn.mockRestore();
    });

    test('an abort stays an abort', async () => {
        const abort = Object.assign(new Error('x'), { name: 'AbortError' });
        const e = createCloudEngine({ endpoint: 'https://x.test', fetchImpl: async () => { throw abort; } });
        await expect(e.generate(msgs)).rejects.toMatchObject({ name: 'AbortError' });
    });
});

describe('local engine: failures while answering', () => {
    const { LOCAL_GPU_LOST, LOCAL_GPU_FAILED } = require('./local');
    const engineThatFails = (error) => {
        const unload = jest.fn();
        let calls = 0;
        const create = jest.fn(async () => ({
            unload,
            chat: { completions: { create: async () => { calls += 1; if (calls === 1) throw error; return (async function* () { yield { choices: [{ delta: { content: 'ok again' } }] }; })(); } } },
        }));
        const engine = createLocalEngine({ loadLibrary: async () => ({ CreateMLCEngine: create }), modelId: 'm' });
        return { engine, create, unload };
    };

    test('a lost graphics device gives plain advice, no compatibility button, and the next question reloads the model', async () => {
        const { engine, create, unload } = engineThatFails(new Error('Device was lost.'));
        await engine.prepare();
        const err = await engine.generate(msgs).catch(e => e);
        expect(err.code).toBe(LOCAL_GPU_LOST);
        expect(err.code).not.toBe(LOCAL_GPU_FAILED);
        expect(err.message).toMatch(/reset.*idle/);
        expect(unload).toHaveBeenCalledTimes(1);            // the broken model is dropped
        await expect(engine.generate(msgs)).resolves.toBe('ok again');
        expect(create).toHaveBeenCalledTimes(2);            // and loaded afresh, not left broken until a page reload
    });

    test('running out of graphics memory says so, and does not offer the bigger compatibility build', async () => {
        const { engine } = engineThatFails(new Error('Out of memory while allocating buffer'));
        const err = await engine.generate(msgs).catch(e => e);
        expect(err.code).toBe(LOCAL_GPU_LOST);
        expect(err.message).toMatch(/ran out of graphics memory/);
        expect(err.message).toMatch(/smaller size/);
    });

    test('out of memory while LOADING is also not met with the compatibility offer', async () => {
        const create = jest.fn(async () => { throw new Error('GPUDevice: out of memory'); });
        const engine = createLocalEngine({ loadLibrary: async () => ({ CreateMLCEngine: create }), clearCache: async () => {} });
        const err = await engine.prepare().catch(e => e);
        expect(err.code).toBe(LOCAL_GPU_LOST);
        expect(err.message).toMatch(/graphics memory/);
    });

    test('an abort or an unrelated error is passed through untouched, and the model is kept', async () => {
        const { engine, unload } = engineThatFails(new Error('something else entirely'));
        const err = await engine.generate(msgs).catch(e => e);
        expect(err.message).toBe('something else entirely');
        expect(unload).not.toHaveBeenCalled();
    });
});


describe('cloud engine: when the address is missing or the reply is not from the proxy', () => {
    test('with no address it refuses before sending anything (an empty address would post to the page itself)', async () => {
        const fetchImpl = jest.fn();
        const e = createCloudEngine({ endpoint: '', fetchImpl });
        await expect(e.generate(msgs)).rejects.toThrow(/isn.t set up/);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('a reply that is a web page, not JSON, becomes a plain message, never "Unexpected token <"', async () => {
        const html = { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON'); } };
        const e = createCloudEngine({ endpoint: 'https://x.test', fetchImpl: async () => html });
        const err = await e.generate(msgs).catch(x => x);
        expect(err.message).toMatch(/can.t read/);
        expect(err.message).not.toMatch(/Unexpected token/);
    });
});
