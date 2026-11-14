// ai/prompt.js — Builds the messages sent to an engine, and reads citations
// back out of its answer. Pure functions: no DOM, no network.

import { KNOWN_LANGS } from '../core/langs.js';

export const NOT_COVERED = 'This book doesn\u2019t seem to cover that yet. Try different words, or browse the topics in the book.';

const SYSTEM = `You answer questions about Jaina pooja for readers of a bilingual (Kannada/English) FAQ book.

Rules:
1. Use ONLY the passages in the user's message. If they do not contain the answer, reply with exactly: "{NOT_COVERED}" and nothing else. Never fill gaps from general knowledge.
2. Never reverse, soften or strengthen what a passage says. If a passage says that doing X causes Y, or that X should not be done, say exactly that. A question that appears in a passage is a question, not a statement of the book's view.
3. Quote mantras, shlokas and Sanskrit/Prakrit/Kannada terms exactly as written in the passages. Never paraphrase or respell them.
4. Cite every claim with the passage label in square brackets, exactly as given, e.g. [A-3.1]. Cite only labels that appear in the passages.
5. If passages disagree or give several views, present each and cite each. Never settle a religious question on your own authority.
6. Do not copy the passage headings or language labels (such as "Kannada:" or "English:") into your answer. Write a natural answer.
7. Answer in the language of the question. If it is unclear, use {LANG}.
{STYLE}`;

const STYLE = {
    full: 'Be concise and respectful.',
    // For small on-device models: they only introduce the passages, which the
    // reader sees verbatim right under the reply (see ai-panel.js).
    brief: 'Reply in at most two short sentences that point the reader to the passages. The full passages are shown to the reader directly under your reply, so do not repeat them.',
};

function langName(code) {
    return KNOWN_LANGS.find(l => l.code === code)?.name || code;
}

// Topic tags are deliberately not shown to the model: small models copy them
// into their answers ("The passage [A-1.1] (topics: ...) states ..."), and the
// tags are editorial labels, not the book's words.
export function formatPassage(p) {
    const lines = [`[${p.label}]${p.viaReference ? ' (the question this replies to)' : ''}`];
    Object.entries(p.text).forEach(([lang, text]) => lines.push(`${langName(lang)}: ${text}`));
    return lines.join('\n');
}

/**
 * @param {{question: string, passages: Object[], langs: string[], history?: {role:string,content:string}[], style?: 'full'|'brief'}} args
 * @returns {{role:string,content:string}[]}
 */
export function buildMessages({ question, passages, langs, history = [], style = 'full' }) {
    const system = SYSTEM
        .replace('{NOT_COVERED}', NOT_COVERED)
        .replace('{STYLE}', STYLE[style] || STYLE.full)
        .replace('{LANG}', langName(langs?.[0] || 'en'));
    const context = passages.map(formatPassage).join('\n\n');
    return [
        { role: 'system', content: system },
        ...history.slice(-6),
        { role: 'user', content: `Passages:\n\n${context}\n\nQuestion: ${question}` },
    ];
}

/**
 * Finds [label] citations in an answer. Only labels that were actually in the
 * passages count, so a made-up label is never turned into a link.
 * @returns {{label: string, blockId: string}[]} unique, in order of first use
 */
export function parseCitations(answer, passages) {
    const byLabel = new Map(passages.map(p => [p.label, p.id]));
    const found = [];
    for (const m of String(answer).matchAll(/\[([A-Za-z]-\d+\.\d+)\]/g)) {
        if (byLabel.has(m[1]) && !found.some(f => f.label === m[1])) {
            found.push({ label: m[1], blockId: byLabel.get(m[1]) });
        }
    }
    return found;
}

/**
 * Keeps the first `n` sentences. Small models ignore "two short sentences" and
 * paste whole passages; the passages themselves are shown under the reply, so
 * the reply is cut to its opening. Also removes "(topics: ...)" if one still
 * gets echoed.
 */
export function firstSentences(text, n = 2) {
    const clean = String(text).replace(/\s*\(topics?:[^)]*\)/gi, '').replace(/\s+/g, ' ').trim();
    // A sentence ends at . ! ? followed by space and a capital, quote, citation, or Kannada letter.
    // (Periods inside a label like [A-3.1] are followed by a digit or "]", so they don't split.)
    return clean.split(/(?<=[.!?])\s+(?=[A-Z"\u201C\[\u0C80-\u0CFF])/).slice(0, n).join(' ');
}
