// ai/engines/local.js — On-device model via WebLLM (WebGPU). Nothing leaves
// the browser. The library and model load only after the reader picks
// "Local" and confirms; WebLLM caches the weights itself, so later visits —
// including offline ones — don't download again.
//
// WebGPU shader-compile failures ("Invalid ShaderModule ...") are a known
// failure class on some browser/GPU/driver combinations, and a stale cached
// WebLLM wasm file can cause them too. So a failed load is retried once after
// clearing that cached file, and if it still fails the reader gets a plain
// message plus a "compatibility mode" that loads the f32 build of the model
// (bigger, slower, but avoids half-precision shaders).

import { WEBLLM_URL, LOCAL_MODEL_ID, LOCAL_MODEL_ID_COMPAT, WEBLLM_WASM_CACHE, MAX_ANSWER_TOKENS } from '../config.js';

export const LOCAL_GPU_FAILED = 'LOCAL_GPU_FAILED';

// Once compatibility mode has actually worked on this device, remember it, so a
// reload goes straight to it instead of failing the f16 build first. This is a
// device-capability note, not a reader preference (a different browser or GPU
// would differ), so it lives under its own key rather than in the settings
// object. It expires, so a driver update gets a fresh chance at the faster
// build, and it only counts for the model id that worked.
export const COMPAT_STORAGE_KEY = 'aiLocalCompat';
const COMPAT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function readCompat(storage, model, now) {
    try {
        const v = JSON.parse(storage.getItem(COMPAT_STORAGE_KEY));
        return !!v && v.model === model && now - v.at >= 0 && now - v.at < COMPAT_TTL_MS;
    } catch (_) { return false; }
}
function writeCompat(storage, model, now) {
    try { storage.setItem(COMPAT_STORAGE_KEY, JSON.stringify({ model, at: now })); } catch (_) {}
}
function clearCompat(storage) {
    try { storage.removeItem(COMPAT_STORAGE_KEY); } catch (_) {}
}

const GPU_ERROR = /ShaderModule|GPUPipelineError|WebGPU|GPUValidation|GPUDevice|out of memory/i;

export function friendlyGpuError(cause, compat) {
    const err = new Error(compat
        ? 'The on-device model still couldn\u2019t start on this browser or graphics card. Try Microsoft Edge, update your graphics driver, or switch to Cloud in Settings.'
        : 'Your browser or graphics driver couldn\u2019t run the on-device model. You can try compatibility mode (a larger download), try Microsoft Edge, or switch to Cloud in Settings.');
    err.code = LOCAL_GPU_FAILED;
    err.compat = !!compat;
    err.cause = cause;
    return err;
}

async function defaultClearCache() {
    if (typeof caches !== 'undefined') await caches.delete(WEBLLM_WASM_CACHE);
}

export function createLocalEngine({
    loadLibrary, modelId = LOCAL_MODEL_ID, compatModelId = LOCAL_MODEL_ID_COMPAT, clearCache = defaultClearCache,
    storage = (typeof localStorage !== 'undefined' ? localStorage : null), now = () => Date.now(),
} = {}) {
    // The URL goes through a variable on purpose: sw.js's crawler follows any
    // dynamic import written with a plain quoted path, and this is a CDN module it
    // should leave alone. The crawler reads comments as code too, so don't write
    // example import paths in comments in this folder (sw-crawl.test.js checks).
    const load = loadLibrary || (() => import(/* webpackIgnore: true */ WEBLLM_URL));
    let engine = null;
    let loading = null;
    let compat = !!storage && readCompat(storage, compatModelId, now());

    const currentModel = () => (compat ? compatModelId : modelId);

    return {
        id: 'local',

        available() {
            if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
                return { ok: false, reason: 'This browser can\u2019t run the on-device model (it needs WebGPU). Try Chrome or Edge on a recent computer or phone, or use Cloud.' };
            }
            return { ok: true };
        },

        get compatMode() { return compat; },

        /** Switches to the f32 build of the model. The next prepare() loads it. */
        setCompatMode(on) {
            if (compat === !!on) return;
            compat = !!on;
            engine = null;
            loading = null;
        },

        /** Downloads/initialises the model. onProgress({ text, progress 0..1 }). Safe to call repeatedly. */
        prepare(onProgress) {
            if (engine) return Promise.resolve();
            if (!loading) {
                let failed = false;
                // Progress callbacks can still arrive after a failure; don't show them.
                const report = p => { if (!failed && onProgress) onProgress({ text: p.text, progress: p.progress }); };

                loading = (async () => {
                    // The WebGPU API can exist while no usable GPU does (blocklisted
                    // driver, remote desktop, VM). Say so before downloading anything.
                    if (typeof navigator !== 'undefined' && navigator.gpu?.requestAdapter) {
                        const adapter = await navigator.gpu.requestAdapter().catch(() => null);
                        if (!adapter) {
                            const err = new Error('This device has no usable graphics adapter for the on-device model. Try Microsoft Edge or Chrome with graphics acceleration on, or switch to Cloud in Settings.');
                            err.code = 'LOCAL_NO_GPU';
                            throw err;
                        }
                    }
                    const lib = await load();
                    const create = () => lib.CreateMLCEngine(currentModel(), { initProgressCallback: report });
                    try {
                        engine = await create();
                        if (compat && storage) writeCompat(storage, compatModelId, now());
                    } catch (err) {
                        if (!GPU_ERROR.test(String(err?.message || err))) throw err;
                        report({ text: 'Retrying with a fresh copy of the model\u2019s code\u2026', progress: 0 });
                        try { await clearCache(); } catch (_) {}
                        try {
                            engine = await create();
                            if (compat && storage) writeCompat(storage, compatModelId, now());
                        } catch (err2) {
                            if (GPU_ERROR.test(String(err2?.message || err2))) {
                                // A remembered compatibility mode that no longer works is forgotten,
                                // so the next try starts from the normal build again.
                                if (compat && storage) clearCompat(storage);
                                throw friendlyGpuError(err2, compat);
                            }
                            throw err2;
                        }
                    }
                })().catch(err => { failed = true; loading = null; throw err; });
            }
            return loading;
        },

        async generate(messages, { signal, onToken } = {}) {
            await this.prepare();
            const stream = await engine.chat.completions.create({
                messages, stream: true, temperature: 0.2, max_tokens: MAX_ANSWER_TOKENS,
            });
            let text = '';
            for await (const chunk of stream) {
                if (signal?.aborted) { try { engine.interruptGenerate(); } catch (_) {} break; }
                text += chunk.choices?.[0]?.delta?.content || '';
                if (onToken) onToken(text);
            }
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            return text;
        },
    };
}
