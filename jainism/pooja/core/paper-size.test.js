const { loadSettings, saveSettings } = require('./settings');
const { PAPER_SIZES, applyPaperSize, initPaperSizeControl } = require('./paper-size');
const { applySettings } = require('../header/header');

function baseDom() {
    document.body.innerHTML = `
        <select id="paper-size-select">
            <option value="dynamic">Dynamic</option>
            <option value="a4">A4</option>
            <option value="a3">A3</option>
        </select>
        <style id="print-page-size"></style>
        <!-- applySettings() also touches these; present so it doesn't no-op oddly. -->
        <input type="checkbox" id="toggle-videos" checked>
        <input type="checkbox" id="toggle-qrs">
        <input type="checkbox" id="toggle-read-tracking">
        <button id="font-scale-decrease"></button>
        <span id="font-scale-display"></span>
        <button id="font-scale-increase"></button>
    `;
}

beforeEach(() => {
    localStorage.clear();
    baseDom();
});

// 'dynamic' is the current/default responsive behavior in both views on
// screen, but must always print as A4 — a printer can't be handed "whatever
// fits your screen" as a paper size. Only 'a3' should change the printed
// sheet.
describe('applyPaperSize', () => {
    test('defaults to dynamic: sets body[data-paper-size] and the select, and prints as A4', () => {
        applyPaperSize();
        expect(document.body.dataset.paperSize).toBe('dynamic');
        expect(document.getElementById('paper-size-select').value).toBe('dynamic');
        expect(document.getElementById('print-page-size').textContent).toContain('A4');
    });

    test('an explicit A4 choice also prints as A4', () => {
        saveSettings({ paperSize: 'a4' });
        applyPaperSize();
        expect(document.body.dataset.paperSize).toBe('a4');
        expect(document.getElementById('print-page-size').textContent).toContain('A4');
        expect(document.getElementById('print-page-size').textContent).not.toContain('A3');
    });

    test('an A3 choice is the only one that changes the printed sheet', () => {
        saveSettings({ paperSize: 'a3' });
        applyPaperSize();
        expect(document.body.dataset.paperSize).toBe('a3');
        expect(document.getElementById('print-page-size').textContent).toContain('A3');
    });

    test('print orientation follows the active view: landscape for book, portrait for continuous', () => {
        localStorage.setItem('viewMode', 'book');
        applyPaperSize();
        expect(document.getElementById('print-page-size').textContent).toContain('landscape');

        localStorage.setItem('viewMode', 'continuous');
        applyPaperSize();
        expect(document.getElementById('print-page-size').textContent).toContain('portrait');
    });

    test('fires a pooja:layout-changed event, so book view can re-measure its pagination', () => {
        let fired = 0;
        window.addEventListener('pooja:layout-changed', () => fired++);
        applyPaperSize();
        expect(fired).toBe(1);
    });

    test.each(PAPER_SIZES)('accepts and applies %s', (size) => {
        saveSettings({ paperSize: size });
        applyPaperSize();
        expect(document.body.dataset.paperSize).toBe(size);
    });
});

describe('initPaperSizeControl', () => {
    test('changing the <select> persists the choice and re-applies it', () => {
        initPaperSizeControl();
        const select = document.getElementById('paper-size-select');
        select.value = 'a3';
        select.dispatchEvent(new Event('change'));

        expect(loadSettings().paperSize).toBe('a3');
        expect(document.body.dataset.paperSize).toBe('a3');
    });

    test('applies the current setting immediately on init, without waiting for a change', () => {
        saveSettings({ paperSize: 'a4' });
        initPaperSizeControl();
        expect(document.body.dataset.paperSize).toBe('a4');
        expect(document.getElementById('paper-size-select').value).toBe('a4');
    });
});

describe('applySettings pushes the saved paper size onto the select (header.js integration)', () => {
    test('a saved A3 choice survives a fresh applySettings() call', () => {
        saveSettings({ paperSize: 'a3' });
        baseDom();
        applySettings();
        expect(document.getElementById('paper-size-select').value).toBe('a3');
        expect(document.body.dataset.paperSize).toBe('a3');
    });
});
