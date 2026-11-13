// ai/rag.js — Single-shot RAG: retrieve, build one prompt, one engine call,
// then check the answer before anyone sees it.
// (An optional agent step is a later phase, to be measured against this.)
//
// The checks exist because small on-device models do get religious content
// wrong (one reversed a passage's meaning in testing):
//  - An answer that cites no real passage is never shown. The reader gets the
//    closest passages, word for word, instead.
//  - The on-device model only writes a two-sentence pointer; the passages
//    themselves are shown verbatim under it.
//  - A follow-up that matches nothing on its own ("really?") is searched
//    together with the previous question.

import { getContext } from './retrieval.js';
import { buildMessages, parseCitations, NOT_COVERED } from './prompt.js';

// Small local models get a tighter budget than a hosted one.
const BUDGET_CHARS = { local: 5000, cloud: 20000 };
const MAX_SHOWN = 4;

export const NO_RELIABLE_ANSWER = 'I couldn\u2019t write a reliable answer to that. These passages from the book look closest \u2014 please read them directly:';

function lastUserQuestion(history) {
    for (let i = history.length - 1; i >= 0; i--) if (history[i].role === 'user') return history[i].content;
    return '';
}

/**
 * @param {Object} args
 * @param {string} args.question
 * @param {Object} args.index     from createIndex()
 * @param {Object} args.engine    { id, generate(messages, {signal, onToken}) }
 * @param {string[]} args.langs   the reader's selected languages
 * @param {Object[]} [args.history]
 * @param {AbortSignal} [args.signal]
 * @param {(text:string)=>void} [args.onToken]  raw model text so far (not validated — don't show it as the answer)
 * @returns {Promise<{text:string, citations:{label:string,blockId:string}[], passages:Object[], shown:Object[], grounded:boolean, fallback:boolean, ms:number}>}
 *   `shown`: the passages to display verbatim. `grounded`: text is an answer that cites the book.
 *   `fallback`: the model's text was withheld and `shown` are the closest passages instead.
 */
export async function answerQuestion({ question, index, engine, langs, history = [], signal, onToken }) {
    const started = Date.now();
    const brief = engine.id !== 'cloud';
    const opts = {
        langs,
        k: engine.id === 'cloud' ? 8 : 4,
        budgetChars: BUDGET_CHARS[engine.id] ?? BUDGET_CHARS.local,
    };
    const done = (extra) => ({ citations: [], passages: [], shown: [], grounded: false, fallback: false, ms: Date.now() - started, ...extra });

    let passages = getContext(index, question, opts);
    if (!passages.length) {
        const previous = lastUserQuestion(history);
        if (previous) passages = getContext(index, `${previous} ${question}`, opts);
    }

    // Nothing relevant found: say so without spending a model call.
    if (!passages.length) return done({ text: NOT_COVERED });

    const text = (await engine.generate(
        buildMessages({ question, passages, langs, history, style: brief ? 'brief' : 'full' }),
        { signal, onToken },
    )).trim();
    const citations = parseCitations(text, passages);

    // No real citation (or the model said "not covered"): withhold its words.
    if (!citations.length) {
        return done({ text: NO_RELIABLE_ANSWER, passages, shown: passages.slice(0, MAX_SHOWN), fallback: true });
    }

    const byLabel = new Map(passages.map(p => [p.label, p]));
    const cited = citations.map(c => byLabel.get(c.label));
    // Small model: show the cited passages first, then the other close ones, so the
    // reader always sees the book's own words. Hosted model: just what it cited.
    const shown = brief
        ? [...cited, ...passages.filter(p => !cited.includes(p))].slice(0, MAX_SHOWN)
        : cited.slice(0, MAX_SHOWN);
    return done({ text, citations, passages, shown, grounded: true });
}
