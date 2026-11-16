// ai/engines/local-server.js — "Local" with a model that is already on this computer, served by a
// local model server such as Ollama or LM Studio. The page downloads nothing, and clearing the
// browser's data doesn't remove the model, because it lives in the server's own folder.
//
// It reuses the own-service engine (engines/custom.js) in its chat-completions format, with three
// differences:
//  - the address must be a server on THIS computer (loopback only), which is what lets the
//    privacy note say nothing leaves the machine; any other address is refused here, not just in the dialog;
//  - no API key;
//  - the error messages talk about the local server (is it running, does it allow this page).
//
// Two things a page can't check from here, and that a reader may hit:
//  1. The server must allow this page's address (CORS). Ollama: set OLLAMA_ORIGINS to include it and restart
//     Ollama; LM Studio: switch on "Enable CORS" in its server settings.
//  2. Recent Chrome/Edge ask before a public website may reach a server on the same computer (the "Local
//     Network Access" permission). Requests are marked with `targetAddressSpace: 'loopback'`, which is what
//     lets that browser ask; until the reader allows it the request fails like any blocked one.
//     Both look the same to a web page (a network error), so the message names both.

import { createCustomEngine, normalizeBaseUrl, isLocalBaseUrl } from './custom.js';

export const SERVER_FAILED = 'LOCAL_SERVER_FAILED';

function pageOrigin() {
    try { return typeof location !== 'undefined' && location.origin && location.origin !== 'null' ? location.origin : 'this page'; } catch (_) { return 'this page'; }
}

/** The message for a request that never got an answer (server not running, page not allowed, or permission not granted). */
export function unreachableMessage(host, origin = pageOrigin()) {
    return `Couldn\u2019t reach the model server at ${host}. Check that Ollama (or LM Studio) is running. It must also allow requests from ${origin}: `
        + 'for Ollama set the OLLAMA_ORIGINS setting to include that address and restart it; for LM Studio turn on \u201cEnable CORS\u201d in its server settings. '
        + 'If your browser asked to allow access to devices on this computer, choose Allow.';
}

/** The message for an HTTP error from the server, or undefined to use the standard wording. */
export function failureMessage(status, host, detail, origin = pageOrigin()) {
    const tail = detail ? ` (${detail})` : '';
    if (status === 403) return `The server at ${host} refused this page. Allow ${origin} in its settings (Ollama: OLLAMA_ORIGINS, then restart it).${tail}`;
    if (status === 404) return `The server at ${host} doesn\u2019t have that model. Choose one it has under Configure (\u201cCheck connection\u201d lists them), or install it first (Ollama: ollama pull <name>).${tail}`;
    return undefined;
}

/**
 * @param {Object} [opts]
 * @param {() => Object} [opts.getConfig] { baseUrl, model } — read on every call, so a change in Settings applies at once
 */
export function createLocalServerEngine({ getConfig = () => ({}), fetchImpl = (...a) => fetch(...a) } = {}) {
    // `targetAddressSpace` is ignored by browsers that don't know it, and is what lets one that does ask the reader.
    const fetchLoopback = (url, init) => fetchImpl(url, { ...init, targetAddressSpace: 'loopback' });
    return createCustomEngine({
        id: 'local',                      // to the rest of the app this is the on-device model: same privacy note, same small-model rules
        getConfig: () => ({ provider: 'openai', ...getConfig() }),
        keyStore: { get: () => '', set() {}, clear() {}, isRemembered: () => false },
        fetchImpl: fetchLoopback,
        loopbackOnly: true,
        unreachable: unreachableMessage,
        failure: failureMessage,
    });
}

/**
 * Asks the server which models it has, for the dialog's "Check connection". Never throws.
 * @returns {Promise<{ok: true, models: string[]} | {ok: false, reason: string}>}
 */
export async function listServerModels(baseUrl, { fetchImpl = (...a) => fetch(...a), signal } = {}) {
    const base = normalizeBaseUrl(baseUrl);
    if (!base || !isLocalBaseUrl(base)) return { ok: false, reason: 'The address must be a server on this computer (http://localhost\u2026).' };
    const host = new URL(base).host;
    let res;
    try {
        res = await fetchImpl(base + '/models', { signal, targetAddressSpace: 'loopback' });
    } catch (err) {
        if (err?.name === 'AbortError') throw err;
        return { ok: false, reason: unreachableMessage(host) };
    }
    if (!res.ok) return { ok: false, reason: failureMessage(res.status, host, '') || `The server at ${host} answered with an error (${res.status}).` };
    let data;
    try { data = await res.json(); } catch (_) { return { ok: false, reason: `The server at ${host} answered, but not in the chat-completions format. Is the address right (it usually ends in /v1)?` }; }
    const list = Array.isArray(data?.data) ? data.data : [];
    const models = list.map(m => (typeof m === 'string' ? m : m?.id)).filter(id => typeof id === 'string' && id);
    return { ok: true, models };
}
