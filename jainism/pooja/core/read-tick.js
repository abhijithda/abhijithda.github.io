// read-tick.js — The "mark as read" tick button, built once for every view.
//
// Continuous and book view each carried an identical copy of this: create
// the button, set its title/aria-label/✓ for the current state, and on click
// toggle the block in storage, repaint the button and refresh the header
// progress counter. They differed only in what ELSE a view wants repainted
// (continuous also marks the whole row read) — that is the `onToggle` hook.

import { getReadBlocks, saveReadBlocks, toggleBlockRead, updateProgressDisplay } from './read-tracking.js';

/**
 * @param {Object} block
 * @param {Object} opts
 * @param {boolean} [opts.isRead]        initial state
 * @param {number}  [opts.totalBlockCount]  denominator for the header counter
 * @param {(nowRead: boolean) => void} [opts.onToggle]  extra repaint a view needs
 * @returns {HTMLButtonElement}
 */
export function buildReadTick(block, { isRead = false, totalBlockCount = 0, onToggle } = {}) {
    const tick = document.createElement('button');
    tick.type = 'button';
    tick.className = 'read-tick';

    const paint = read => {
        tick.classList.toggle('read', read);
        tick.textContent = read ? '✓' : '';
        tick.title = read ? 'Marked as read' : 'Mark as read';
        tick.setAttribute('aria-label', tick.title);
    };
    paint(isRead);

    tick.onclick = e => {
        e.stopPropagation();
        const newSet = toggleBlockRead(block.id, getReadBlocks(localStorage));
        saveReadBlocks(newSet, localStorage);
        const nowRead = newSet.has(block.id);
        paint(nowRead);
        if (onToggle) onToggle(nowRead);
        updateProgressDisplay(newSet, totalBlockCount);
    };

    return tick;
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, { buildReadTick });
}
