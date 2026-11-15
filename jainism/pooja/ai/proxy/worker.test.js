/** @jest-environment node */
// Tests for the Cloud proxy: origin/shape checks, rate limits, the exact daily
// budget (including failing closed), and what is sent upstream.

const worker = require('./worker').default;
const { Budget } = require('./worker');

const ORIGIN = 'https://abhijithda.github.io';

/** In-memory stand-in for a Durable Object's storage. */
function fakeStorage() {
    const m = new Map();
    return {
        get: async k => m.get(k),
        put: async (k, v) => { m.set(k, v); },
        deleteAll: async () => { m.clear(); },
        _map: m,
    };
}

/** A Budget namespace backed by the real Budget class (so worker and class are tested together). */
function budgetNamespace() {
    const storage = fakeStorage();
    const obj = new Budget({ storage });
    return {
        storage,
        idFromName: () => 'global',
        get: () => ({ fetch: (url, init) => obj.fetch(new Request(url, init)) }),
    };
}

const limiter = (allow = true) => ({ limit: jest.fn(async () => ({ success: allow })) });

function makeEnv(over = {}) {
    return {
        BACKEND: 'anthropic',           // the suites below test the Anthropic path; Workers AI has its own suite
        ANTHROPIC_API_KEY: 'sk-test',
        ALLOWED_ORIGINS: ORIGIN,
        IP_LIMITER: limiter(),
        GLOBAL_LIMITER: limiter(),
        BUDGET: budgetNamespace(),
        ...over,
    };
}

const goodBody = { system: 'rules', messages: [{ role: 'user', content: 'hi' }], max_tokens: 600 };

function req(body = goodBody, { origin = ORIGIN, method = 'POST', ip = '1.2.3.4' } = {}) {
    const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip };
    if (origin) headers.Origin = origin;
    return new Request('https://proxy.test/', { method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined });
}

