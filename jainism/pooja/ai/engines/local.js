// ai/engines/local.js — On-device model via WebLLM (WebGPU). Nothing leaves
// the browser. The library and model load only after the reader picks
// "Local" and confirms; WebLLM caches the weights itself, so later visits —
// including offline ones — don't download again.

import { WEBLLM_URL, LOCAL_MODEL_ID, MAX_ANSWER_TOKENS } from '../config.js';

export function createLocalEngine({ loadLibrary, modelId = LOCAL_MODEL_ID } = {}) {
    // The URL goes through a variable on purpose: sw.js's crawler follows
    // import('literal') paths, and this is a CDN module it should leave alone.
    const load = loadLibrary || (() => import(/* webpackIgnore: true */ WEBLLM_URL));
    let engine = null;
    let loading = null;

    return {
        id: 'local',

        available() {
            if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
                return { ok: false, reason: 'This browser can\u2019t run the on-device model (it needs WebGPU). Try Chrome or Edge on a recent computer or phone, or use Cloud.' };
            }
            return { ok: true };
        },

        /** Downloads/initialises the model. onProgress({ text, progress 0..1 }). Safe to call repeatedly. */
        prepare(onProgress) {
            if (engine) return Promise.resolve();
            if (!loading) {
                loading = (async () => {
                    const lib = await load();
                    engine = await lib.CreateMLCEngine(modelId, {
                        initProgressCallback: p => onProgress && onProgress({ text: p.text, progress: p.progress }),
                    });
                })().catch(err => { loading = null; throw err; });
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
