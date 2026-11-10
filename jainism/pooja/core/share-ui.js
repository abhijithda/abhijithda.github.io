// share-ui.js — The share icon and the share sheet (bottom sheet on phones,
// small popover next to the icon on wider screens). One sheet at a time.
//
// The icon is built per block (and per card in continuous view); clicking it
// opens the sheet for that block, with a choice between "This block" and
// "Whole answer" when the item has more than one block. The sheet only shows
// the link; the receiving page is built in app.js from core/share.js.

import { buildShareUrl, shareTarget } from './share.js';

let shareData = null;
let openSheet = null;   // { close } of the sheet on screen, if any

export function setShareData(data) { shareData = data; }

const SVG_NS = 'http://www.w3.org/2000/svg';

function shareIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    [['circle', { cx: 18, cy: 5, r: 3 }], ['circle', { cx: 6, cy: 12, r: 3 }],
     ['circle', { cx: 18, cy: 19, r: 3 }], ['path', { d: 'M8.6 10.5l6.8-4M8.6 13.5l6.8 4' }]]
        .forEach(([tag, attrs]) => {
            const el = document.createElementNS(SVG_NS, tag);
            Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
            svg.appendChild(el);
        });
    return svg;
}

/**
 * The small share icon button.
 * @param {{blockId?: string, itemId?: string}} target  a block, or (card icon) a whole item
 */
export function buildShareButton({ blockId, itemId }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `share-btn${blockId ? '' : ' share-item'}`;
    btn.title = blockId ? 'Share this block' : 'Share this whole item';
    btn.setAttribute('aria-label', btn.title);
    btn.appendChild(shareIcon());
    btn.addEventListener('click', e => {
        e.stopPropagation();
        openShareSheet({ blockId, itemId, anchor: btn });
    });
    return btn;
}

async function copyText(text, input) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        input.select();
        try { return document.execCommand('copy'); } catch { return false; }
    }
}

function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
}

/** Open the sheet for a block or item. No-op if the id isn't in the data. */
export function openShareSheet({ blockId, itemId, anchor }) {
    if (!shareData) return;
    const target = shareTarget(shareData, blockId || itemId);
    if (!target) return;
    if (openSheet) openSheet.close();

    const canChoose = target.blockId !== null && target.blockCount > 1;
    let mode = target.blockId !== null && !canChoose ? 'item' : (blockId ? 'block' : 'item');
    const currentIds = () => [mode === 'block' ? target.blockId : target.itemId];
    const currentUrl = () => buildShareUrl(window.location, currentIds());

    const backdrop = el('div', 'share-backdrop');
    const panel = el('div', 'share-sheet');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'share-sheet-title');

    const head = el('div', 'share-head');
    const title = el('div', 'share-title', 'Share');
    title.id = 'share-sheet-title';
    const closeBtn = el('button', 'share-close', '✕');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    head.append(title, closeBtn);
    panel.appendChild(head);

    const choices = [];
    if (canChoose) {
        const group = el('div', 'share-choices');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', 'What to share');
        const defs = [
            ['block', `This block (${target.blockLabel})`],
            ['item', `Whole ${target.itemWord}${target.itemLabel ? ` (${target.itemLabel})` : ''}`],
        ];
        defs.forEach(([value, label]) => {
            const b = el('button', 'share-choice', label);
            b.type = 'button';
            b.addEventListener('click', () => { mode = value; refresh(); });
            choices.push([value, b]);
            group.appendChild(b);
        });
        panel.appendChild(group);
    }

    const label = el('label', 'share-link-label', 'Link');
    label.htmlFor = 'share-link';
    const input = el('input', 'share-link');
    input.id = 'share-link';
    input.readOnly = true;
    input.addEventListener('focus', () => input.select());

    const actions = el('div', 'share-actions');
    const copyBtn = el('button', 'share-primary', 'Copy link');
    copyBtn.type = 'button';
    actions.appendChild(copyBtn);
    let shareBtn = null;
    if (typeof navigator.share === 'function') {
        shareBtn = el('button', 'share-secondary', 'Share…');
        shareBtn.type = 'button';
        actions.appendChild(shareBtn);
    }
    const status = el('p', 'share-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    panel.append(label, input, actions, status);

    function refresh() {
        input.value = currentUrl();
        choices.forEach(([value, b]) => b.setAttribute('aria-pressed', String(value === mode)));
        status.textContent = '';
    }
    refresh();

    copyBtn.addEventListener('click', async () => {
        const ok = await copyText(currentUrl(), input);
        status.textContent = ok ? 'Link copied' : 'Could not copy automatically — select the link and copy it.';
    });
    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            try { await navigator.share({ title: document.title, url: currentUrl() }); }
            catch { /* cancelled — nothing to do */ }
        });
    }

    function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key !== 'Tab') return;
        const focusable = [...panel.querySelectorAll('button, input')];
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    function close() {
        document.removeEventListener('keydown', onKey, true);
        backdrop.remove();
        panel.remove();
        openSheet = null;
        if (anchor && anchor.isConnected) anchor.focus();
    }
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', onKey, true);
    openSheet = { close };

    document.body.append(backdrop, panel);
    positionPanel(panel, anchor);
    (choices.length ? choices.find(([v]) => v === mode)[1] : copyBtn).focus();
}

// Wide screens: a popover beside the icon, kept inside the window.
// Narrow screens: CSS makes it a bottom sheet, so nothing to position.
function positionPanel(panel, anchor) {
    if (!anchor || !window.matchMedia || !window.matchMedia('(min-width: 700px)').matches) return;
    const r = anchor.getBoundingClientRect();
    const w = panel.offsetWidth, h = panel.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w));
    const below = r.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, { setShareData, buildShareButton, openShareSheet });
}
