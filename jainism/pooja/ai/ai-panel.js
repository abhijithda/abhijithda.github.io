// ai/ai-panel.js — The assistant: the Settings engine picker, the header
// "Ask" button, and a slide-over drawer (an overlay, not a side column, so it
// can never change the width the book view paginates against).
//
// Everything the model returns is put on the page with textContent / DOM
// nodes — never innerHTML — so model output can't inject markup.

import { loadSettings, saveSettings, AI_PANEL_WIDTH_MIN, AI_PANEL_WIDTH_MAX, AI_PANEL_WIDTH_DEFAULT } from '../core/settings.js';
import { createIndex } from './retrieval.js';
import { answerQuestion } from './rag.js';
import { getEngine } from './engines/index.js';
import { LOCAL_MODEL_SIZE_HINT } from './config.js';
import { LOCAL_GPU_FAILED } from './engines/local.js';

// Short on purpose: it sits under the picker in the Settings menu.
const PRIVACY = {
    cloud: 'Sends your question and the passages found for it to an AI service.',
    local: 'Runs on this device. The first use downloads a model (' + LOCAL_MODEL_SIZE_HINT + ').',
};

let state = { data: null, index: null, onCite: null, history: [], abort: null, busy: false };

const $ = id => document.getElementById(id);

/** Splits an answer into text and [label] citations and appends them as nodes. */
export function renderAnswer(container, text, citations, onCite) {
    container.replaceChildren();
    const byLabel = new Map(citations.map(c => [c.label, c.blockId]));
    text.split(/(\[[A-Za-z]-\d+\.\d+\])/).forEach(part => {
        const label = part.slice(1, -1);
        if (/^\[[A-Za-z]-\d+\.\d+\]$/.test(part) && byLabel.has(label)) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'ai-cite';
            chip.textContent = label;
            chip.title = 'Go to this passage in the book';
            chip.addEventListener('click', () => onCite && onCite(byLabel.get(label)));
            container.appendChild(chip);
        } else if (part) {
            container.appendChild(document.createTextNode(part));
        }
    });
}

const PASSAGE_PREVIEW_CHARS = 500;

/**
 * The book's own words, word for word, under an answer: one card per passage,
 * with a chip that opens it in the book. Text goes in as plain text.
 * @param {HTMLElement} container
 * @param {Object[]} passages  [{id, label, text: {lang: string}}]
 * @param {(blockId: string) => void} onCite
 * @param {{title: string, open: boolean}} opts
 */
export function renderPassages(container, passages, onCite, { title, open, more = [] }) {
    if (!passages.length) return;
    const details = document.createElement('details');
    details.className = 'ai-sources';
    details.open = open;
    const summary = document.createElement('summary');
    summary.textContent = title;
    details.appendChild(summary);

    const addCard = (p) => {
        const card = document.createElement('div');
        card.className = 'ai-passage';
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'ai-cite';
        chip.textContent = p.label;
        chip.title = 'Open this passage in the book';
        chip.addEventListener('click', () => onCite && onCite(p.id));
        card.appendChild(chip);
        Object.values(p.text).forEach(text => {
            const line = document.createElement('div');
            line.className = 'ai-passage-text';
            line.textContent = text.length > PASSAGE_PREVIEW_CHARS ? text.slice(0, PASSAGE_PREVIEW_CHARS).trimEnd() + '\u2026' : text;
            card.appendChild(line);
        });
        return card;
    };
    passages.forEach(p => details.appendChild(addCard(p)));

    // Further matches, on request: a one-word question like "abhisheka" has far
    // more matching passages than fit in a few cards.
    if (more.length) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ai-more';
        btn.textContent = `Show ${more.length} more matching passage${more.length === 1 ? '' : 's'}`;
        btn.addEventListener('click', () => {
            more.forEach(p => details.insertBefore(addCard(p), btn));
            btn.remove();
        });
        details.appendChild(btn);
    }
    container.appendChild(details);
}

function addMessage(role, text = '') {
    const list = $('ai-messages');
    const el = document.createElement('div');
    el.className = `ai-msg ai-msg--${role}`;
    el.textContent = text;
    list.appendChild(el);
    list.scrollTop = list.scrollHeight;
    return el;
}

function setStatus(text) {
    const el = $('ai-status');
    if (el) el.textContent = text || '';
}

function currentEngine() {
    return getEngine(loadSettings().aiEngine);
}

/** Show/hide the Ask button and update the Settings note for the chosen engine. */
export function applyAiSetting() {
    const choice = loadSettings().aiEngine;
    const engine = getEngine(choice);
    // The picker exists twice (header Settings menu and the Home page's mirror);
    // both always show the same value and the same one-line note.
    const selects = [$('ai-engine-select'), $('home-ai-engine-select')];
    const notes = [$('ai-engine-note'), $('home-ai-engine-note')];
    selects.forEach(sel => { if (sel) sel.value = choice; });

    let reason = '';
    if (engine) {
        const a = engine.available();
        if (!a.ok) reason = a.reason;
    }
    notes.forEach(note => { if (note) note.textContent = reason || PRIVACY[choice] || ''; });
    const usable = !!engine && !reason;
    const btn = $('ai-btn');
    if (btn) btn.hidden = !usable;
    if (!usable) closeDrawer();
}

