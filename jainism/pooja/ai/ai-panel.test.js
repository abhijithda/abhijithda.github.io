const { renderAnswer, applyAiSetting, initAi } = require('./ai-panel');
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
        expect(document.getElementById('ai-engine-note').textContent).toMatch(/stays on this device/);
        delete navigator.gpu;
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
