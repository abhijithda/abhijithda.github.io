// ai/prompt.js — Builds the messages sent to an engine, and reads citations
// back out of its answer. Pure functions: no DOM, no network.

import { KNOWN_LANGS } from '../core/langs.js';

export const NOT_COVERED = 'This book doesn\u2019t seem to cover that yet. Try different words, or browse the topics in the book.';

const SYSTEM = `You answer questions about Jaina pooja for readers of a bilingual (Kannada/English) FAQ book.

Rules:
- Use ONLY the passages provided in the user's message. Do not add doctrine, rules or practices that are not in them. Where the passages are silent, say the book does not cover it.
- Cite every claim with the passage label in square brackets, exactly as given, e.g. [A-3.1]. Cite only labels that appear in the passages.
- If passages disagree or give several views, present each and cite each. Never settle a religious question on your own authority.
- Answer in the language of the question. If it is unclear, use {LANG}.
- Be concise and respectful. Quote Sanskrit/Prakrit/Kannada terms as they appear in the passages.`;

function langName(code) {
    return KNOWN_LANGS.find(l => l.code === code)?.name || code;
}

export function formatPassage(p) {
    const lines = [`[${p.label}]${p.tags?.length ? ` (topics: ${p.tags.join(', ')})` : ''}${p.viaReference ? ' (the question this replies to)' : ''}`];
    Object.entries(p.text).forEach(([lang, text]) => lines.push(`${lang}: ${text}`));
    return lines.join('\n');
}

/**
 * @param {{question: string, passages: Object[], langs: string[], history?: {role:string,content:string}[]}} args
 * @returns {{role:string,content:string}[]}
 */
export function buildMessages({ question, passages, langs, history = [] }) {
    const system = SYSTEM.replace('{LANG}', langName(langs?.[0] || 'en'));
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
