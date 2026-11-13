const { createCloudEngine } = require('./cloud');
const { createLocalEngine } = require('./local');
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

describe('getEngine', () => {
    test('maps settings values to engines, and off/unknown to null', () => {
        expect(getEngine('off')).toBeNull();
        expect(getEngine('gpt')).toBeNull();
        expect(getEngine('cloud').id).toBe('cloud');
        expect(getEngine('local').id).toBe('local');
        expect(getEngine('cloud')).toBe(getEngine('cloud'));   // reused, so a loaded model is kept
    });
});
