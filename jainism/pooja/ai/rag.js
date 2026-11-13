// ai/rag.js — Single-shot RAG: retrieve, build one prompt, one engine call.
// (An optional agent step is a later phase, to be measured against this.)

import { getContext } from './retrieval.js';
import { buildMessages, parseCitations, NOT_COVERED } from './prompt.js';

// Small local models get a tighter budget than a hosted one.
const BUDGET_CHARS = { local: 5000, cloud: 20000 };

/**
 * @param {Object} args
 * @param {string} args.question
 * @param {Object} args.index     from createIndex()
 * @param {Object} args.engine    { id, generate(messages, {signal, onToken}) }
 * @param {string[]} args.langs   the reader's selected languages
 * @param {Object[]} [args.history]
 * @param {AbortSignal} [args.signal]
 * @param {(text:string)=>void} [args.onToken]  receives the answer so far
 * @returns {Promise<{text:string, citations:{label:string,blockId:string}[], passages:Object[], grounded:boolean, ms:number}>}
 */
export async function answerQuestion({ question, index, engine, langs, history = [], signal, onToken }) {
    const started = Date.now();
    const passages = getContext(index, question, {
        langs,
        k: engine.id === 'cloud' ? 8 : 4,
        budgetChars: BUDGET_CHARS[engine.id] ?? BUDGET_CHARS.local,
    });

    // Nothing relevant found: say so without spending a model call.
    if (!passages.length) {
        return { text: NOT_COVERED, citations: [], passages, grounded: false, ms: Date.now() - started };
    }

    const text = await engine.generate(buildMessages({ question, passages, langs, history }), { signal, onToken });
    return { text, citations: parseCitations(text, passages), passages, grounded: true, ms: Date.now() - started };
}
