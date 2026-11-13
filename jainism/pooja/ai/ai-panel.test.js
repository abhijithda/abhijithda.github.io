const { renderAnswer, renderPassages, applyAiSetting, initAi } = require('./ai-panel');
const { saveSettings } = require('../core/settings');

beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
        <button id="ai-btn" hidden></button>
        <select id="ai-engine-select"><option value="off"></option><option value="cloud"></option><option value="local"></option></select>
        <span id="ai-engine-note"></span>`;
});

describe('renderAnswer', () => {
    test('turns valid citations into buttons that call onCite with the block id', () => {
        const box = document.createElement('div');
        const onCite = jest.fn();
        renderAnswer(box, 'Giving is dharma [A-1.1].', [{ label: 'A-1.1', blockId: 'blk1' }], onCite);
        const chip = box.querySelector('button.ai-cite');
        expect(chip.textContent).toBe('A-1.1');
        chip.click();
        expect(onCite).toHaveBeenCalledWith('blk1');
        expect(box.textContent).toBe('Giving is dharma A-1.1.');
    });

    test('leaves an unknown label as plain text', () => {
        const box = document.createElement('div');
        renderAnswer(box, 'See [A-9.9].', [], jest.fn());
        expect(box.querySelector('button')).toBeNull();
        expect(box.textContent).toBe('See [A-9.9].');
    });

    test('never parses model output as HTML', () => {
        const box = document.createElement('div');
        renderAnswer(box, '<img src=x onerror=alert(1)> <b>hi</b>', [], jest.fn());
        expect(box.querySelector('img')).toBeNull();
        expect(box.querySelector('b')).toBeNull();
        expect(box.textContent).toContain('<img');
    });
});

describe('renderPassages', () => {
    const passages = [
        { id: 'blk1', label: 'A-1.1', text: { kn: 'ದಾನ', en: 'Giving is dharma.' } },
        { id: 'blk2', label: 'Q-1.1', text: { en: 'x'.repeat(900) } },
    ];

    test('one card per passage, each with its words and a chip that opens it in the book', () => {
        const box = document.createElement('div');
        const onCite = jest.fn();
        renderPassages(box, passages, onCite, { title: 'From the book', open: true });
        expect(box.querySelector('summary').textContent).toBe('From the book');
        expect(box.querySelectorAll('.ai-passage').length).toBe(2);
        expect(box.querySelector('details').open).toBe(true);
        expect(box.textContent).toContain('Giving is dharma.');
        box.querySelectorAll('button.ai-cite')[1].click();
        expect(onCite).toHaveBeenCalledWith('blk2');
    });

    test('long passages are cut with an ellipsis; closed when asked', () => {
        const box = document.createElement('div');
        renderPassages(box, passages, jest.fn(), { title: 't', open: false });
        expect(box.querySelector('details').open).toBe(false);
        const long = [...box.querySelectorAll('.ai-passage-text')].pop().textContent;
        expect(long.length).toBeLessThan(520);
        expect(long.endsWith('\u2026')).toBe(true);
    });

    test('passage text is never parsed as HTML; nothing is drawn for no passages', () => {
        const box = document.createElement('div');
        renderPassages(box, [{ id: 'b', label: 'A-1.1', text: { en: '<img src=x onerror=alert(1)>' } }], jest.fn(), { title: 't', open: true });
        expect(box.querySelector('img')).toBeNull();
        const empty = document.createElement('div');
        renderPassages(empty, [], jest.fn(), { title: 't', open: true });
        expect(empty.children.length).toBe(0);
    });
});

describe('applyAiSetting', () => {
    test('off: Ask button hidden', () => {
        applyAiSetting();
        expect(document.getElementById('ai-btn').hidden).toBe(true);
    });

    test('cloud without an endpoint: stays hidden and the note says why', () => {
        saveSettings({ aiEngine: 'cloud' });
        applyAiSetting();
        expect(document.getElementById('ai-btn').hidden).toBe(true);
        expect(document.getElementById('ai-engine-note').textContent).toMatch(/isn.t set up/);
    });

    test('local without WebGPU: hidden, with an explanation', () => {
        saveSettings({ aiEngine: 'local' });
        applyAiSetting();
        expect(document.getElementById('ai-btn').hidden).toBe(true);
        expect(document.getElementById('ai-engine-note').textContent).toMatch(/WebGPU/);
    });

    test('local with WebGPU: Ask button shown, privacy note mentions the download', () => {
        Object.defineProperty(navigator, 'gpu', { value: {}, configurable: true });
        saveSettings({ aiEngine: 'local' });
        applyAiSetting();
        expect(document.getElementById('ai-btn').hidden).toBe(false);
        expect(document.getElementById('ai-engine-note').textContent).toMatch(/Runs on this device/);
        delete navigator.gpu;
    });
});

describe('Settings note', () => {
    test('off: the note is empty so the row stays one line', () => {
        applyAiSetting();
        expect(document.getElementById('ai-engine-note').textContent).toBe('');
    });

    test('cloud (when usable) says what is sent', () => {
        jest.resetModules();
        jest.doMock('./config.js', () => ({ ...jest.requireActual('./config.js'), CLOUD_ENDPOINT: 'https://x.test' }));
        const fresh = require('./ai-panel');
        saveSettings({ aiEngine: 'cloud' });
        fresh.applyAiSetting();
        expect(document.getElementById('ai-engine-note').textContent).toMatch(/Sends your question/);
        jest.dontMock('./config.js');
    });
});

describe('initAi', () => {
    test('picking an engine in Settings persists it', () => {
        initAi({ data: [], onCite: jest.fn() });
        const select = document.getElementById('ai-engine-select');
        select.value = 'cloud';
        select.dispatchEvent(new Event('change'));
        expect(JSON.parse(localStorage.getItem('settings')).aiEngine).toBe('cloud');
        expect(document.getElementById('ai-drawer')).not.toBeNull();
    });
});
