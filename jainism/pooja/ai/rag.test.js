const fs = require('fs');
const path = require('path');
const { createIndex } = require('./retrieval');
const { answerQuestion, NO_RELIABLE_ANSWER } = require('./rag');
const { NOT_COVERED } = require('./prompt');

const index = createIndex(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data.json'), 'utf8')));
const fakeEngine = (reply, id = 'local') => ({ id, generate: jest.fn(async (_m, { onToken } = {}) => { onToken && onToken(reply); return reply; }) });

test('retrieves, calls the engine once with the passages, and returns valid citations', async () => {
    const engine = fakeEngine('Those who do this go to hell [A-1.1]. Also [Z-9.9].');
    const r = await answerQuestion({ question: 'what is the result of worshipping shasana devata as bhagawan', index, engine, langs: ['en'] });
    expect(engine.generate).toHaveBeenCalledTimes(1);
    const sent = engine.generate.mock.calls[0][0];
    expect(sent[sent.length - 1].content).toContain('[A-1.1]');
    expect(r.grounded).toBe(true);
    expect(r.citations.map(c => c.label)).toEqual(['A-1.1']);   // [Z-9.9] was not a passage
});

test('does not call the engine when nothing relevant is found', async () => {
    const engine = fakeEngine('should not be used');
    const r = await answerQuestion({ question: 'zzqxv wwkjh', index, engine, langs: ['en'] });
    expect(engine.generate).not.toHaveBeenCalled();
    expect(r).toMatchObject({ text: NOT_COVERED, grounded: false, citations: [] });
});

test('gives the cloud engine more passages than the local one', async () => {
    const q = 'pooja bhagawan abhisheka shasana devata';
    const cloud = fakeEngine('ok', 'cloud');
    const local = fakeEngine('ok', 'local');
    const a = await answerQuestion({ question: q, index, engine: cloud, langs: ['en'] });
    const b = await answerQuestion({ question: q, index, engine: local, langs: ['en'] });
    expect(a.passages.length).toBeGreaterThanOrEqual(b.passages.length);
});

test('passes streamed text to onToken', async () => {
    const seen = [];
    await answerQuestion({ question: 'shasana devata', index, engine: fakeEngine('partial [A-1.1]'), langs: ['en'], onToken: t => seen.push(t) });
    expect(seen).toEqual(['partial [A-1.1]']);
});

describe('answers that cite nothing are withheld', () => {
    const q = 'what is the result of worshipping shasana devata as bhagawan';

    test('outside-knowledge answer with no citation: the model\u2019s words are never returned; closest passages are', async () => {
        const engine = fakeEngine('Abhisheka is a ritual involving water, often performed to purify a deity.');
        const r = await answerQuestion({ question: q, index, engine, langs: ['en'] });
        expect(r.text).toBe(NO_RELIABLE_ANSWER);
        expect(r.text).not.toMatch(/purify/);
        expect(r).toMatchObject({ grounded: false, fallback: true, citations: [] });
        expect(r.shown.length).toBeGreaterThan(0);
        expect(r.shown.length).toBeLessThanOrEqual(4);
    });

    test('the model saying "not covered" also falls back to showing the closest passages', async () => {
        const r = await answerQuestion({ question: q, index, engine: fakeEngine('This book doesn\u2019t seem to cover that yet.'), langs: ['en'] });
        expect(r.fallback).toBe(true);
        expect(r.shown.length).toBeGreaterThan(0);
    });

    test('a citation of a label that was not provided does not count', async () => {
        const r = await answerQuestion({ question: q, index, engine: fakeEngine('It is so [Z-9.9].'), langs: ['en'] });
        expect(r.fallback).toBe(true);
    });
});

describe('what is shown under an answer', () => {
    const q = 'pooja bhagawan abhisheka shasana devata';

    test('on-device model: cited passages first, then other close ones, max 4', async () => {
        const probe = await answerQuestion({ question: q, index, engine: fakeEngine('x'), langs: ['en'] });
        const second = probe.passages[1];
        const r = await answerQuestion({ question: q, index, engine: fakeEngine(`See [${second.label}].`, 'local'), langs: ['en'] });
        expect(r.grounded).toBe(true);
        expect(r.shown[0].label).toBe(second.label);
        expect(r.shown.length).toBeLessThanOrEqual(4);
        expect(new Set(r.shown.map(p => p.id)).size).toBe(r.shown.length);
    });

    test('hosted model: only the passages it cited', async () => {
        const probe = await answerQuestion({ question: q, index, engine: fakeEngine('x', 'cloud'), langs: ['en'] });
        const first = probe.passages[0];
        const r = await answerQuestion({ question: q, index, engine: fakeEngine(`Yes [${first.label}].`, 'cloud'), langs: ['en'] });
        expect(r.shown.map(p => p.label)).toEqual([first.label]);
    });

    test('the on-device model is asked for a brief pointer; the hosted one for a full answer', async () => {
        const local = fakeEngine('See [A-1.1].', 'local');
        const cloud = fakeEngine('See [A-1.1].', 'cloud');
        await answerQuestion({ question: 'shasana devata', index, engine: local, langs: ['en'] });
        await answerQuestion({ question: 'shasana devata', index, engine: cloud, langs: ['en'] });
        expect(local.generate.mock.calls[0][0][0].content).toMatch(/two short sentences/);
        expect(cloud.generate.mock.calls[0][0][0].content).not.toMatch(/two short sentences/);
    });
});

describe('follow-up questions', () => {
    const history = [
        { role: 'user', content: 'pooja' },
        { role: 'assistant', content: 'Something [Q-19.1].' },
    ];

    test('a follow-up that matches nothing alone is searched together with the previous question', async () => {
        const engine = fakeEngine('See [Q-19.1].');
        const r = await answerQuestion({ question: 'really?', index, engine, langs: ['en'], history });
        expect(engine.generate).toHaveBeenCalledTimes(1);
        expect(r.passages.length).toBeGreaterThan(0);
        expect(r.passages.some(p => p.label === 'Q-19.1')).toBe(true);
    });

    test('with no earlier question there is nothing to combine, so it is still "not covered" without a model call', async () => {
        const engine = fakeEngine('unused');
        const r = await answerQuestion({ question: 'really?', index, engine, langs: ['en'] });
        expect(engine.generate).not.toHaveBeenCalled();
        expect(r.text).toBe(NOT_COVERED);
    });

    test('a question that finds passages by itself is not mixed with the previous one', async () => {
        const engine = fakeEngine('See [A-1.1].');
        const alone = await answerQuestion({ question: 'shasana devata', index, engine: fakeEngine('x'), langs: ['en'] });
        const withHistory = await answerQuestion({ question: 'shasana devata', index, engine, langs: ['en'], history });
        expect(withHistory.passages.map(p => p.id)).toEqual(alone.passages.map(p => p.id));
    });
});
