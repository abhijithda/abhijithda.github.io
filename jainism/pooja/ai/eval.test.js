// Retrieval eval: does the right block come back for real questions?
//
// This measures only the search step (no model), so it is fast, free and
// exact, and it is the yardstick for any change to retrieval.js — a new
// ranking weight, a tag boost, a Kannada stemmer, embeddings. Questions live
// in eval/questions.json (gold = permanent block ids). Run it on its own with
//     npx jest ai/eval --verbose
// to see the report; the assertions below only guard against getting worse.
//
// What is NOT measured here: answer quality (that needs a model and a person
// reading the answers) and cost per query (no model call happens). Latency is
// the search step only.

const fs = require('fs');
const path = require('path');
const { createIndex, search, getContext } = require('./retrieval');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data.json'), 'utf8'));
const { questions } = JSON.parse(fs.readFileSync(path.join(__dirname, 'eval', 'questions.json'), 'utf8'));
const index = createIndex(data);
const labelOf = new Map(index.chunks.map(c => [c.id, c.label]));

const answerable = questions.filter(q => q.gold.length);
const unanswerable = questions.filter(q => !q.gold.length);

// What the on-device model is given (see rag.js).
const LOCAL_CONTEXT = { langs: ['kn', 'en'], k: 4, budgetChars: 5000 };

function evaluate(qs) {
    let r1 = 0, r3 = 0, r5 = 0, rr = 0, ctx = 0, ms = 0;
    const misses = [];
    for (const q of qs) {
        const t0 = performance.now();
        const hits = search(index, q.q, { k: 20 });
        ms += performance.now() - t0;
        const rank = hits.findIndex(h => q.gold.includes(h.chunk.id)) + 1;   // 0 = not in top 20
        if (rank === 1) r1++;
        if (rank >= 1 && rank <= 3) r3++;
        if (rank >= 1 && rank <= 5) r5++;
        if (rank) rr += 1 / rank;
        const passages = getContext(index, q.q, LOCAL_CONTEXT);
        if (passages.some(p => q.gold.includes(p.id))) ctx++;
        if (!(rank >= 1 && rank <= 5)) misses.push({ q: q.q, lang: q.lang, rank: rank || '>20', top: hits.slice(0, 3).map(h => h.chunk.label).join(' '), want: q.gold.map(g => labelOf.get(g)).join(' ') });
    }
    const n = qs.length || 1;
    return { n: qs.length, 'recall@1': r1 / n, 'recall@3': r3 / n, 'recall@5': r5 / n, mrr: rr / n, 'model sees it': ctx / n, 'ms/query': ms / n, misses };
}

const byLang = {};
['en', 'kn', 'translit'].forEach(l => { byLang[l] = evaluate(answerable.filter(q => q.lang === l)); });
const overall = evaluate(answerable);

const pct = x => (x * 100).toFixed(0).padStart(3) + '%';
function report() {
    const rows = [['all', overall], ...Object.entries(byLang)];
    const lines = ['', 'RETRIEVAL EVAL  (answerable questions; a question passes if any gold block is found)',
        'set       n  recall@1  recall@3  recall@5   MRR   model-sees-it  ms/query'];
    rows.forEach(([name, m]) => lines.push(
        `${name.padEnd(9)} ${String(m.n).padStart(2)}  ${pct(m['recall@1'])}       ${pct(m['recall@3'])}       ${pct(m['recall@5'])}      ${m.mrr.toFixed(2)}  ${pct(m['model sees it'])}          ${m['ms/query'].toFixed(2)}`));
    lines.push('', 'Misses (not in top 5):');
    overall.misses.forEach(x => lines.push(`  [${x.lang}] ${x.q}\n        got: ${x.top || '(nothing)'}   wanted: ${x.want}   rank: ${x.rank}`));
    const tops = unanswerable.map(q => ({ q: q.q, score: (search(index, q.q, { k: 1 })[0]?.score || 0) }));
    const real = answerable.map(q => search(index, q.q, { k: 1 })[0]?.score || 0).sort((a, b) => a - b);
    lines.push('', 'Top score for questions the book does NOT cover (a wrong match this high would reach the model):');
    tops.forEach(t => lines.push(`  ${t.score.toFixed(2).padStart(5)}  ${t.q}`));
    lines.push(`Lowest top score among answerable questions: ${real[0]?.toFixed(2)}  (median ${real[Math.floor(real.length / 2)]?.toFixed(2)})`, '');
    return lines.join('\n');
}

describe('the question set itself', () => {
    test('every gold id is a real block, ids are unique, and each answerable question has a gold', () => {
        const ids = new Set(index.chunks.map(c => c.id));
        const seen = new Set();
        questions.forEach(q => {
            expect(seen.has(q.id)).toBe(false);
            seen.add(q.id);
            q.gold.forEach(g => expect(ids.has(g)).toBe(true));
        });
        expect(answerable.length).toBeGreaterThanOrEqual(30);
    });

    test('goldLabels written at drafting time still match the current labels (renumbering shows up here)', () => {
        const stale = [];
        questions.forEach(q => q.gold.forEach((g, i) => { if (labelOf.get(g) !== q.goldLabels[i]) stale.push(`${q.id}: ${q.goldLabels[i]} is now ${labelOf.get(g)}`); }));
        expect(stale).toEqual([]);
    });
});

describe('retrieval quality (baseline: guards against getting worse; raise the floors when it improves)', () => {
    test('prints the report', () => { console.log(report()); });

    // Floors are the measured baseline minus a small margin, so a real regression
    // fails but a one-question wobble from editing data.json does not.
    const FLOORS = JSON.parse(fs.readFileSync(path.join(__dirname, 'eval', 'floors.json'), 'utf8'));
    ['all', 'en', 'kn', 'translit'].forEach(name => {
        test(`${name}: recall@5 and "model sees it" stay above their floors`, () => {
            const m = name === 'all' ? overall : byLang[name];
            expect(m['recall@5']).toBeGreaterThanOrEqual(FLOORS[name]['recall@5']);
            expect(m['model sees it']).toBeGreaterThanOrEqual(FLOORS[name]['model sees it']);
        });
    });
});
