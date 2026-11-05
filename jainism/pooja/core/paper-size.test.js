const { loadSettings, saveSettings } = require('./settings');
const { PAPER_SIZES, applyPaperSize, initPaperSizeControl, buildPageCss } = require('./paper-size');
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
// fits your screen" as a paper size. Only 'a3' should change the printed sheet.
//
// In book view the paper size is the SHEET you print on and fold, and a book
// page is half a sheet: A4 sheet -> A5 pages, A3 sheet -> A4 pages. (Book is
// the default view when none is stored.) In continuous view the paper size is
// the page itself.
describe('applyPaperSize', () => {
    const pageCss = () => document.getElementById('print-page-size').textContent;

    test('defaults to dynamic: sets body[data-paper-size] and the select, and prints as A4 sheets (A5 book pages)', () => {
        applyPaperSize();
        expect(document.body.dataset.paperSize).toBe('dynamic');
        expect(document.getElementById('paper-size-select').value).toBe('dynamic');
        expect(pageCss()).toContain('size: A5 portrait');
    });

    test('an explicit A4 choice prints exactly like dynamic', () => {
        applyPaperSize();
        const dynamicCss = pageCss();
        saveSettings({ paperSize: 'a4' });
        applyPaperSize();
        expect(document.body.dataset.paperSize).toBe('a4');
        expect(pageCss()).toBe(dynamicCss);
        expect(pageCss()).not.toContain('A3');
    });

    test('an A3 choice is the only one that changes the printed sheet (A4 book pages)', () => {
        saveSettings({ paperSize: 'a3' });
        applyPaperSize();
        expect(document.body.dataset.paperSize).toBe('a3');
        expect(pageCss()).toContain('size: A4 portrait');
    });

    test('continuous view prints whole A4 / A3 pages', () => {
        localStorage.setItem('viewMode', 'continuous');
        applyPaperSize();
        expect(pageCss()).toContain('size: A4 portrait');
        saveSettings({ paperSize: 'a3' });
        applyPaperSize();
        expect(pageCss()).toContain('size: A3 portrait');
    });

    test('both views print portrait pages: book pages are half a sheet, never a landscape spread', () => {
        localStorage.setItem('viewMode', 'book');
        applyPaperSize();
        expect(pageCss()).toContain('portrait');
        expect(pageCss()).not.toContain('landscape');

        localStorage.setItem('viewMode', 'continuous');
        applyPaperSize();
        expect(pageCss()).toContain('portrait');
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

describe('buildPageCss', () => {
    test("'dynamic' prints exactly like 'a4' in both views", () => {
        expect(buildPageCss('dynamic', 'book')).toBe(buildPageCss('a4', 'book'));
        expect(buildPageCss('dynamic', 'continuous')).toBe(buildPageCss('a4', 'continuous'));
    });

    test('continuous: a single plain @page rule, no page numbers (the PDF footer / browser supplies them)', () => {
        const css = buildPageCss('a4', 'continuous');
        expect(css).toBe('@page { size: A4 portrait; margin: 15mm; }');
        expect(css).not.toContain('counter(page)');
    });

    test('book: real page numbers bottom-centre, hidden on the title page', () => {
        const css = buildPageCss('a4', 'book');
        expect(css).toContain('@bottom-center { content: counter(page);');
        expect(css).toMatch(/@page :first \{ @bottom-center \{ content: none;/);
    });

    test('book: binding margin is mirrored and larger than the outer margin (right pages: inner on the left)', () => {
        for (const size of ['a4', 'a3']) {
            const css = buildPageCss(size, 'book');
            const right = css.match(/@page \{ size: [^;]+; margin: (\d+)mm (\d+)mm (\d+)mm (\d+)mm; \}/);
            const left  = css.match(/@page :left \{ margin: (\d+)mm (\d+)mm (\d+)mm (\d+)mm; \}/);
            expect(right).not.toBeNull();
            expect(left).not.toBeNull();
            const [, , rOuter, , rInner] = right.map(Number);   // top right bottom left
            const [, , lInner, , lOuter] = left.map(Number);
            expect(rInner).toBeGreaterThan(rOuter);
            expect(lInner).toBe(rInner);
            expect(lOuter).toBe(rOuter);
        }
    });

    test('book: usable height stays 180mm (A5 page) / 267mm (A4 page): the photo caps in book-view.css depend on it', () => {
        const usable = (size, pageHeight) => {
            const m = buildPageCss(size, 'book').match(/margin: (\d+)mm \d+mm (\d+)mm \d+mm; \}/);
            return pageHeight - Number(m[1]) - Number(m[2]);
        };
        expect(usable('a4', 210)).toBe(180);
        expect(usable('a3', 297)).toBe(267);
    });
});
