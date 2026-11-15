// ai/proxy/worker.js — Cloudflare Worker that sits between the site and the AI model
// for the Cloud engine. NOT part of the site: it is deployed separately (see
// ai/proxy/README.md) and its URL goes in ai/config.js.
//
// Why it exists: the model must be reached from a server (no key in the browser, and a
// place to enforce limits), and anyone who finds this URL must not be able to run up a bill.
//
// Backend (wrangler.toml `BACKEND`):
//   'workers-ai' (default) : Cloudflare Workers AI, called through the `AI` binding. FREE:
//        no API key and no card; the account gets 10,000 "neurons" a day, and on the Workers
//        Free plan the platform itself refuses requests beyond that (no overage billing).
//   'anthropic'            : Anthropic's API with the ANTHROPIC_API_KEY secret (paid, prepaid credits).
//
// Layers, cheapest first:
//   1. Origin allow-list + size/shape checks.   (stops casual misuse; NOT security,
//      since a script can fake the Origin header — layers 2-4 are the real protection)
//   2. Rate limiting (Cloudflare binding): per visitor IP and for the whole site,
//      per minute. The binding is approximate by design (per Cloudflare location,
//      eventually consistent), so it is a burst filter, not an accounting system.
//   3. Exact daily budget (Durable Object `Budget`): requests per day, requests per
//      IP per day, and input/output tokens per day, counted from the usage the backend
//      reports. Resets at 00:00 UTC. Fails CLOSED: if the counter can't be reached,
//      the question is refused. The defaults sit under the free allowance, so readers
//      see this site's own "limit for today" message, not a provider error.
//   4. The provider's own cap: Workers AI's free daily allowance (above), or a spend
//      limit on the API key's workspace in the Anthropic Console (set by hand).
//
// Config lives in wrangler.toml (vars, limits, bindings).

const MAX_BODY_CHARS = 40_000;      // question + retrieved passages are a few KB
const MAX_TOKENS = 800;             // hard ceiling on one answer
const MAX_MESSAGES = 12;
const MAX_FIELD_CHARS = 30_000;
const UPSTREAM_TIMEOUT_MS = 25_000;

const DEFAULT_BACKEND = 'workers-ai';
const DEFAULT_MODELS = { 'workers-ai': '@cf/google/gemma-4-26b-a4b-it', anthropic: 'claude-haiku-5-5' };

// Used when wrangler.toml doesn't set a cap. The workers-ai numbers keep a worst-case day
// (all input tokens or all output tokens at the model's neuron rates) under 10,000 neurons.
const DEFAULT_CAPS = {
    'workers-ai': { requests: 150, ipRequests: 25, inTokens: 700_000, outTokens: 60_000 },
    anthropic:    { requests: 300, ipRequests: 40, inTokens: 2_000_000, outTokens: 200_000 },
};

function num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function allowedOrigins(env) {
    return String(env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || '')
        .split(',').map(s => s.trim()).filter(Boolean);
}

async function hashIp(ip) {
    const bytes = new TextEncoder().encode(ip);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

function validate(body) {
    if (!body || typeof body !== 'object') return false;
    const { system, messages } = body;
    if (typeof system !== 'string' || system.length > MAX_FIELD_CHARS) return false;
    if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) return false;
    return messages.every(m => m && typeof m.content === 'string' && m.content.length <= MAX_FIELD_CHARS);
}

/** A refusal the handler turns into { error: code } with this status. */
class Refusal extends Error {
    constructor(status, code, headers = {}) { super(code); this.status = status; this.code = code; this.headers = headers; }
}

const roleOf = m => (m.role === 'assistant' ? 'assistant' : 'user');
const estimateTokens = s => Math.ceil(String(s || '').length / 3);

// ── Backends ─────────────────────────────────────────────────────────────
// Each returns { text, inTokens, outTokens, note } and throws Refusal. `note` says why the
// text is empty when it is (logged, never returned to the browser).

