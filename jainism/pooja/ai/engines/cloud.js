// ai/engines/cloud.js — Sends the prompt to your proxy and returns the answer.
// The browser holds no API key. What leaves the device: the reader's question
// and the passages retrieved for it (the panel says so).

import { CLOUD_ENDPOINT, MAX_ANSWER_TOKENS } from '../config.js';

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
            if (!res.ok) {
                throw new Error(res.status === 429
                    ? 'Too many questions right now. Please try again in a minute.'
                    : `The cloud assistant couldn\u2019t answer (error ${res.status}).`);
            }
            const { text } = await res.json();
            if (typeof text !== 'string' || !text.trim()) throw new Error('The cloud assistant sent an empty answer.');
            if (onToken) onToken(text);
            return text;
        },
    };
}
