const fs = require('fs');
const path = require('path');
const { setShareData, buildShareButton, openShareSheet } = require('./share-ui');

const data = () => [
    { id: 'qa1', num: 3, type: 'question', blocks: [{ id: 'qb1', num: 1, type: 'paragraph' }] },
    { id: 'aa1', type: 'answer', references: ['qa1'], blocks: [
        { id: 'ab1', num: 1, type: 'paragraph' },
        { id: 'ab2', num: 2, type: 'paragraph' },
    ] },
];

const sheet = () => document.querySelector('.share-sheet');
const link = () => document.getElementById('share-link').value;
const choice = (text) => [...document.querySelectorAll('.share-choice')].find(b => b.textContent.startsWith(text));

beforeEach(() => {
    document.body.innerHTML = '';
    setShareData(data());
    delete navigator.share;
    window.matchMedia = window.matchMedia || (() => ({ matches: false }));
});
afterEach(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });

describe('buildShareButton', () => {
    test('block button and card button are labelled differently and are real buttons', () => {
        const b = buildShareButton({ blockId: 'ab1' });
        const c = buildShareButton({ itemId: 'aa1' });
        expect(b.tagName).toBe('BUTTON');
        expect(b.type).toBe('button');
        expect(b.getAttribute('aria-label')).toBe('Share this block');
        expect(c.getAttribute('aria-label')).toBe('Share this whole item');
        expect(c.classList.contains('share-item')).toBe(true);
        expect(b.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    });
    test('clicking opens the sheet and does not trigger the row\'s own click handlers', () => {
        const row = document.createElement('div');
        const rowClick = jest.fn();
        row.addEventListener('click', rowClick);
        const btn = buildShareButton({ blockId: 'ab1' });
        row.appendChild(btn);
        document.body.appendChild(row);
        btn.click();
        expect(sheet()).not.toBeNull();
        expect(rowClick).not.toHaveBeenCalled();
    });
});

describe('share sheet', () => {
    test('a block of a multi-block item offers "This block" and "Whole answer", starting on the block', () => {
        openShareSheet({ blockId: 'ab2' });
        expect(choice('This block (A-3.2)').getAttribute('aria-pressed')).toBe('true');
        expect(choice('Whole answer (A-3)').getAttribute('aria-pressed')).toBe('false');
        expect(link()).toMatch(/#\/s\/ab2$/);
    });
    test('choosing "Whole answer" switches the link to the item id', () => {
        openShareSheet({ blockId: 'ab2' });
        choice('Whole answer').click();
        expect(link()).toMatch(/#\/s\/aa1$/);
        expect(choice('Whole answer').getAttribute('aria-pressed')).toBe('true');
    });
    test('the card icon starts on the whole item', () => {
        openShareSheet({ itemId: 'aa1' });
        expect(link()).toMatch(/#\/s\/aa1$/);
    });
    test('an item with a single block has no choice to make and shares the item', () => {
        openShareSheet({ blockId: 'qb1' });
        expect(document.querySelector('.share-choices')).toBeNull();
        expect(link()).toMatch(/#\/s\/qa1$/);
    });
    test('unknown id does nothing', () => {
        openShareSheet({ blockId: 'nope' });
        expect(sheet()).toBeNull();
    });
    test('only one sheet at a time; Escape and the backdrop close it, and focus returns to the icon', () => {
        const btn = buildShareButton({ blockId: 'ab1' });
        document.body.appendChild(btn);
        btn.click();
        openShareSheet({ blockId: 'ab2' });
        expect(document.querySelectorAll('.share-sheet')).toHaveLength(1);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(sheet()).toBeNull();
        btn.click();
        document.querySelector('.share-backdrop').click();
        expect(sheet()).toBeNull();
        expect(document.activeElement).toBe(btn);
    });
    test('Copy link writes the current link to the clipboard and says so', async () => {
        const writeText = jest.fn().mockResolvedValue();
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        openShareSheet({ blockId: 'ab1' });
        document.querySelector('.share-primary').click();
        await Promise.resolve(); await Promise.resolve();
        expect(writeText).toHaveBeenCalledWith(link());
        expect(document.querySelector('.share-status').textContent).toBe('Link copied');
    });
    test('"Share…" appears only where the browser can share, and shares the current link', async () => {
        openShareSheet({ blockId: 'ab1' });
        expect(document.querySelector('.share-secondary')).toBeNull();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        navigator.share = jest.fn().mockResolvedValue();
        openShareSheet({ blockId: 'ab1' });
        document.querySelector('.share-secondary').click();
        expect(navigator.share).toHaveBeenCalledWith(expect.objectContaining({ url: link() }));
    });
});

describe('share.css', () => {
    test('the tap-target area never extends past the right edge of the icon (it caused a sideways scroll at phone widths)', () => {
        const css = fs.readFileSync(path.join(__dirname, 'share.css'), 'utf8');
        const rule = css.match(/\.share-btn::before\s*{([^}]*)}/)[1];
        const [top, right, bottom, left] = rule.match(/inset:\s*([^;]+);/)[1].trim().split(/\s+/);
        expect(right).toMatch(/^0(px)?$/);
        expect(parseInt(top, 10)).toBeLessThan(0);   // still a bigger target above, below and to the left
        expect(parseInt(bottom, 10)).toBeLessThan(0);
        expect(parseInt(left, 10)).toBeLessThan(0);
    });
});

