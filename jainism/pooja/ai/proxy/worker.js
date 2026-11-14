// ai/proxy/worker.js — Reference Cloudflare Worker for the Cloud engine.
// NOT part of the site: deploy it separately and put its URL in ai/config.js.
// It exists so the API key never reaches the browser, and so you can cap abuse.
//
// Set as Worker secrets/vars:  ANTHROPIC_API_KEY (secret), ALLOWED_ORIGIN
// (e.g. https://abhijithda.github.io), MODEL (optional).
// Still to add before launch: real per-IP rate limiting (Cloudflare's rate
// limiting binding) and a spend cap on the API key — without those, anyone who
// finds the URL can run up your bill.

const MAX_BODY_BYTES = 40_000;   // question + passages are a few KB
const MAX_TOKENS = 800;

export default {
    async fetch(request, env) {
        const cors = {
            'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Vary': 'Origin',
        };
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (request.method !== 'POST' || request.headers.get('Origin') !== env.ALLOWED_ORIGIN) {
            return new Response('Forbidden', { status: 403, headers: cors });
        }

        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES) return new Response('Too large', { status: 413, headers: cors });

        let body;
        try { body = JSON.parse(raw); } catch { return new Response('Bad request', { status: 400, headers: cors }); }
        const { system, messages, max_tokens } = body;
        if (typeof system !== 'string' || !Array.isArray(messages) || !messages.length) {
            return new Response('Bad request', { status: 400, headers: cors });
        }

        const upstream = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: env.MODEL || 'claude-haiku-5-5',
                system,
                messages: messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) })),
                max_tokens: Math.min(Number(max_tokens) || MAX_TOKENS, MAX_TOKENS),
            }),
        });
        if (!upstream.ok) return new Response('Upstream error', { status: upstream.status === 429 ? 429 : 502, headers: cors });

        const data = await upstream.json();
        const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
        return new Response(JSON.stringify({ text }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    },
};
