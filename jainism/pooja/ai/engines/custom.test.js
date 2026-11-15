// The reader's own AI service: where the key goes (and doesn't), both request
// formats, the key's storage, and the messages for each way it can fail.

const {
    createCustomEngine, createKeyStore, normalizeBaseUrl, configProblem, destinationHost, KEY_STORAGE_KEY,
} = require('./custom');

const msgs = [{ role: 'system', content: 'rules' }, { role: 'user', content: 'hi' }];
const KEY = 'sk-test-SECRET-123';

const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const engineWith = (config, fetchImpl, key = KEY) => createCustomEngine({
    getConfig: () => config,
    keyStore: { get: () => key },
    fetchImpl,
});
const anthropic = { provider: 'anthropic', baseUrl: '', model: '' };
const openai = { provider: 'openai', baseUrl: 'https://llm.example.test/v1/', model: 'm1' };

describe('normalizeBaseUrl', () => {
    test('accepts https, and http only for this computer; drops trailing slash, query and fragment', () => {
        expect(normalizeBaseUrl('https://llm.example.test/v1/')).toBe('https://llm.example.test/v1');
        expect(normalizeBaseUrl(' https://llm.example.test/v1?x=1#y ')).toBe('https://llm.example.test/v1');
        expect(normalizeBaseUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/v1');
        expect(normalizeBaseUrl('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080');
    });
    test('refuses plain http elsewhere, other schemes, credentials and junk', () => {
        ['http://llm.example.test/v1', 'ftp://x.test', 'javascript:alert(1)', 'https://user:pw@x.test', 'not a url', '', null]
            .forEach(u => expect(normalizeBaseUrl(u)).toBeNull());
    });
});

describe('configProblem / destinationHost', () => {
    test('anthropic needs only a key; openai needs an address and a model, and a key unless the server is local', () => {
        expect(configProblem(anthropic, '')).toMatch(/API key/);
        expect(configProblem(anthropic, KEY)).toBe('');
        expect(configProblem({ ...openai, baseUrl: '' }, KEY)).toMatch(/address/);
        expect(configProblem({ ...openai, baseUrl: 'http://evil.test' }, KEY)).toMatch(/address/);
        expect(configProblem({ ...openai, model: '' }, KEY)).toMatch(/model/);
        expect(configProblem(openai, '')).toMatch(/API key/);
        expect(configProblem({ provider: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'm' }, '')).toBe('');
        expect(configProblem({ provider: 'bing' }, KEY)).toMatch(/Choose/);
    });
    test('names the host a question would go to', () => {
        expect(destinationHost(anthropic)).toBe('api.anthropic.com');
        expect(destinationHost(openai)).toBe('llm.example.test');
        expect(destinationHost({ provider: 'bing' })).toBe('');
    });
    test('available() reports what is missing, never the key', () => {
        const a = engineWith(anthropic, jest.fn(), '').available();
        expect(a.ok).toBe(false);
        expect(a.reason).not.toContain(KEY);
        expect(engineWith(anthropic, jest.fn()).available()).toEqual({ ok: true });
    });
});

describe('key store', () => {
    const mkStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

    test('by default the key lives for this tab only', () => {
        const session = mkStorage(), local = mkStorage();
        const store = createKeyStore({ session, local });
        store.set(KEY, false);
        expect(store.get()).toBe(KEY);
        expect(session.getItem(KEY_STORAGE_KEY)).toBe(KEY);
        expect(local.getItem(KEY_STORAGE_KEY)).toBeNull();
        expect(store.isRemembered()).toBe(false);
    });
    test('"remember" keeps it on the device instead, and switching back moves it', () => {
        const session = mkStorage(), local = mkStorage();
        const store = createKeyStore({ session, local });
        store.set(KEY, true);
        expect(local.getItem(KEY_STORAGE_KEY)).toBe(KEY);
        expect(session.getItem(KEY_STORAGE_KEY)).toBeNull();
        expect(store.isRemembered()).toBe(true);
        store.set(KEY, false);
        expect(local.getItem(KEY_STORAGE_KEY)).toBeNull();
        expect(session.getItem(KEY_STORAGE_KEY)).toBe(KEY);
    });
    test('clear removes it from both; an empty key stores nothing; broken storage is harmless', () => {
        const session = mkStorage(), local = mkStorage();
        const store = createKeyStore({ session, local });
        store.set(KEY, true);
        store.clear();
        expect(store.get()).toBe('');
        store.set('', true);
        expect(local.getItem(KEY_STORAGE_KEY)).toBeNull();
        const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
        const safe = createKeyStore({ session: broken, local: broken });
        expect(() => { safe.set(KEY, true); safe.clear(); }).not.toThrow();
        expect(safe.get()).toBe('');
    });
});

describe('anthropic format', () => {
    test('calls only Anthropic\u2019s address, with the key and the browser opt-in header, system sent separately', async () => {
        const fetchImpl = jest.fn(async () => reply({ content: [{ type: 'text', text: 'answer [A-1.1]' }] }));
        const onToken = jest.fn();
        const text = await engineWith(anthropic, fetchImpl).generate(msgs, { onToken });
        expect(text).toBe('answer [A-1.1]');
        expect(onToken).toHaveBeenCalledWith('answer [A-1.1]');
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe('https://api.anthropic.com/v1/messages');
        expect(init.headers['x-api-key']).toBe(KEY);
        expect(init.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
        expect(init.headers['anthropic-version']).toBe('2023-06-01');
        const body = JSON.parse(init.body);
        expect(body.system).toBe('rules');
        expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
        expect(body.model).toBe('claude-haiku-5-5');
        expect(body.max_tokens).toBeGreaterThan(0);
        expect(init.body).not.toContain(KEY);          // the key is a header, never in the body
    });
    test('uses the model the reader typed', async () => {
        const fetchImpl = jest.fn(async () => reply({ content: [{ type: 'text', text: 'x' }] }));
        await engineWith({ ...anthropic, model: 'my-model' }, fetchImpl).generate(msgs);
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body).model).toBe('my-model');
    });
    test('a stored base address is ignored: the key can only go to Anthropic', async () => {
        const fetchImpl = jest.fn(async () => reply({ content: [{ type: 'text', text: 'x' }] }));
        await engineWith({ ...anthropic, baseUrl: 'https://evil.test' }, fetchImpl).generate(msgs);
        expect(new URL(fetchImpl.mock.calls[0][0]).host).toBe('api.anthropic.com');
    });
});

describe('openai-compatible format', () => {
    test('posts to <address>/chat/completions with a bearer key and the system message in the list', async () => {
        const fetchImpl = jest.fn(async () => reply({ choices: [{ message: { content: 'hello' } }] }));
        const text = await engineWith(openai, fetchImpl).generate(msgs);
        expect(text).toBe('hello');
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe('https://llm.example.test/v1/chat/completions');
        expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
        const body = JSON.parse(init.body);
        expect(body.model).toBe('m1');
        expect(body.messages).toEqual(msgs);
        expect(body.max_tokens).toBeGreaterThan(0);
    });
    test('a server on this computer needs no key and gets no Authorization header', async () => {
        const fetchImpl = jest.fn(async () => reply({ choices: [{ message: { content: 'hi' } }] }));
        const cfg = { provider: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'llama' };
        await engineWith(cfg, fetchImpl, '').generate(msgs);
        expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions');
        expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
    });
    test('retries once with max_completion_tokens when the service asks for it', async () => {
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(reply({ error: { message: "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead." } }, 400))
            .mockResolvedValueOnce(reply({ choices: [{ message: { content: 'ok' } }] }));
        expect(await engineWith(openai, fetchImpl).generate(msgs)).toBe('ok');
        const second = JSON.parse(fetchImpl.mock.calls[1][1].body);
        expect(second.max_completion_tokens).toBeGreaterThan(0);
        expect(second).not.toHaveProperty('max_tokens');
    });
    test('refuses to send anything to an address that is not allowed', async () => {
        const fetchImpl = jest.fn();
        await expect(engineWith({ ...openai, baseUrl: 'http://evil.test/v1' }, fetchImpl).generate(msgs)).rejects.toThrow(/address/);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

describe('failures are readable and never contain the key', () => {
    const fail = (cfg, res) => engineWith(cfg, async () => res).generate(msgs).then(() => null, e => e.message);

    test('wrong key, unknown model, limits, bad request, server error', async () => {
        expect(await fail(anthropic, reply({}, 401))).toMatch(/didn.t accept your API key/);
        expect(await fail(anthropic, reply({}, 403))).toMatch(/didn.t accept your API key/);
        expect(await fail(anthropic, reply({}, 404))).toMatch(/model or address/);
        expect(await fail(anthropic, reply({}, 429))).toMatch(/rate or usage limit/);
        expect(await fail(anthropic, reply({}, 400))).toMatch(/rejected the request/);
        expect(await fail(anthropic, reply({}, 500))).toMatch(/error 500/);
        expect(await fail(anthropic, reply({}, 401))).toContain('api.anthropic.com');
    });
    test('includes the service\u2019s own explanation, with the key scrubbed out if it was echoed', async () => {
        const msg = await fail(anthropic, reply({ error: { message: `invalid x-api-key ${KEY} for model` } }, 401));
        expect(msg).toMatch(/invalid x-api-key/);
        expect(msg).not.toContain(KEY);
    });
    test('an unreachable or blocked address names the host and hints at CORS, without the key', async () => {
        const msg = await engineWith(openai, async () => { throw new TypeError('Failed to fetch'); }).generate(msgs).catch(e => e.message);
        expect(msg).toMatch(/reach llm\.example\.test/);
        expect(msg).toMatch(/allows requests from a web page/);
        expect(msg).not.toContain(KEY);
    });
    test('an empty answer is handed on as it is (the site then shows the matching passages); an abort stays an abort', async () => {
        await expect(engineWith(anthropic, async () => reply({ content: [] })).generate(msgs)).resolves.toBe('');
        const abort = Object.assign(new Error('x'), { name: 'AbortError' });
        await expect(engineWith(anthropic, async () => { throw abort; }).generate(msgs)).rejects.toMatchObject({ name: 'AbortError' });
    });
    test('generate refuses to run unconfigured, and says why', async () => {
        const fetchImpl = jest.fn();
        await expect(engineWith(anthropic, fetchImpl, '').generate(msgs)).rejects.toThrow(/API key/);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
