const fs = require('fs');
const path = require('path');
const { createIndex } = require('./retrieval');
const { answerQuestion } = require('./rag');
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
