// The AI-assistant picker exists twice: in the header's Settings menu and in
// the Home page's settings mirror. They must always agree, whichever is used.

const { initHomeControls } = require('./home');
const { initAi } = require('../ai/ai-panel');
const { saveSettings } = require('../core/settings');

const fire = (el, value) => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
const stored = () => JSON.parse(localStorage.getItem('settings')).aiEngine;

function setup(saved) {
    localStorage.clear();
    if (saved) saveSettings({ aiEngine: saved });
    document.body.innerHTML = `
        <button id="ai-btn" hidden></button>
        <div id="header-menu">
            <select id="ai-engine-select"><option value="off"></option><option value="cloud"></option><option value="local"></option></select>
            <span id="ai-engine-note"></span>
            <button id="font-scale-increase"></button>
        </div>
        <div class="home-settings">
            <select id="home-ai-engine-select"><option value="off"></option><option value="cloud"></option><option value="local"></option></select>
            <p id="home-ai-engine-note"></p>
            <span id="home-font-scale-display"></span>
        </div>`;
    initHomeControls([]);
    initAi({ data: [], onCite: () => {} });
}

const header = () => document.getElementById('ai-engine-select');
const home = () => document.getElementById('home-ai-engine-select');

test('on load, both pickers show the saved engine', () => {
    setup('local');
    expect(header().value).toBe('local');
    expect(home().value).toBe('local');
});

test('changing it in the header updates the Home page at once', () => {
    setup();
    fire(header(), 'cloud');
    expect(stored()).toBe('cloud');
    expect(home().value).toBe('cloud');
});

test('changing it on Home saves it and updates the header', () => {
    setup();
    fire(home(), 'local');
    expect(stored()).toBe('local');
    expect(header().value).toBe('local');
    expect(home().value).toBe('local');
});

test('both notes always say the same thing', () => {
    setup();
    fire(header(), 'local');
    const a = document.getElementById('ai-engine-note').textContent;
    const b = document.getElementById('home-ai-engine-note').textContent;
    expect(a).not.toBe('');
    expect(b).toBe(a);
    fire(header(), 'off');
    expect(document.getElementById('home-ai-engine-note').textContent).toBe('');
});

test('a font-size change in the header refreshes the Home page display too', () => {
    jest.useFakeTimers();
    setup();
    saveSettings({ fontScale: 1.2 });
    document.getElementById('font-scale-increase').click();
    jest.runAllTimers();
    expect(document.getElementById('home-font-scale-display').textContent).toBe('120%');
    jest.useRealTimers();
});
