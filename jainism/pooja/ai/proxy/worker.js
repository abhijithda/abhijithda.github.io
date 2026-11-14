// ai/proxy/worker.js — Cloudflare Worker that sits between the site and the
// Anthropic API for the Cloud engine. NOT part of the site: it is deployed
// separately (see ai/proxy/README.md) and its URL goes in ai/config.js.
//
// Why it exists: the API key must never reach the browser, and anyone who finds
// this URL must not be able to run up the bill. Four layers, cheapest first:
//   1. Origin allow-list + size/shape checks.   (stops casual misuse; NOT security,
//      since a script can fake the Origin header — layers 2-4 are the real protection)
//   2. Rate limiting (Cloudflare binding): per visitor IP and for the whole site,
//      per minute. The binding is approximate by design (per Cloudflare location,
//      eventually consistent), so it is a burst filter, not an accounting system.
//   3. Exact daily budget (Durable Object `Budget`): requests per day, requests per
//      IP per day, and input/output tokens per day, counted from the `usage` the
//      API reports. Resets at 00:00 UTC. Fails CLOSED: if the counter can't be
//      reached, the question is refused.
//   4. A spend limit on the API key's workspace in the Anthropic Console. Set by
//      hand (see README); it is the one cap that holds even if this code is wrong.
//
// Config lives in wrangler.toml (vars, limits, bindings). Secret: ANTHROPIC_API_KEY.

const MAX_BODY_CHARS = 40_000;      // question + retrieved passages are a few KB
const MAX_TOKENS = 800;             // hard ceiling on one answer
const MAX_MESSAGES = 12;
const MAX_FIELD_CHARS = 30_000;
const UPSTREAM_TIMEOUT_MS = 25_000;

const DEFAULTS = {
    DAILY_REQUEST_CAP: 300,
    PER_IP_DAILY_CAP: 40,
    DAILY_INPUT_TOKEN_CAP: 2_000_000,
    DAILY_OUTPUT_TOKEN_CAP: 200_000,
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
        if (!env.ANTHROPIC_API_KEY || !env.IP_LIMITER || !env.GLOBAL_LIMITER || !env.BUDGET) {
            console.error('proxy misconfigured: missing', ['ANTHROPIC_API_KEY', 'IP_LIMITER', 'GLOBAL_LIMITER', 'BUDGET'].filter(k => !env[k]));
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
        try {
            const verdict = await call('/check', {
                ip: await hashIp(ip),
                caps: {
                    requests: num(env.DAILY_REQUEST_CAP, DEFAULTS.DAILY_REQUEST_CAP),
                    ipRequests: num(env.PER_IP_DAILY_CAP, DEFAULTS.PER_IP_DAILY_CAP),
                    inTokens: num(env.DAILY_INPUT_TOKEN_CAP, DEFAULTS.DAILY_INPUT_TOKEN_CAP),
                    outTokens: num(env.DAILY_OUTPUT_TOKEN_CAP, DEFAULTS.DAILY_OUTPUT_TOKEN_CAP),
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
                    model: env.MODEL || 'claude-haiku-5-5',
                    system: body.system,
                    messages: body.messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
                    max_tokens: Math.min(Number(body.max_tokens) || MAX_TOKENS, MAX_TOKENS),
                }),
                signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
            });
        } catch (err) {
            console.error('upstream unreachable', err);
            return reply(502, 'upstream');
        }

        if (!upstream.ok) {
            // Log the status only (never the body or the key) so `wrangler tail` shows why.
            console.error('upstream error', upstream.status);
            return upstream.status === 429 ? reply(429, 'rate', { 'Retry-After': '60' }) : reply(502, 'upstream');
        }

        const data = await upstream.json();
        try {
            await call('/record', {
                inTokens: num(data.usage?.input_tokens, 0),
                outTokens: num(data.usage?.output_tokens, 0),
            });
        } catch (err) {
            console.error('budget record failed', err);   // the answer was already paid for: still deliver it
        }

        const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
        return new Response(JSON.stringify({ text }), { headers: { ...cors, 'Content-Type': 'application/json' } });
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