async function runAnthropic(env, body, maxTokens) {
    let upstream;
    try {
        upstream = await fetch(env.UPSTREAM_URL || 'https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: env.MODEL || DEFAULT_MODELS.anthropic,
                system: body.system,
                messages: body.messages.map(m => ({ role: roleOf(m), content: m.content })),
                max_tokens: maxTokens,
            }),
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });
    } catch (err) {
        console.error('anthropic unreachable', err);
        throw new Refusal(502, 'upstream');
    }
    if (!upstream.ok) {
        // The status only (never the body or the key), so `wrangler tail` shows why.
        console.error('anthropic error', upstream.status);
        throw upstream.status === 429 ? new Refusal(429, 'rate', { 'Retry-After': '60' }) : new Refusal(502, 'upstream');
    }
    const data = await upstream.json();
    const blocks = Array.isArray(data.content) ? data.content : [];
    const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('');
    return {
        text,
        inTokens: num(data.usage?.input_tokens, 0),
        outTokens: num(data.usage?.output_tokens, 0),
        note: text ? '' : `stop_reason=${data.stop_reason} blocks=[${blocks.map(b => b.type).join(',')}]`,
    };
}

async function runWorkersAi(env, body, maxTokens) {
    const messages = [
        ...(body.system ? [{ role: 'system', content: body.system }] : []),
        ...body.messages.map(m => ({ role: roleOf(m), content: m.content })),
    ];
    const input = { messages, max_tokens: maxTokens };
    // Gemma 4 "thinks" before answering unless told not to, and the thinking can use up the whole
    // token budget, leaving an empty answer. Cloudflare's own example turns it off this way.
    if (env.DISABLE_THINKING !== 'false') input.chat_template_kwargs = { enable_thinking: false };

    let out;
    try {
        out = await env.AI.run(env.MODEL || DEFAULT_MODELS['workers-ai'], input);
    } catch (err) {
        const message = String(err?.message || err).slice(0, 300);
        console.error('workers ai error', message);
        // Past the free daily allowance the platform refuses with an error about the allocation.
        throw /neuron|allocation|daily|quota|limit|4006/i.test(message) ? new Refusal(503, 'budget') : new Refusal(502, 'upstream');
    }

    const choice = out?.choices?.[0];
    const content = choice?.message?.content ?? out?.response;      // current shape, then the older one
    const text = typeof content === 'string' ? content : '';
    // Prefer the backend's own token counts; estimate from length if it gives none, so the daily
    // counter can never silently stand still.
    const usage = out?.usage || {};
    const reportedIn = num(usage.prompt_tokens ?? usage.input_tokens, 0);
    const reportedOut = num(usage.completion_tokens ?? usage.output_tokens, 0);
    return {
        text,
        inTokens: reportedIn || estimateTokens(messages.map(m => m.content).join('')),
        outTokens: reportedOut || estimateTokens(text),
        note: text ? '' : `finish_reason=${choice?.finish_reason} keys=[${Object.keys(out || {}).join(',')}]`,
    };
}

const BACKENDS = {
    'workers-ai': { run: runWorkersAi, needs: env => (env.AI ? [] : ['AI']) },
    anthropic:    { run: runAnthropic, needs: env => (env.ANTHROPIC_API_KEY ? [] : ['ANTHROPIC_API_KEY']) },
};

