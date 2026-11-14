// ai/engines/cloud.js — Sends the prompt to your proxy and returns the answer.
// The browser holds no API key. What leaves the device: the reader's question
// and the passages retrieved for it (the panel says so).
//
// The proxy (ai/proxy/worker.js) answers a refused question with a short
// { error: <code> } body; each code gets a plain-language message here.

import { CLOUD_ENDPOINT, MAX_ANSWER_TOKENS } from '../config.js';

const REFUSALS = {
    rate: 'Too many questions right now. Please try again in a minute.',
    busy: 'The assistant is very busy right now. Please try again in a minute.',
    'ip-daily': 'You\u2019ve reached today\u2019s question limit for the cloud assistant. It resets tomorrow; the book\u2019s search and Local mode still work.',
    budget: 'The cloud assistant has reached its limit for today and will be back tomorrow. The book\u2019s search and Local mode still work.',
    unavailable: 'The cloud assistant is temporarily unavailable. Please try again shortly.',
};

async function refusalMessage(res) {
    let code = '';
    try { code = (await res.json()).error; } catch { /* body wasn't JSON */ }
    if (REFUSALS[code]) return REFUSALS[code];
    if (res.status === 429) return REFUSALS.rate;
    return `The cloud assistant couldn\u2019t answer (error ${res.status}).`;
}

export function createCloudEngine({ endpoint = CLOUD_ENDPOINT, fetchImpl = (...a) => fetch(...a) } = {}) {
    return {
        id: 'cloud',

        available() {
            return endpoint
                ? { ok: true }
                : { ok: false, reason: 'Cloud AI isn\u2019t set up for this site yet.' };
        },

        async prepare() { /* nothing to download */ },

        /** Returns the full answer; calls onToken once with it (no streaming in v1). */
        async generate(messages, { signal, onToken } = {}) {
            const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
            const rest = messages.filter(m => m.role !== 'system');
            const res = await fetchImpl(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ system, messages: rest, max_tokens: MAX_ANSWER_TOKENS }),
                signal,
            });
            if (!res.ok) throw new Error(await refusalMessage(res));
            const { text } = await res.json();
            if (typeof text !== 'string' || !text.trim()) throw new Error('The cloud assistant sent an empty answer.');
            if (onToken) onToken(text);
            return text;
        },
    };
}
