// ai/ai-panel.js — The assistant: the Settings engine picker, the header
// "Ask" button, and a slide-over drawer (an overlay, not a side column, so it
// can never change the width the book view paginates against).
//
// Everything the model returns is put on the page with textContent / DOM
// nodes — never innerHTML — so model output can't inject markup.

import { loadSettings, saveSettings } from '../core/settings.js';
import { createIndex } from './retrieval.js';
import { answerQuestion } from './rag.js';
import { getEngine } from './engines/index.js';
import { LOCAL_MODEL_SIZE_HINT } from './config.js';

const PRIVACY = {
    cloud: 'Cloud: your question and the book passages found for it are sent to an AI service to write the answer.',
    local: 'Local: everything stays on this device. The first use downloads a model (' + LOCAL_MODEL_SIZE_HINT + ').',
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
    const select = $('ai-engine-select');
    const note = $('ai-engine-note');
    if (select) select.value = choice;

    let reason = '';
    if (engine) {
        const a = engine.available();
        if (!a.ok) reason = a.reason;
    }
    if (note) note.textContent = reason || PRIVACY[choice] || 'The assistant is off.';
    const usable = !!engine && !reason;
    const btn = $('ai-btn');
    if (btn) btn.hidden = !usable;
    if (!usable) closeDrawer();
}

export function openDrawer() { const d = $('ai-drawer'); if (d) { d.hidden = false; $('ai-input')?.focus(); } }
export function closeDrawer() { const d = $('ai-drawer'); if (d) d.hidden = true; }

async function ask(question) {
    const engine = currentEngine();
    if (!engine || state.busy) return;
    state.busy = true;
    $('ai-send').disabled = true;
    addMessage('user', question);
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
            onToken: text => { reply.textContent = text; },
        });
        renderAnswer(reply, result.text, result.citations, state.onCite);
        if (result.grounded) {
            state.history.push({ role: 'user', content: question }, { role: 'assistant', content: result.text });
        }
    } catch (err) {
        reply.textContent = err?.name === 'AbortError' ? 'Stopped.' : (err?.message || 'Something went wrong.');
        reply.classList.add('ai-msg--error');
        setStatus('');
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
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ai-close';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', closeDrawer);
    head.append(title, close);

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

    drawer.append(head, messages, status, form, note);
    document.body.appendChild(drawer);
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
