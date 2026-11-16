// ai/engines/custom.js — The reader's own AI service, called straight from the
// browser with the reader's own API key. Nothing goes through this site's proxy,
// so none of it counts against the site's limits or budget.
//
// What leaves the device: the reader's question and the passages found for it,
// to the one address the reader chose. The key goes only there too.
//
// Two request formats:
//  - 'anthropic' : Anthropic's own address (fixed). Browsers may only call it
//                  with the opt-in header below, which Anthropic provides for
//                  exactly this "bring your own key" use.
//  - 'openai'    : the chat-completions format that OpenAI and many other
//                  services and local servers (e.g. Ollama) share, at a base
//                  URL the reader gives. The service must allow requests from
//                  a web page (CORS); if it doesn't, the reader is told so.
//
// The key's storage is its own, separate from the settings object, so it can be
// session-only (gone when the tab closes — the default) or, if the reader opts
// in, kept on this device. It is never written to the settings, logged, or put
// into an error message.

import { MAX_ANSWER_TOKENS } from '../config.js';

export const KEY_STORAGE_KEY = 'aiCustomKey';

export const PROVIDER_INFO = {
    anthropic: {
        label: 'Anthropic (Claude)',
        url: 'https://api.anthropic.com/v1/messages',
        defaultModel: 'claude-haiku-5-5',
        needsBaseUrl: false,
    },
    openai: {
        label: 'OpenAI-compatible',
        defaultModel: '',
        needsBaseUrl: true,
        baseUrlExample: 'https://api.openai.com/v1',
    },
};

/**
 * A base URL we are willing to send a key to: https, or plain http only for a
 * server on the reader's own machine. Returns the URL without a trailing slash,
 * or null.
 */
export function normalizeBaseUrl(input) {
    let u;
    try { u = new URL(String(input || '').trim()); } catch (_) { return null; }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
    if (u.username || u.password) return null;      // no credentials smuggled into the address
    u.hash = '';
    u.search = '';
    return u.toString().replace(/\/+$/, '');
}

export function isLocalBaseUrl(baseUrl) {
    try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseUrl).hostname); } catch (_) { return false; }
}

// ── Key storage ──────────────────────────────────────────────────────────
// sessionStorage = this tab only; localStorage = remembered on this device.
// Looking in both means a reader's choice is simply where the key is found.
export function createKeyStore({ session = safe('sessionStorage'), local = safe('localStorage') } = {}) {
    return {
        get() {
            try { return session?.getItem(KEY_STORAGE_KEY) || local?.getItem(KEY_STORAGE_KEY) || ''; } catch (_) { return ''; }
        },
        /** @param {boolean} remember keep on this device rather than for this tab only */
        set(key, remember) {
            this.clear();
            if (!key) return;
            try { (remember ? local : session)?.setItem(KEY_STORAGE_KEY, key); } catch (_) {}
        },
        isRemembered() {
            try { return !!local?.getItem(KEY_STORAGE_KEY); } catch (_) { return false; }
        },
        clear() {
            try { session?.removeItem(KEY_STORAGE_KEY); } catch (_) {}
            try { local?.removeItem(KEY_STORAGE_KEY); } catch (_) {}
        },
    };
}

function safe(name) {
    try { return typeof window !== 'undefined' ? window[name] : null; } catch (_) { return null; }
}

// ── Engine ───────────────────────────────────────────────────────────────

/**
 * What is missing before this can be used, or '' when ready. Never mentions the key's value.
 * @param {{loopbackOnly?: boolean}} [opts] loopbackOnly: the address must be a server on this computer
 *   (used by the Local "model on this computer" option, whose privacy note promises nothing leaves the machine)
 */
export function configProblem(config, key, { loopbackOnly = false } = {}) {
    const info = PROVIDER_INFO[config?.provider];
    if (!info) return 'Choose an AI service under Configure.';
    if (info.needsBaseUrl) {
        const base = normalizeBaseUrl(config.baseUrl);
        if (loopbackOnly && base && !isLocalBaseUrl(base)) return 'The address must be a server on this computer (http://localhost\u2026).';
        if (!base) return 'Enter the service\u2019s address under Configure (https://\u2026, or http://localhost\u2026 for a server on this computer).';
        if (!config.model) return 'Enter a model name under Configure.';
        if (!key && !isLocalBaseUrl(base)) return 'Add your API key under Configure.';
        return '';
    }
    return key ? '' : 'Add your API key under Configure.';
}

/** The host a question would be sent to, for the privacy note. */
export function destinationHost(config) {
    const info = PROVIDER_INFO[config?.provider];
    if (!info) return '';
    try { return new URL(info.needsBaseUrl ? normalizeBaseUrl(config.baseUrl) : info.url).host; } catch (_) { return ''; }
}

