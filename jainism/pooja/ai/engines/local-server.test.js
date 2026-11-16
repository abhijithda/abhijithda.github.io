// "Local" with a model already on this computer (Ollama / LM Studio): only this computer's addresses, no key,
// requests marked for the browser's local-network permission, and messages that name what the reader can fix.

const { createLocalServerEngine, listServerModels, unreachableMessage, failureMessage } = require('./local-server');

const msgs = [{ role: 'system', content: 'rules' }, { role: 'user', content: 'hi' }];
const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body, clone() { return this; } });
const config = { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2:3b' };
const engineWith = (cfg, fetchImpl) => createLocalServerEngine({ getConfig: () => cfg, fetchImpl });

describe('the engine', () => {
    test('reports itself as the local engine, so the app treats it as the on-device one', () => {
        expect(engineWith(config, jest.fn()).id).toBe('local');
    });

    test('posts the chat-completions request to the server with no key and the loopback marker', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(reply({ choices: [{ message: { content: 'answer' } }] }));
        const text = await engineWith(config, fetchImpl).generate(msgs);
        expect(text).toBe('answer');
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe('http://localhost:11434/v1/chat/completions');
        expect(init.targetAddressSpace).toBe('loopback');
        expect(init.headers.Authorization).toBeUndefined();
        expect(JSON.parse(init.body).model).toBe('llama3.2:3b');
    });

    test('refuses any address that is not on this computer, before sending anything', async () => {
        const fetchImpl = jest.fn();
        const e = engineWith({ baseUrl: 'https://api.example.test/v1', model: 'm' }, fetchImpl);
        expect(e.available()).toEqual({ ok: false, reason: expect.stringMatching(/on this computer/) });
        await expect(e.generate(msgs)).rejects.toThrow(/on this computer/);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('a model name is required, and the message says so', () => {
        expect(engineWith({ ...config, model: '' }, jest.fn()).available().reason).toMatch(/model/i);
        expect(engineWith(config, jest.fn()).available()).toEqual({ ok: true });
    });

    test('works with LM Studio\u2019s address and with 127.0.0.1', () => {
        expect(engineWith({ baseUrl: 'http://localhost:1234/v1', model: 'm' }, jest.fn()).available().ok).toBe(true);
        expect(engineWith({ baseUrl: 'http://127.0.0.1:11434/v1', model: 'm' }, jest.fn()).available().ok).toBe(true);
    });

    test('a request that never gets an answer says to check the server, the allowed address and the browser\u2019s permission', async () => {
        const e = engineWith(config, jest.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        await expect(e.generate(msgs)).rejects.toThrow(/Ollama.*OLLAMA_ORIGINS.*Allow/s);
    });

    test('403 means the page isn\u2019t allowed; 404 means the model isn\u2019t there; neither blames an API key', async () => {
        await expect(engineWith(config, jest.fn().mockResolvedValue(reply({}, 403))).generate(msgs)).rejects.toThrow(/refused this page.*OLLAMA_ORIGINS/s);
        const missing = engineWith(config, jest.fn().mockResolvedValue(reply({ error: { message: 'model not found' } }, 404)));
        await expect(missing.generate(msgs)).rejects.toThrow(/doesn.t have that model.*model not found/s);
        await expect(missing.generate(msgs)).rejects.not.toThrow(/API key/);
    });

    test('other errors use the standard wording', async () => {
        await expect(engineWith(config, jest.fn().mockResolvedValue(reply({}, 500))).generate(msgs)).rejects.toThrow(/error 500/);
    });

    test('reads the settings afresh on every call', async () => {
        let cfg = config;
        const fetchImpl = jest.fn().mockResolvedValue(reply({ choices: [{ message: { content: 'x' } }] }));
        const e = createLocalServerEngine({ getConfig: () => cfg, fetchImpl });
        await e.generate(msgs);
        cfg = { baseUrl: 'http://localhost:1234/v1', model: 'other' };
        await e.generate(msgs);
        expect(fetchImpl.mock.calls[1][0]).toBe('http://localhost:1234/v1/chat/completions');
        expect(JSON.parse(fetchImpl.mock.calls[1][1].body).model).toBe('other');
    });

    test('prepare() has nothing to download, and accepts the progress callback the panel passes', async () => {
        await expect(engineWith(config, jest.fn()).prepare(() => {})).resolves.toBeUndefined();
    });
});

describe('listServerModels', () => {
    test('returns the model ids the server lists (Ollama and LM Studio both answer /models)', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(reply({ object: 'list', data: [{ id: 'llama3.2:3b' }, { id: 'qwen2.5:7b' }, { nope: 1 }] }));
        const r = await listServerModels('http://localhost:11434/v1/', { fetchImpl });
        expect(r).toEqual({ ok: true, models: ['llama3.2:3b', 'qwen2.5:7b'] });
        expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:11434/v1/models');
        expect(fetchImpl.mock.calls[0][1].targetAddressSpace).toBe('loopback');
    });

    test('never throws: a dead or blocked server gives the explanation', async () => {
        const r = await listServerModels('http://localhost:11434/v1', { fetchImpl: jest.fn().mockRejectedValue(new TypeError('Failed to fetch')) });
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/OLLAMA_ORIGINS/);
    });

    test('an address that is not on this computer is refused without a request', async () => {
        const fetchImpl = jest.fn();
        expect((await listServerModels('https://api.example.test/v1', { fetchImpl })).ok).toBe(false);
        expect((await listServerModels('', { fetchImpl })).ok).toBe(false);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('HTTP errors and non-JSON answers say what to check', async () => {
        expect((await listServerModels('http://localhost:11434/v1', { fetchImpl: async () => reply({}, 403) })).reason).toMatch(/refused this page/);
        expect((await listServerModels('http://localhost:11434/v1', { fetchImpl: async () => reply({}, 500) })).reason).toMatch(/error \(500\)/);
        const html = { ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } };
        expect((await listServerModels('http://localhost:11434/v1', { fetchImpl: async () => html })).reason).toMatch(/\/v1/);
    });

    test('an empty list is a success with no models', async () => {
        expect(await listServerModels('http://localhost:11434/v1', { fetchImpl: async () => reply({ data: [] }) })).toEqual({ ok: true, models: [] });
    });
});

describe('messages', () => {
    test('name the page address to allow', () => {
        expect(unreachableMessage('localhost:11434', 'https://abhijithda.github.io')).toMatch(/https:\/\/abhijithda\.github\.io/);
        expect(failureMessage(403, 'localhost:11434', '', 'https://abhijithda.github.io')).toMatch(/https:\/\/abhijithda\.github\.io/);
        expect(failureMessage(500, 'localhost:11434', '')).toBeUndefined();
    });
});