// ── Drawer width ─────────────────────────────────────────────────────────
// Dragging the left edge resizes the drawer (arrow keys too, double-click or
// Home resets); the ⤢ button toggles a wide reading size. Saved in Settings.
const WIDE_PANEL = 900;

function clampPanelWidth(w) {
    const room = typeof window !== 'undefined' ? Math.floor(window.innerWidth * 0.95) : AI_PANEL_WIDTH_MAX;
    return Math.round(Math.min(AI_PANEL_WIDTH_MAX, room, Math.max(AI_PANEL_WIDTH_MIN, w)));
}

export function setPanelWidth(width, { save = true } = {}) {
    const w = clampPanelWidth(width);
    $('ai-drawer')?.style.setProperty('--ai-width', `${w}px`);
    const handle = $('ai-resize');
    if (handle) handle.setAttribute('aria-valuenow', String(w));
    if (save) saveSettings({ aiPanelWidth: w });
    return w;
}

export function currentPanelWidth() {
    return parseInt($('ai-drawer')?.style.getPropertyValue('--ai-width'), 10) || loadSettings().aiPanelWidth;
}

function buildResizeHandle() {
    const handle = document.createElement('div');
    handle.id = 'ai-resize';
    handle.className = 'ai-resize';
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'Resize the assistant panel (drag, or use the arrow keys)');
    handle.setAttribute('aria-valuemin', String(AI_PANEL_WIDTH_MIN));
    handle.setAttribute('aria-valuemax', String(AI_PANEL_WIDTH_MAX));
    handle.title = 'Drag to resize. Double-click to reset.';

    let dragging = false;
    handle.addEventListener('pointerdown', e => {
        dragging = true;
        handle.setPointerCapture?.(e.pointerId);
        document.body.classList.add('ai-resizing');   // stops text selection while dragging
        e.preventDefault();
    });
    handle.addEventListener('pointermove', e => {
        if (dragging) setPanelWidth(window.innerWidth - e.clientX, { save: false });
    });
    const stop = () => {
        if (!dragging) return;
        dragging = false;
        document.body.classList.remove('ai-resizing');
        setPanelWidth(currentPanelWidth());          // clamp and save the final width
    };
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
    handle.addEventListener('dblclick', () => setPanelWidth(AI_PANEL_WIDTH_DEFAULT));
    handle.addEventListener('keydown', e => {
        const step = e.shiftKey ? 96 : 24;
        if (e.key === 'ArrowLeft') setPanelWidth(currentPanelWidth() + step);
        else if (e.key === 'ArrowRight') setPanelWidth(currentPanelWidth() - step);
        else if (e.key === 'Home') setPanelWidth(AI_PANEL_WIDTH_DEFAULT);
        else return;
        e.preventDefault();
    });
    return handle;
}

/**
 * revealTarget() once the target has stopped moving. A page turn slides in over
 * about half a second, and measuring while it is still sliding would judge the
 * wrong position. Gives up after maxWait ms.
 */
export function revealTargetWhenSettled(blockId, { interval = 120, maxWait = 1500 } = {}) {
    const started = Date.now();
    let last = null;
    const tick = () => {
        const el = document.getElementById(`book-${blockId}`) || document.getElementById(blockId);
        const r = el && el.getBoundingClientRect();
        const key = r ? `${Math.round(r.left)},${Math.round(r.top)}` : null;
        if (key !== null && key === last) { revealTarget(blockId); return; }
        last = key;
        if (Date.now() - started < maxWait) setTimeout(tick, interval);
    };
    setTimeout(tick, interval);
}

export function openDrawer() { const d = $('ai-drawer'); if (d) { d.hidden = false; $('ai-input')?.focus(); } hideBackPill(); }
export function closeDrawer() { const d = $('ai-drawer'); if (d) d.hidden = true; hideBackPill(); }

// ── Reading a cited passage ──────────────────────────────────────────────
// The drawer is an overlay, so it can sit on top of the very passage a citation
// just opened. Then it steps aside to a small "Back to answer" button instead of
// vanishing: one tap brings the conversation back, exactly as it was.
function hideBackPill() { const b = $('ai-back'); if (b) b.hidden = true; }

export function collapseToPill() {
    const d = $('ai-drawer');
    if (!d || d.hidden) return;
    d.hidden = true;
    const b = $('ai-back');
    if (b) b.hidden = false;
}

/** After a citation jump: step aside only if the drawer is covering the target. */
export function revealTarget(blockId) {
    const drawer = $('ai-drawer');
    if (!drawer || drawer.hidden) return false;
    const target = document.getElementById(`book-${blockId}`) || document.getElementById(blockId);
    if (!target) return false;
    const t = target.getBoundingClientRect();
    const d = drawer.getBoundingClientRect();
    const covered = t.right > d.left && t.left < d.right && t.bottom > 0 && t.top < window.innerHeight;
    if (covered) collapseToPill();
    return covered;
}

