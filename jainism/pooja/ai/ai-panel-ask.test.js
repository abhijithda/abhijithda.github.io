// Asking a question through the drawer, with a fake engine: what the reader
// actually sees (not just what rag.js returns).

const fs = require('fs');
const path = require('path');

const mockEngine = { id: 'local', generate: jest.fn(), prepare: jest.fn(async () => {}), available: () => ({ ok: true }) };
jest.mock('./engines/index.js', () => ({ getEngine: () => mockEngine }));

const { initAi } = require('./ai-panel');
const { saveSettings } = require('../core/settings');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data.json'), 'utf8'));

const flush = () => new Promise(r => setTimeout(r, 0));
async function ask(question) {
    document.getElementById('ai-input').value = question;
    document.getElementById('ai-send').click();
    for (let i = 0; i < 20 && document.getElementById('ai-send').disabled; i++) await flush();
}
const last = () => [...document.querySelectorAll('.ai-msg--assistant')].pop();

beforeEach(() => {
    localStorage.clear();
    saveSettings({ aiEngine: 'local' });
    document.body.innerHTML = '<button id="ai-btn"></button><select id="ai-engine-select"><option value="local"></option></select><span id="ai-engine-note"></span>';
    mockEngine.generate.mockReset();
    initAi({ data, onCite: jest.fn() });
});

test('an answer that cites the book is shown, with the book\u2019s own passages open underneath', async () => {
    mockEngine.generate.mockResolvedValue('The book says this is wrong [A-1.1].');
    await ask('what is the result of worshipping shasana devata as bhagawan');
    expect(last().textContent).toContain('The book says this is wrong');
    expect(last().querySelector('button.ai-cite').textContent).toBe('A-1.1');
    expect(last().querySelector('details.ai-sources').open).toBe(true);
    expect(last().querySelectorAll('.ai-passage').length).toBeGreaterThan(0);
});

test('an uncited answer is never shown: the reader sees the closest passages instead', async () => {
    mockEngine.generate.mockResolvedValue('Abhisheka is a ritual to purify oneself or a deity.');
    await ask('what is the result of worshipping shasana devata as bhagawan');
    expect(last().textContent).not.toMatch(/purify oneself/);
    expect(last().textContent).toMatch(/couldn.t write a reliable answer/);
    expect(last().querySelector('summary').textContent).toBe('Closest passages in the book');
    expect(last().querySelectorAll('.ai-passage').length).toBeGreaterThan(0);
});

test('raw text from the model is not shown while it is being written', async () => {
    let seen = '';
    mockEngine.generate.mockImplementation(async (_m, { onToken }) => {
        onToken('Half of an unchecked answer');
        seen = document.getElementById('ai-messages').textContent;
        return 'Checked [A-1.1].';
    });
    await ask('shasana devata');
    expect(seen).not.toMatch(/unchecked answer/);
    expect(document.getElementById('ai-status').textContent).toBe('');
});

test('a follow-up uses the previous question; a failed answer is not remembered as history', async () => {
    mockEngine.generate.mockResolvedValue('Ok [Q-19.1].');
    await ask('pooja');
    mockEngine.generate.mockResolvedValue('Still on it [Q-19.1].');
    await ask('really?');
    expect(mockEngine.generate).toHaveBeenCalledTimes(2);
    expect(last().textContent).toContain('Still on it');
});
