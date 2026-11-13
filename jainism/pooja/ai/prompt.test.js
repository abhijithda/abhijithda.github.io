const { buildMessages, parseCitations, formatPassage, NOT_COVERED } = require('./prompt');

const passages = [
    { id: 'blk1', label: 'A-1.1', tags: ['Daana'], text: { en: 'Giving is dharma.', kn: 'ದಾನ' } },
    { id: 'blk2', label: 'Q-1.1', tags: [], text: { en: 'Why give?' }, viaReference: true },
];

describe('buildMessages', () => {
    test('system rules first, passages and the question in the last user message', () => {
        const msgs = buildMessages({ question: 'Why give?', passages, langs: ['kn', 'en'] });
        expect(msgs[0].role).toBe('system');
        expect(msgs[0].content).toMatch(/ONLY the passages/);
        expect(msgs[0].content).toMatch(/Kannada/);   // fallback answer language = first selected
        const last = msgs[msgs.length - 1];
        expect(last.role).toBe('user');
        expect(last.content).toContain('[A-1.1]');
        expect(last.content).toContain('Question: Why give?');
    });

    test('keeps only the last 6 history messages', () => {
        const history = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
        const msgs = buildMessages({ question: 'q', passages, langs: ['en'], history });
        expect(msgs.length).toBe(1 + 6 + 1);
        expect(msgs[1].content).toBe('m4');
    });

    test('formatPassage marks a passage pulled in as the question being replied to', () => {
        expect(formatPassage(passages[1])).toMatch(/question this replies to/);
        expect(formatPassage(passages[0])).toMatch(/topics: Daana/);
    });
});

describe('parseCitations', () => {
    test('returns each valid label once, in order of first use', () => {
        const out = parseCitations('Giving [A-1.1] matters [Q-1.1] and again [A-1.1].', passages);
        expect(out).toEqual([{ label: 'A-1.1', blockId: 'blk1' }, { label: 'Q-1.1', blockId: 'blk2' }]);
    });

    test('ignores labels the model invented', () => {
        expect(parseCitations('See [A-9.9].', passages)).toEqual([]);
    });
});

describe('the rules the model is given', () => {
    const sys = style => buildMessages({ question: 'q', passages, langs: ['en'], style })[0].content;

    test('it is told to reply with the exact not-covered sentence rather than use general knowledge', () => {
        expect(sys()).toContain(`exactly: "${NOT_COVERED}"`);
        expect(sys()).toMatch(/Never fill gaps from general knowledge/);
    });

    test('it is told not to reverse a passage, and that a question in a passage is not the book\u2019s view', () => {
        expect(sys()).toMatch(/Never reverse, soften or strengthen/);
        expect(sys()).toMatch(/is a question, not a statement/);
    });

    test('it is told to quote mantras exactly and not to echo the language labels', () => {
        expect(sys()).toMatch(/exactly as written/);
        expect(sys()).toMatch(/Do not copy the passage headings or language labels/);
    });

    test('brief style (on-device model) asks for two short sentences; full style does not', () => {
        expect(sys('brief')).toMatch(/at most two short sentences/);
        expect(sys('full')).not.toMatch(/two short sentences/);
        expect(sys()).toMatch(/Be concise/);
    });

    test('passages are labelled with language names, not the raw kn:/en: codes', () => {
        const text = formatPassage(passages[0]);
        expect(text).toContain('English: Giving is dharma.');
        expect(text).toContain('Kannada: ದಾನ');
        expect(text).not.toMatch(/^(kn|en):/m);
    });
});

test('NOT_COVERED is a readable sentence', () => {
    expect(NOT_COVERED.length).toBeGreaterThan(20);
});