export default {
    async fetch(request, env) {
        const origins = allowedOrigins(env);
        const origin = request.headers.get('Origin');
        const originOk = origins.includes(origin);

        const cors = originOk ? {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Vary': 'Origin',
        } : { 'Vary': 'Origin' };

        // `code` is a short machine-readable reason the site turns into a readable message.
        const reply = (status, code, extra = {}) => new Response(JSON.stringify({ error: code }), {
            status,
            headers: { ...cors, 'Content-Type': 'application/json', ...extra },
        });

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: originOk ? 204 : 403, headers: cors });
        }
        if (request.method !== 'POST' || !originOk) return reply(403, 'forbidden');

        // A cap that silently doesn't apply is worse than no endpoint: refuse to run unconfigured.
        const backendName = env.BACKEND || DEFAULT_BACKEND;
        const backend = BACKENDS[backendName];
        const missing = backend
            ? ['IP_LIMITER', 'GLOBAL_LIMITER', 'BUDGET'].filter(k => !env[k]).concat(backend.needs(env))
            : ['a valid BACKEND (got ' + backendName + ')'];
        if (missing.length) {
            console.error('proxy misconfigured: missing', missing);
            return reply(500, 'misconfigured');
        }

        const declared = Number(request.headers.get('Content-Length'));
        if (declared > MAX_BODY_CHARS * 4) return reply(413, 'too-large');

        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

        // Layer 2 — per-minute rate limits (checked before reading the body).
        try {
            const perIp = await env.IP_LIMITER.limit({ key: ip });
            if (!perIp.success) return reply(429, 'rate', { 'Retry-After': '60' });
            const site = await env.GLOBAL_LIMITER.limit({ key: 'site' });
            if (!site.success) return reply(429, 'busy', { 'Retry-After': '60' });
        } catch (err) {
            console.error('rate limiter failed', err);
            return reply(503, 'unavailable');
        }

        const raw = await request.text();
        if (raw.length > MAX_BODY_CHARS) return reply(413, 'too-large');
        let body;
        try { body = JSON.parse(raw); } catch { return reply(400, 'bad-request'); }
        if (!validate(body)) return reply(400, 'bad-request');

        // Layer 3 — exact daily budget. Counts this request now, tokens after the answer.
        const budget = env.BUDGET.get(env.BUDGET.idFromName('global'));
        const call = async (path, payload) => {
            const res = await budget.fetch('https://budget' + path, { method: 'POST', body: JSON.stringify(payload) });
            if (!res.ok) throw new Error('budget ' + res.status);
            return res.json();
        };
        const defaults = DEFAULT_CAPS[backendName];
        try {
            const verdict = await call('/check', {
                ip: await hashIp(ip),
                caps: {
                    requests: num(env.DAILY_REQUEST_CAP, defaults.requests),
                    ipRequests: num(env.PER_IP_DAILY_CAP, defaults.ipRequests),
                    inTokens: num(env.DAILY_INPUT_TOKEN_CAP, defaults.inTokens),
                    outTokens: num(env.DAILY_OUTPUT_TOKEN_CAP, defaults.outTokens),
                },
            });
            if (!verdict.ok) {
                return verdict.reason === 'ip-daily'
                    ? reply(429, 'ip-daily')
                    : reply(503, 'budget');
            }
        } catch (err) {
            console.error('budget check failed (refusing)', err);
            return reply(503, 'unavailable');
        }

        let result;
        try {
            result = await backend.run(env, body, Math.min(Number(body.max_tokens) || MAX_TOKENS, MAX_TOKENS));
        } catch (err) {
            if (err instanceof Refusal) return reply(err.status, err.code, err.headers);
            console.error('backend failed', err);
            return reply(502, 'upstream');
        }

        try {
            await call('/record', { inTokens: result.inTokens, outTokens: result.outTokens });
        } catch (err) {
            console.error('budget record failed', err);   // the answer was already paid for: still deliver it
        }

        // An empty answer is not an error: the site falls back to showing the matching passages.
        // Say why in the logs (never the question or the passages) so it can be fixed.
        if (!result.text.trim()) console.error('empty answer', backendName, result.note);

        return new Response(JSON.stringify({ text: result.text }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    },
};

// Durable Object: one global instance, one day's counters, exact (a Durable Object
// handles its storage operations one at a time, so concurrent questions can't both
// slip under a cap). Per-IP counts hold a short hash of the IP, not the address.
export class Budget {
    constructor(ctx) { this.ctx = ctx; }

    async fetch(request) {
        const { pathname } = new URL(request.url);
        const body = await request.json();
        const store = this.ctx.storage;
        const today = new Date().toISOString().slice(0, 10);

        if ((await store.get('day')) !== today) {   // new UTC day: start from zero
            await store.deleteAll();
            await store.put('day', today);
        }

        const json = obj => new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } });

        if (pathname === '/check') {
            const { ip, caps } = body;
            const used = {
                requests: (await store.get('requests')) || 0,
                inTokens: (await store.get('inTokens')) || 0,
                outTokens: (await store.get('outTokens')) || 0,
            };
            const ipKey = 'ip:' + ip;
            const ipCount = (await store.get(ipKey)) || 0;
            if (ipCount >= caps.ipRequests) return json({ ok: false, reason: 'ip-daily' });
            if (used.requests >= caps.requests || used.inTokens >= caps.inTokens || used.outTokens >= caps.outTokens) {
                return json({ ok: false, reason: 'budget' });
            }
            await store.put('requests', used.requests + 1);
            await store.put(ipKey, ipCount + 1);
            return json({ ok: true });
        }

        if (pathname === '/record') {
            await store.put('inTokens', ((await store.get('inTokens')) || 0) + num(body.inTokens, 0));
            await store.put('outTokens', ((await store.get('outTokens')) || 0) + num(body.outTokens, 0));
            return json({ ok: true });
        }

        return new Response('Not found', { status: 404 });
    }
}
