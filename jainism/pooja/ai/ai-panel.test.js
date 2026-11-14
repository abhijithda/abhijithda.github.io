const { renderAnswer, renderPassages, applyAiSetting, initAi, setPanelWidth, currentPanelWidth, revealTarget, revealTargetWhenSettled, collapseToPill, openDrawer, closeDrawer } = require('./ai-panel');
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

    test('further matches stay hidden behind a button that adds them', () => {
        const box = document.createElement('div');
        const more = [{ id: 'm1', label: 'A-2.1', text: { en: 'More one.' } }, { id: 'm2', label: 'A-2.2', text: { en: 'More two.' } }];
        renderPassages(box, passages, jest.fn(), { title: 't', open: true, more });
        expect(box.querySelectorAll('.ai-passage').length).toBe(2);
        const btn = box.querySelector('button.ai-more');
        expect(btn.textContent).toBe('Show 2 more matching passages');
        btn.click();
        expect(box.querySelectorAll('.ai-passage').length).toBe(4);
        expect(box.querySelector('button.ai-more')).toBeNull();
        expect(box.textContent).toContain('More two.');
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

describe('drawer width', () => {
    const drawer = () => document.getElementById('ai-drawer');
    const handle = () => document.getElementById('ai-resize');
    const saved = () => JSON.parse(localStorage.getItem('settings') || '{}').aiPanelWidth;
    const pointer = (type, x) => handle().dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, clientX: x }), { pointerId: 1 }));

    beforeEach(() => {
        window.innerWidth = 1400;
        initAi({ data: [], onCite: jest.fn() });
    });

    test('starts at the saved width', () => {
        document.body.innerHTML = '';
        localStorage.clear();
        saveSettings({ aiPanelWidth: 555 });
        initAi({ data: [], onCite: jest.fn() });
        expect(drawer().style.getPropertyValue('--ai-width')).toBe('555px');
    });

    test('dragging the edge resizes live and saves when released', () => {
        pointer('pointerdown', 980);          // drawer's left edge
        pointer('pointermove', 700);          // dragged left: panel is 1400 - 700 wide
        expect(drawer().style.getPropertyValue('--ai-width')).toBe('700px');
        expect(saved()).not.toBe(700);        // not saved mid-drag
        pointer('pointerup', 700);
        expect(saved()).toBe(700);
        expect(document.body.classList.contains('ai-resizing')).toBe(false);
    });

    test('is kept within limits', () => {
        expect(setPanelWidth(50)).toBe(320);
        expect(setPanelWidth(5000)).toBe(1330);    // 95% of a 1400px window
    });

    test('arrow keys resize, Home and double-click reset', () => {
        setPanelWidth(500);
        handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        expect(currentPanelWidth()).toBe(524);
        handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
        expect(currentPanelWidth()).toBe(428);
        handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        expect(currentPanelWidth()).toBe(420);
        setPanelWidth(800);
        handle().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        expect(currentPanelWidth()).toBe(420);
    });

    test('the expand button toggles between normal and wide', () => {
        const btn = document.querySelector('.ai-expand');
        btn.click();
        expect(currentPanelWidth()).toBe(900);
        btn.click();
        expect(currentPanelWidth()).toBe(420);
    });
});

describe('stepping aside to read a cited passage', () => {
    const rect = (left, right) => ({ left, right, top: 100, bottom: 400, width: right - left, height: 300 });
    const drawer = () => document.getElementById('ai-drawer');
    const pill = () => document.getElementById('ai-back');

    beforeEach(() => {
        window.innerWidth = 1400;
        document.body.innerHTML = '<div id="book-blk1"></div><div id="blk2"></div>';
        initAi({ data: [], onCite: jest.fn() });
        openDrawer();
        drawer().getBoundingClientRect = () => rect(980, 1400);
    });

    test('a passage under the drawer: the drawer collapses to a "Back to answer" button', () => {
        document.getElementById('book-blk1').getBoundingClientRect = () => rect(1000, 1300);
        expect(revealTarget('blk1')).toBe(true);
        expect(drawer().hidden).toBe(true);
        expect(pill().hidden).toBe(false);
    });

    test('a passage clear of the drawer: nothing moves (continuous view uses the plain id)', () => {
        document.getElementById('blk2').getBoundingClientRect = () => rect(100, 800);
        expect(revealTarget('blk2')).toBe(false);
        expect(drawer().hidden).toBe(false);
        expect(pill().hidden).toBe(true);
    });

    test('the button brings the conversation back, and closing the drawer never leaves a stray button', () => {
        const before = document.getElementById('ai-messages');
        collapseToPill();
        pill().click();
        expect(drawer().hidden).toBe(false);
        expect(pill().hidden).toBe(true);
        expect(document.getElementById('ai-messages')).toBe(before);   // same conversation, not rebuilt
        collapseToPill();
        closeDrawer();
        expect(pill().hidden).toBe(true);
    });

    test('waits for a sliding page turn to finish before judging whether the drawer is in the way', () => {
        jest.useFakeTimers();
        const el = document.getElementById('book-blk1');
        let left = 1500;                                  // still off to the right, sliding in
        el.getBoundingClientRect = () => rect(left, left + 300);
        revealTargetWhenSettled('blk1', { interval: 100 });
        jest.advanceTimersByTime(100);  left = 1200;      // moving
        jest.advanceTimersByTime(100);  left = 1000;      // moving
        jest.advanceTimersByTime(100);
        expect(drawer().hidden).toBe(false);              // not judged while moving
        jest.advanceTimersByTime(200);                    // settled at 1000: under the drawer
        expect(drawer().hidden).toBe(true);
        expect(pill().hidden).toBe(false);
        jest.useRealTimers();
    });

    test('an unknown block, or a closed drawer, is a no-op', () => {
        expect(revealTarget('nope')).toBe(false);
        closeDrawer();
        document.getElementById('book-blk1').getBoundingClientRect = () => rect(1000, 1300);
        expect(revealTarget('blk1')).toBe(false);
        expect(pill().hidden).toBe(true);
    });
});
