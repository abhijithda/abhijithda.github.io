// The panel surviving a reload (a browser discarding an idle tab and reloading it): what comes back,
// what must not, and that it stays inside this tab.

const mockEngine = { id: 'cloud', available: () => ({ ok: true }), generate: jest.fn() };
let mockOff = false;
jest.mock('./engines/index.js', () => ({ getEngine: () => (mockOff ? null : mockEngine) }));

const { initAi, openDrawer, closeDrawer } = require('./ai-panel');
const { saveSettings } = require('../core/settings');

const data = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'data.json'), 'utf8'));
const $ = id => document.getElementById(id);
const dom = () => {
    document.body.innerHTML = '<button id="ai-btn" hidden></button><select id="ai-engine-select"><option value="cloud"></option></select><span id="ai-engine-note"></span>';
};
const boot = () => { dom(); initAi({ data, onCite: jest.fn() }); };
const texts = () => [...document.querySelectorAll('.ai-msg')].map(m => m.textContent);

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    saveSettings({ aiEngine: 'cloud' });
    mockOff = false;
    mockEngine.generate.mockReset();
    mockEngine.generate.mockResolvedValue('Ok [Q-19.1].');
    boot();
});

async function askAndWait(q) {
    openDrawer();
    $('ai-input').value = q;
    $('ai-send').click();
    await new Promise(r => setTimeout(r, 30));
}

test('after a reload the panel is open again with the conversation, citations and passages as they were', async () => {
    await askAndWait('pooja');
    const before = texts();
    expect(before.length).toBe(2);

    boot();                                                 // the reload: a fresh page, nothing in memory
    expect($('ai-drawer').hidden).toBe(false);
    expect(texts()).toEqual(before);
    expect(document.querySelector('.ai-msg--assistant button.ai-cite').textContent).toBe('Q-19.1');
    expect(document.querySelector('.ai-sources summary').textContent).toBe('Passages cited');
    expect(document.querySelector('.ai-passage').textContent.length).toBeGreaterThan(10);
});

test('a panel that was closed stays closed after a reload, but the conversation is kept for when it is opened', async () => {
    await askAndWait('pooja');
    closeDrawer();
    boot();
    expect($('ai-drawer').hidden).toBe(true);
    expect(texts().length).toBe(2);
});

test('the follow-up memory comes back too, so a question after the reload still has its context', async () => {
    await askAndWait('pooja');
    boot();
    $('ai-input').value = 'and then?';
    $('ai-send').click();
    await new Promise(r => setTimeout(r, 30));
    const sent = mockEngine.generate.mock.calls.at(-1)[0];
    expect(sent.some(m => m.content === 'pooja')).toBe(true);
});

test('errors come back as errors', async () => {
    mockEngine.generate.mockRejectedValue(new Error('Couldn\u2019t reach the cloud assistant. Check your internet connection and try again.'));
    await askAndWait('pooja');
    boot();
    const err = document.querySelector('.ai-msg--error');
    expect(err.textContent).toMatch(/reach the cloud assistant/);
});

test('it lives in this tab only: nothing is written to localStorage, and passages are stored cut to what is shown', async () => {
    await askAndWait('pooja');
    expect(localStorage.getItem('aiPanelSession')).toBeNull();
    const kept = JSON.parse(sessionStorage.getItem('aiPanelSession'));
    const shown = kept.log.find(e => e.r === 'answer').shown;
    expect(shown.length).toBeGreaterThan(0);
    shown.forEach(p => Object.values(p.text).forEach(t => expect(t.length).toBeLessThanOrEqual(501)));
});

test('only the last conversation entries are kept', async () => {
    for (let i = 0; i < 16; i++) await askAndWait('question ' + i);
    const kept = JSON.parse(sessionStorage.getItem('aiPanelSession'));
    expect(kept.log.length).toBeLessThanOrEqual(24);
    expect(kept.log.at(-2)).toEqual({ r: 'user', text: 'question 15' });
});

test('if the assistant has been switched off, the panel stays closed after a reload (no silent dead panel)', async () => {
    await askAndWait('pooja');
    mockOff = true;
    saveSettings({ aiEngine: 'off' });
    boot();
    expect($('ai-drawer').hidden).toBe(true);
});

test('damaged saved data is ignored, not fatal', () => {
    sessionStorage.setItem('aiPanelSession', '{not json');
    expect(() => boot()).not.toThrow();
    sessionStorage.setItem('aiPanelSession', JSON.stringify({ open: true, log: [null, { r: 'user' }, { r: 'answer', text: 5 }] }));
    expect(() => boot()).not.toThrow();
    expect(texts()).toEqual([]);
});

test('a restored message is drawn as text, never as markup', async () => {
    sessionStorage.setItem('aiPanelSession', JSON.stringify({ open: false, log: [{ r: 'user', text: '<img src=x onerror=alert(1)>' }, { r: 'error', text: '<b>x</b>' }] }));
    boot();
    expect(document.querySelector('.ai-msg img')).toBeNull();
    expect(document.querySelector('.ai-msg b')).toBeNull();
    expect(texts()[0]).toBe('<img src=x onerror=alert(1)>');
});