function scrub(text, key) {
    let t = String(text || '');
    if (key) t = t.split(key).join('\u2026');
    return t.replace(/\s+/g, ' ').trim().slice(0, 200);
}

async function providerMessage(res, key) {
    let detail = '';
    try {
        const body = await res.json();
        detail = scrub(body?.error?.message || body?.message || '', key);
    } catch (_) { /* not JSON */ }
    return detail;
}

function friendlyFailure(status, host, detail) {
    const tail = detail ? ` (${detail})` : '';
    if (status === 401 || status === 403) return `${host} didn\u2019t accept your API key. Check it under Configure.${tail}`;
    if (status === 404) return `${host} doesn\u2019t know that model or address. Check the model name and address under Configure.${tail}`;
    if (status === 429) return `${host} says you\u2019ve hit your rate or usage limit. Try again in a bit, or check your plan.${tail}`;
    if (status === 400) return `${host} rejected the request.${tail || ' Check the model name under Configure.'}`;
    return `${host} couldn\u2019t answer (error ${status}).${tail}`;
}

/**
 * @param {Object} [opts]
 * @param {() => Object} [opts.getConfig]  { provider, baseUrl, model } — read on every call, so a change in Settings applies at once
 * @param {Object} [opts.keyStore]
 * @param {string} [opts.id]               the engine's id ('custom'; the on-this-computer model server reports 'local')
 * @param {boolean} [opts.loopbackOnly]    refuse any address that isn't a server on this computer
 * @param {(host: string) => string} [opts.unreachable]   message for a request that never got an answer
 * @param {(status: number, host: string, detail: string) => string|undefined} [opts.failure]   own message for an HTTP error
 */
export function createCustomEngine({
    getConfig = () => ({}), keyStore = createKeyStore(), fetchImpl = (...a) => fetch(...a),
    id = 'custom', loopbackOnly = false, unreachable = null, failure = null,
} = {}) {
    return {
        id,

        available() {
            const problem = configProblem(getConfig(), keyStore.get(), { loopbackOnly });
            return problem ? { ok: false, reason: problem } : { ok: true };
        },

        async prepare() { /* nothing to download */ },

        async generate(messages, { signal, onToken } = {}) {
            const config = getConfig();
            const key = keyStore.get();
            const problem = configProblem(config, key, { loopbackOnly });
            if (problem) throw new Error(problem);

            const info = PROVIDER_INFO[config.provider];
            const model = config.model || info.defaultModel;
            const host = destinationHost(config);
            const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
            const rest = messages.filter(m => m.role !== 'system');

            const post = async (url, headers, body) => {
                try {
                    return await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
                } catch (err) {
                    if (err?.name === 'AbortError') throw err;
                    // A blocked cross-origin request and a dead address look the same to a web page.
                    throw new Error(unreachable ? unreachable(host)
                        : `Couldn\u2019t reach ${host}. Check the address and your connection, and that the service allows requests from a web page.`);
                }
            };
            // `detail` is the service's own message, read once (a response body can only be read once).
            const failed = (status, detail) => new Error((failure && failure(status, host, detail)) || friendlyFailure(status, host, detail));

            let text;
            if (config.provider === 'anthropic') {
                const res = await post(info.url, {
                    'x-api-key': key,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true',
                }, { model, system, messages: rest, max_tokens: MAX_ANSWER_TOKENS });
                if (!res.ok) throw failed(res.status, await providerMessage(res, key));
                const data = await res.json();
                text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
            } else {
                const url = normalizeBaseUrl(config.baseUrl) + '/chat/completions';
                const headers = key ? { Authorization: `Bearer ${key}` } : {};
                const body = { model, messages, max_tokens: MAX_ANSWER_TOKENS };
                let res = await post(url, headers, body);
                if (res.status === 400) {
                    // Newer OpenAI models take max_completion_tokens instead of max_tokens.
                    const detail = await providerMessage(res.clone ? res.clone() : res, key);
                    if (/max_completion_tokens/i.test(detail)) {
                        const { max_tokens, ...withoutOld } = body;
                        res = await post(url, headers, { ...withoutOld, max_completion_tokens: max_tokens });
                    } else {
                        throw failed(400, detail);
                    }
                }
                if (!res.ok) throw failed(res.status, await providerMessage(res, key));
                const data = await res.json();
                const content = data.choices?.[0]?.message?.content;
                text = typeof content === 'string' ? content : '';
            }

            // An empty answer is not an error: rag.js shows the matching passages from the book instead.
            if (onToken) onToken(text);
            return text;
        },
    };
}