async function ask(question, { retry = false } = {}) {
    const engine = currentEngine();
    if (!engine || state.busy) return;
    state.busy = true;
    $('ai-send').disabled = true;
    if (!retry) addMessage('user', question);
    const reply = addMessage('assistant', '…');
    state.abort = new AbortController();

    try {
        if (engine.id === 'local') {
            await engine.prepare(p => setStatus(p.text || 'Preparing the on-device model…'));
            setStatus('');
        }
        state.index ||= createIndex(state.data);
        const langs = loadSettings().langs;
        const result = await answerQuestion({
            question, index: state.index, engine, langs,
            history: state.history, signal: state.abort.signal,
            // Raw model text is not shown while it is written: it hasn't been
            // checked against the book yet (see rag.js).
            onToken: () => setStatus('Writing the answer\u2026'),
        });
        setStatus('');
        renderAnswer(reply, result.text, result.citations, state.onCite);
        renderPassages(reply, result.shown, state.onCite, {
            title: result.fallback ? 'Matching passages in the book' : (engine.id === 'local' ? 'From the book' : 'Passages cited'),
            open: result.fallback || engine.id === 'local',
            more: result.more,
        });
        if (result.grounded) {
            state.history.push({ role: 'user', content: question }, { role: 'assistant', content: result.text });
        }
    } catch (err) {
        reply.textContent = err?.name === 'AbortError' ? 'Stopped.' : (err?.message || 'Something went wrong.');
        reply.classList.add('ai-msg--error');
        setStatus('');
        // The on-device model couldn't start: offer the one thing that may
        // still work, without downloading anything until the reader agrees.
        if (err?.code === LOCAL_GPU_FAILED && !err.compat && typeof engine.setCompatMode === 'function') {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ai-retry';
            btn.textContent = 'Try compatibility mode';
            btn.addEventListener('click', () => {
                btn.disabled = true;
                engine.setCompatMode(true);
                ask(question, { retry: true });
            });
            reply.append(document.createElement('br'), btn);
        }
    } finally {
        state.busy = false;
        state.abort = null;
        $('ai-send').disabled = false;
        $('ai-messages').scrollTop = $('ai-messages').scrollHeight;
    }
}

function buildDrawer() {
    if ($('ai-drawer')) return;
    const drawer = document.createElement('aside');
    drawer.id = 'ai-drawer';
    drawer.className = 'ai-drawer';
    drawer.hidden = true;
    drawer.setAttribute('aria-label', 'Ask about this book');

    const head = document.createElement('div');
    head.className = 'ai-head';
    const title = document.createElement('strong');
    title.textContent = 'Ask the book';
    const expand = document.createElement('button');
    expand.type = 'button';
    expand.className = 'ai-expand';
    expand.textContent = '\u2922';
    expand.title = 'Wider / narrower';
    expand.setAttribute('aria-label', 'Make the panel wider or narrower');
    expand.addEventListener('click', () => setPanelWidth(currentPanelWidth() < 700 ? WIDE_PANEL : AI_PANEL_WIDTH_DEFAULT));
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ai-close';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', closeDrawer);
    head.append(title, expand, close);

    const messages = document.createElement('div');
    messages.id = 'ai-messages';
    messages.className = 'ai-messages';
    messages.setAttribute('aria-live', 'polite');

    const status = document.createElement('div');
    status.id = 'ai-status';
    status.className = 'ai-status';

    const form = document.createElement('div');
    form.className = 'ai-form';
    const input = document.createElement('textarea');
    input.id = 'ai-input';
    input.rows = 2;
    input.placeholder = 'Ask a question… / ಪ್ರಶ್ನೆ ಕೇಳಿ…';
    const send = document.createElement('button');
    send.type = 'button';
    send.id = 'ai-send';
    send.textContent = 'Ask';
    const submit = () => {
        const q = input.value.trim();
        if (!q) return;
        input.value = '';
        ask(q);
    };
    send.addEventListener('click', submit);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    });
    form.append(input, send);

    const note = document.createElement('div');
    note.className = 'ai-disclaimer';
    note.textContent = 'Answers use only this book\u2019s text and can still be wrong. Check the cited passages, and ask a guru or scholar for guidance.';

    drawer.append(buildResizeHandle(), head, messages, status, form, note);
    document.body.appendChild(drawer);

    const back = document.createElement('button');
    back.type = 'button';
    back.id = 'ai-back';
    back.className = 'ai-back';
    back.hidden = true;
    back.textContent = '\u{1F4AC} Back to answer';
    back.addEventListener('click', openDrawer);
    document.body.appendChild(back);
    setPanelWidth(loadSettings().aiPanelWidth, { save: false });
}

/**
 * @param {{data: Array, onCite: (blockId: string) => void}} args
 */
export function initAi({ data, onCite }) {
    state.data = data;
    state.onCite = onCite;
    buildDrawer();

    $('ai-engine-select')?.addEventListener('change', e => {
        saveSettings({ aiEngine: e.target.value });
        state.history = [];
        applyAiSetting();
    });
    $('ai-btn')?.addEventListener('click', () => ($('ai-drawer').hidden ? openDrawer() : closeDrawer()));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
    applyAiSetting();
}
