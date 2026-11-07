const { buildReadTick } = require('./read-tick');
const { getReadBlocks, saveReadBlocks } = require('./read-tracking');

const block = { id: 'a_001_b_1' };

beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<span id="read-progress"></span>';
});

describe('buildReadTick: initial state', () => {
    test('an unread block gets an empty "Mark as read" button', () => {
        const tick = buildReadTick(block, { isRead: false, totalBlockCount: 5 });
        expect(tick.tagName).toBe('BUTTON');
        expect(tick.type).toBe('button');
        expect(tick.className).toBe('read-tick');
        expect(tick.textContent).toBe('');
        expect(tick.title).toBe('Mark as read');
        expect(tick.getAttribute('aria-label')).toBe('Mark as read');
    });

    test('a read block starts ticked, with the "read" class', () => {
        const tick = buildReadTick(block, { isRead: true, totalBlockCount: 5 });
        expect(tick.className).toBe('read-tick read');
        expect(tick.textContent).toBe('✓');
        expect(tick.title).toBe('Marked as read');
        expect(tick.getAttribute('aria-label')).toBe('Marked as read');
    });

    test('options are optional', () => {
        expect(() => buildReadTick(block)).not.toThrow();
        expect(buildReadTick(block).classList.contains('read')).toBe(false);
    });
});

describe('buildReadTick: clicking', () => {
    test('marks the block read: persisted, repainted, and the header counter refreshed', () => {
        const tick = buildReadTick(block, { isRead: false, totalBlockCount: 4 });
        tick.click();

        expect(getReadBlocks(localStorage).has('a_001_b_1')).toBe(true);
        expect(tick.classList.contains('read')).toBe(true);
        expect(tick.textContent).toBe('✓');
        expect(tick.title).toBe('Marked as read');
        expect(document.getElementById('read-progress').textContent).toBe('✓ 1/4 read');
    });

    test('a second click marks it unread again', () => {
        const tick = buildReadTick(block, { isRead: false, totalBlockCount: 4 });
        tick.click();
        tick.click();

        expect(getReadBlocks(localStorage).has('a_001_b_1')).toBe(false);
        expect(tick.className).toBe('read-tick');
        expect(tick.textContent).toBe('');
        expect(document.getElementById('read-progress').textContent).toBe('✓ 0/4 read');
    });

    test('toggling adds to — never replaces — what is already read', () => {
        saveReadBlocks(new Set(['q_001_b_1']), localStorage);
        buildReadTick(block, { isRead: false, totalBlockCount: 4 }).click();
        expect([...getReadBlocks(localStorage)].sort()).toEqual(['a_001_b_1', 'q_001_b_1']);
        expect(document.getElementById('read-progress').textContent).toBe('✓ 2/4 read');
    });

    test('onToggle is told the NEW state each time, so a view can repaint its own parts', () => {
        const seen = [];
        const tick = buildReadTick(block, { totalBlockCount: 4, onToggle: nowRead => seen.push(nowRead) });
        tick.click();
        tick.click();
        expect(seen).toEqual([true, false]);
    });

    test('the click does not bubble to the row/card it sits in', () => {
        const parent = document.createElement('div');
        const onParentClick = jest.fn();
        parent.addEventListener('click', onParentClick);
        const tick = buildReadTick(block, { totalBlockCount: 4 });
        parent.appendChild(tick);
        document.body.appendChild(parent);

        tick.click();
        expect(onParentClick).not.toHaveBeenCalled();
    });
});