let upstream;
beforeEach(() => {
    upstream = jest.fn(async () => new Response(JSON.stringify({
        content: [{ type: 'text', text: 'answer [A-1.1]' }],
        usage: { input_tokens: 1000, output_tokens: 100 },
    }), { status: 200 }));
    global.fetch = upstream;
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const json = async res => res.json();

describe('origin and request checks', () => {
    test('answers the allowed origin and sends CORS headers for exactly that origin', async () => {
        const res = await worker.fetch(req(), makeEnv());
        expect(res.status).toBe(200);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
        expect(await json(res)).toEqual({ text: 'answer [A-1.1]' });
    });

    test('refuses other origins and a missing origin, without CORS headers', async () => {
        for (const origin of ['https://evil.test', null]) {
            const res = await worker.fetch(req(goodBody, { origin }), makeEnv());
            expect(res.status).toBe(403);
            expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
        }
        expect(upstream).not.toHaveBeenCalled();
    });

    test('accepts several origins from a comma-separated list', async () => {
        const env = makeEnv({ ALLOWED_ORIGINS: `${ORIGIN}, http://localhost:8080` });
        const res = await worker.fetch(req(goodBody, { origin: 'http://localhost:8080' }), env);
        expect(res.status).toBe(200);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8080');
    });

    test('answers the preflight for the allowed origin only', async () => {
        const ok = await worker.fetch(new Request('https://proxy.test/', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), makeEnv());
        expect(ok.status).toBe(204);
        const no = await worker.fetch(new Request('https://proxy.test/', { method: 'OPTIONS', headers: { Origin: 'https://evil.test' } }), makeEnv());
        expect(no.status).toBe(403);
    });

    test('rejects GET, bad JSON, wrong shapes and oversized bodies', async () => {
        const env = makeEnv();
        expect((await worker.fetch(req(goodBody, { method: 'GET' }), env)).status).toBe(403);
        const badJson = new Request('https://proxy.test/', { method: 'POST', headers: { Origin: ORIGIN }, body: '{nope' });
        expect((await worker.fetch(badJson, env)).status).toBe(400);
        for (const bad of [
            { system: 1, messages: [{ role: 'user', content: 'x' }] },
            { system: 's', messages: [] },
            { system: 's', messages: [{ role: 'user', content: 5 }] },
            { system: 's', messages: Array(13).fill({ role: 'user', content: 'x' }) },
        ]) {
            expect((await worker.fetch(req(bad), env)).status).toBe(400);
        }
        const big = { system: 's', messages: [{ role: 'user', content: 'x'.repeat(41_000) }] };
        expect((await worker.fetch(req(big), env)).status).toBe(413);
        expect(upstream).not.toHaveBeenCalled();
    });

    test('refuses to run when a limiter, the budget or the key is missing (fails closed)', async () => {
        for (const missing of ['IP_LIMITER', 'GLOBAL_LIMITER', 'BUDGET', 'ANTHROPIC_API_KEY']) {
            const env = makeEnv({ [missing]: undefined });
            expect((await worker.fetch(req(), env)).status).toBe(500);
        }
        expect(upstream).not.toHaveBeenCalled();
    });
});

describe('rate limiting', () => {
    test('429 with Retry-After when the visitor is over the per-minute limit; no upstream call', async () => {
        const env = makeEnv({ IP_LIMITER: limiter(false) });
        const res = await worker.fetch(req(), env);
        expect(res.status).toBe(429);
        expect(res.headers.get('Retry-After')).toBe('60');
        expect((await json(res)).error).toBe('rate');
        expect(upstream).not.toHaveBeenCalled();
    });

    test('the per-IP limiter is keyed by the visitor IP', async () => {
        const env = makeEnv();
        await worker.fetch(req(goodBody, { ip: '9.9.9.9' }), env);
        expect(env.IP_LIMITER.limit).toHaveBeenCalledWith({ key: '9.9.9.9' });
    });

    test('429 when the whole site is over its per-minute limit', async () => {
        const env = makeEnv({ GLOBAL_LIMITER: limiter(false) });
        const res = await worker.fetch(req(), env);
        expect(res.status).toBe(429);
        expect((await json(res)).error).toBe('busy');
        expect(upstream).not.toHaveBeenCalled();
    });

    test('a failing rate limiter refuses the question rather than letting it through', async () => {
        const env = makeEnv({ IP_LIMITER: { limit: async () => { throw new Error('down'); } } });
        expect((await worker.fetch(req(), env)).status).toBe(503);
        expect(upstream).not.toHaveBeenCalled();
    });
});

describe('daily budget', () => {
    test('stops at the daily request cap with 503, and does not call the API', async () => {
        const env = makeEnv({ DAILY_REQUEST_CAP: '2', PER_IP_DAILY_CAP: '99' });
        expect((await worker.fetch(req(goodBody, { ip: 'a' }), env)).status).toBe(200);
        expect((await worker.fetch(req(goodBody, { ip: 'b' }), env)).status).toBe(200);
        const third = await worker.fetch(req(goodBody, { ip: 'c' }), env);
        expect(third.status).toBe(503);
        expect((await json(third)).error).toBe('budget');
        expect(upstream).toHaveBeenCalledTimes(2);
    });

    test('stops one visitor at their daily cap (429) while others still get answers', async () => {
        const env = makeEnv({ PER_IP_DAILY_CAP: '1' });
        expect((await worker.fetch(req(goodBody, { ip: 'a' }), env)).status).toBe(200);
        const again = await worker.fetch(req(goodBody, { ip: 'a' }), env);
        expect(again.status).toBe(429);
        expect((await json(again)).error).toBe('ip-daily');
        expect((await worker.fetch(req(goodBody, { ip: 'b' }), env)).status).toBe(200);
    });

    test('counts the tokens the API reports and stops when the input-token cap is used up', async () => {
        const env = makeEnv({ DAILY_INPUT_TOKEN_CAP: '1500', PER_IP_DAILY_CAP: '99' });
        expect((await worker.fetch(req(goodBody, { ip: 'a' }), env)).status).toBe(200);   // uses 1000
        expect((await worker.fetch(req(goodBody, { ip: 'b' }), env)).status).toBe(200);   // 1000 < 1500 when checked -> uses 1000 more
        expect((await worker.fetch(req(goodBody, { ip: 'c' }), env)).status).toBe(503);   // 2000 >= 1500
        expect(upstream).toHaveBeenCalledTimes(2);
    });

    test('stops when the output-token cap is used up', async () => {
        const env = makeEnv({ DAILY_OUTPUT_TOKEN_CAP: '100', PER_IP_DAILY_CAP: '99' });
        expect((await worker.fetch(req(goodBody, { ip: 'a' }), env)).status).toBe(200);   // uses 100
        expect((await worker.fetch(req(goodBody, { ip: 'b' }), env)).status).toBe(503);
    });

    test('a broken budget counter refuses the question (fails closed)', async () => {
        const env = makeEnv({ BUDGET: { idFromName: () => 'g', get: () => ({ fetch: async () => new Response('x', { status: 500 }) }) } });
        expect((await worker.fetch(req(), env)).status).toBe(503);
        expect(upstream).not.toHaveBeenCalled();
    });

    test('a failure to record tokens still delivers the answer that was already paid for', async () => {
        let calls = 0;
        const real = budgetNamespace();
        const env = makeEnv({ BUDGET: { idFromName: real.idFromName, get: () => ({
            fetch: (url, init) => (++calls === 2 ? Promise.reject(new Error('boom')) : real.get().fetch(url, init)),
        }) } });
        const res = await worker.fetch(req(), env);
        expect(res.status).toBe(200);
        expect((await json(res)).text).toMatch(/answer/);
    });

    test('Budget keeps no raw IP addresses and starts from zero on a new UTC day', async () => {
        const env = makeEnv();
        await worker.fetch(req(goodBody, { ip: '203.0.113.7' }), env);
        const keys = [...env.BUDGET.storage._map.keys()];
        expect(keys.some(k => k.includes('203.0.113.7'))).toBe(false);
        expect(keys.some(k => k.startsWith('ip:'))).toBe(true);

        env.BUDGET.storage._map.set('day', '2000-01-01');   // pretend the counters are from an old day
        await worker.fetch(req(goodBody, { ip: '203.0.113.7' }), env);
        expect(env.BUDGET.storage._map.get('requests')).toBe(1);
        expect(env.BUDGET.storage._map.get('day')).toBe(new Date().toISOString().slice(0, 10));
    });
});

describe('upstream call', () => {
    test('sends the key only upstream, clamps max_tokens, uses the configured model, never returns the key', async () => {
        const env = makeEnv({ MODEL: 'claude-test-model' });
        const res = await worker.fetch(req({ ...goodBody, max_tokens: 99999 }), env);
        const [, init] = upstream.mock.calls[0];
        expect(init.headers['x-api-key']).toBe('sk-test');
        const sent = JSON.parse(init.body);
        expect(sent.max_tokens).toBe(800);
        expect(sent.model).toBe('claude-test-model');
        expect(sent.system).toBe('rules');
        expect(JSON.stringify(await json(res))).not.toContain('sk-test');
    });

    test('only user/assistant roles go upstream', async () => {
        await worker.fetch(req({ system: 's', messages: [{ role: 'system', content: 'sneaky' }, { role: 'assistant', content: 'a' }] }), makeEnv());
        const sent = JSON.parse(upstream.mock.calls[0][1].body);
        expect(sent.messages.map(m => m.role)).toEqual(['user', 'assistant']);
    });

    test('maps upstream 429 to 429 and other failures to 502, without leaking details', async () => {
        global.fetch = jest.fn(async () => new Response('secret detail', { status: 429 }));
        const limited = await worker.fetch(req(), makeEnv());
        expect(limited.status).toBe(429);
        global.fetch = jest.fn(async () => new Response('secret detail', { status: 401 }));
        const failed = await worker.fetch(req(), makeEnv());
        expect(failed.status).toBe(502);
        expect(await failed.text()).not.toContain('secret');
    });

    test('a network failure upstream is a 502', async () => {
        global.fetch = jest.fn(async () => { throw new Error('offline'); });
        expect((await worker.fetch(req(), makeEnv())).status).toBe(502);
    });
});


describe('workers ai backend (the free default)', () => {
    const okOut = (text = 'free answer [A-1.1]', usage = { prompt_tokens: 1000, completion_tokens: 100 }) =>
        ({ choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage });
    const aiEnv = (run, over = {}) => makeEnv({ BACKEND: undefined, ANTHROPIC_API_KEY: undefined, AI: { run }, MODEL: undefined, ...over });

    test('is the default backend, needs no API key, and never calls the Anthropic API', async () => {
        const run = jest.fn(async () => okOut());
        const res = await worker.fetch(req(), aiEnv(run));
        expect(res.status).toBe(200);
        expect(await json(res)).toEqual({ text: 'free answer [A-1.1]' });
        expect(upstream).not.toHaveBeenCalled();
    });

    test('refuses to run without the AI binding, and on an unknown backend', async () => {
        expect((await worker.fetch(req(), aiEnv(null, { AI: undefined }))).status).toBe(500);
        expect((await worker.fetch(req(), makeEnv({ BACKEND: 'bing' }))).status).toBe(500);
        expect(upstream).not.toHaveBeenCalled();
    });

    test('sends the system prompt first, clamps max_tokens, uses Gemma 4 by default, and turns thinking off', async () => {
        const run = jest.fn(async () => okOut());
        await worker.fetch(req({ ...goodBody, max_tokens: 99999 }), aiEnv(run));
        const [model, input] = run.mock.calls[0];
        expect(model).toBe('@cf/google/gemma-4-26b-a4b-it');
        expect(input.messages).toEqual([{ role: 'system', content: 'rules' }, { role: 'user', content: 'hi' }]);
        expect(input.max_tokens).toBe(800);
        expect(input.chat_template_kwargs).toEqual({ enable_thinking: false });
    });

    test('uses the configured model, and leaves the thinking switch out when told to', async () => {
        const run = jest.fn(async () => okOut());
        await worker.fetch(req(), aiEnv(run, { MODEL: '@cf/meta/llama-3.1-8b-instruct-fp8-fast', DISABLE_THINKING: 'false' }));
        const [model, input] = run.mock.calls[0];
        expect(model).toBe('@cf/meta/llama-3.1-8b-instruct-fp8-fast');
        expect(input).not.toHaveProperty('chat_template_kwargs');
    });

    test('only user/assistant roles go to the model', async () => {
        const run = jest.fn(async () => okOut());
        await worker.fetch(req({ system: 's', messages: [{ role: 'system', content: 'sneaky' }, { role: 'assistant', content: 'a' }] }), aiEnv(run));
        expect(run.mock.calls[0][1].messages.map(m => m.role)).toEqual(['system', 'user', 'assistant']);
    });

    test('reads the older { response } shape too', async () => {
        const res = await worker.fetch(req(), aiEnv(async () => ({ response: 'old shape [A-1.1]' })));
        expect((await json(res)).text).toBe('old shape [A-1.1]');
    });

    test('counts the tokens it reports, and estimates them when none are reported', async () => {
        const env = aiEnv(async () => okOut());
        await worker.fetch(req(), env);
        expect(env.BUDGET.storage._map.get('inTokens')).toBe(1000);
        expect(env.BUDGET.storage._map.get('outTokens')).toBe(100);

        const env2 = aiEnv(async () => ({ choices: [{ message: { content: 'x'.repeat(300) } }] }));
        await worker.fetch(req(), env2);
        expect(env2.BUDGET.storage._map.get('inTokens')).toBeGreaterThan(0);     // never stands still
        expect(env2.BUDGET.storage._map.get('outTokens')).toBe(100);
    });

    test('without caps in the config, defaults keep a day inside the free allowance (25 questions per visitor)', async () => {
        const env = aiEnv(async () => okOut('ok', { prompt_tokens: 10, completion_tokens: 1 }));
        for (let i = 0; i < 25; i++) expect((await worker.fetch(req(goodBody, { ip: 'same' }), env)).status).toBe(200);
        const over = await worker.fetch(req(goodBody, { ip: 'same' }), env);
        expect(over.status).toBe(429);
        expect((await json(over)).error).toBe('ip-daily');
    });

    test('the free daily allowance running out becomes this site\u2019s own "limit for today" (503 budget)', async () => {
        const run = async () => { throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); };
        const res = await worker.fetch(req(), aiEnv(run));
        expect(res.status).toBe(503);
        expect((await json(res)).error).toBe('budget');
    });

    test('any other model error is a 502, and its details are not passed on', async () => {
        const res = await worker.fetch(req(), aiEnv(async () => { throw new Error('internal secret detail'); }));
        expect(res.status).toBe(502);
        expect(await res.text()).not.toContain('secret');
    });

    test('an empty answer is delivered as empty (the site shows the passages) and the reason is logged', async () => {
        const res = await worker.fetch(req(), aiEnv(async () => ({ choices: [{ message: { content: null }, finish_reason: 'length' }] })));
        expect(res.status).toBe(200);
        expect((await json(res)).text).toBe('');
        const logged = console.error.mock.calls.map(c => c.join(' ')).join('\n');
        expect(logged).toMatch(/empty answer workers-ai/);
        expect(logged).toMatch(/finish_reason=length/);
        expect(logged).not.toContain('hi');        // never the question
    });
});

describe('anthropic backend: empty answers', () => {
    test('a reply with no text block is delivered as empty, with stop_reason and block types logged', async () => {
        global.fetch = jest.fn(async () => new Response(JSON.stringify({
            content: [{ type: 'thinking', thinking: '...' }], stop_reason: 'max_tokens', usage: { input_tokens: 500, output_tokens: 800 },
        }), { status: 200 }));
        const env = makeEnv();
        const res = await worker.fetch(req(), env);
        expect((await json(res)).text).toBe('');
        expect(console.error.mock.calls.map(c => c.join(' ')).join('\n')).toMatch(/stop_reason=max_tokens blocks=\[thinking\]/);
        expect(env.BUDGET.storage._map.get('outTokens')).toBe(800);              // the tokens were spent, so they count
    });
});


describe('wrangler.toml', () => {
    const toml = require('fs').readFileSync(require('path').join(__dirname, 'wrangler.toml'), 'utf8');
    const origins = (toml.match(/^ALLOWED_ORIGINS\s*=\s*"([^"]*)"/m) || [])[1].split(',').map(s => s.trim());

    test('keeps the live site\u2019s address, and allows the local dev server so Cloud can be tried before publishing', () => {
        expect(origins).toContain('https://abhijithda.github.io');
        expect(origins).toContain('http://127.0.0.1:3000');
        expect(origins).toContain('http://localhost:3000');
    });

    test('only lists plain origins (scheme + host [+ port]), never a path or a wildcard', () => {
        origins.forEach(o => expect(o).toMatch(/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i));
    });

    test('a listed local origin is answered, an unlisted port is not', async () => {
        const env = makeEnv({ ALLOWED_ORIGINS: origins.join(',') });
        expect((await worker.fetch(req(goodBody, { origin: 'http://127.0.0.1:3000' }), env)).status).toBe(200);
        expect((await worker.fetch(req(goodBody, { origin: 'http://127.0.0.1:4000' }), env)).status).toBe(403);
    });
});
