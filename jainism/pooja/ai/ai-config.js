// ai/ai-config.js — The "Configure" dialog for the assistant: which size of
// on-device model to use, and the reader's own AI service (provider, address,
// model, API key). One dialog, opened from the Settings menu and from Home.
//
// Everything is built with DOM nodes and textContent — nothing the reader types
// is ever parsed as HTML. The API key goes to engines/custom.js's key store (its
// own storage, session-only unless the reader opts in), never to the settings object.

import { loadSettings, saveSettings, AI_LOCAL_TIERS } from '../core/settings.js';
import { LOCAL_TIERS } from './config.js';
import { PROVIDER_INFO, normalizeBaseUrl, createKeyStore } from './engines/custom.js';

const $ = id => document.getElementById(id);

function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
        if (k === 'className') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k in node) node[k] = v;
        else node.setAttribute(k, v);
    });
    children.forEach(c => node.append(c));
    return node;
}

function field(label, control, hint) {
    const wrap = el('label', { className: 'ai-config-field' }, el('span', { className: 'ai-config-label', text: label }), control);
    if (hint) wrap.append(el('span', { className: 'ai-config-hint', text: hint }));
    return wrap;
}

let keyStore = null;
let onSavedCb = null;
let lastFocus = null;

function build() {
    if ($('ai-config')) return;
    keyStore = createKeyStore();

    // ── On-device model size ─────────────────────────────────────────────
    const tiers = el('fieldset', { className: 'ai-config-section' }, el('legend', { text: 'On-device model (Local)' }));
    tiers.append(el('p', { className: 'ai-config-hint', text: 'Runs entirely on this device; nothing is sent anywhere. Bigger models usually write better summaries, but take longer to download and need more graphics memory. Only the models listed here are offered.' }));
    AI_LOCAL_TIERS.forEach(id => {
        const t = LOCAL_TIERS[id];
        const radio = el('input', { type: 'radio', name: 'ai-local-tier', value: id, id: `ai-tier-${id}` });
        tiers.append(el('label', { className: 'ai-config-tier', htmlFor: `ai-tier-${id}` },
            radio,
            el('span', {},
                el('strong', { text: t.label }),
                el('span', { className: 'ai-config-hint', text: ` \u2014 download ${t.size}, needs ${t.gpu} of graphics memory` }))));
    });

    // ── Custom service ───────────────────────────────────────────────────
    const provider = el('select', { id: 'ai-config-provider' });
    Object.entries(PROVIDER_INFO).forEach(([id, info]) => provider.append(el('option', { value: id, text: info.label })));
    const base = el('input', { type: 'url', id: 'ai-config-base', autocomplete: 'off', spellcheck: false });
    const model = el('input', { type: 'text', id: 'ai-config-model', autocomplete: 'off', spellcheck: false });
    const key = el('input', { type: 'password', id: 'ai-config-key', autocomplete: 'off', spellcheck: false });
    const remember = el('input', { type: 'checkbox', id: 'ai-config-remember' });
    const forget = el('button', { type: 'button', id: 'ai-config-forget', text: 'Forget my key' });

    const custom = el('fieldset', { className: 'ai-config-section' },
        el('legend', { text: 'Your own AI service (Custom)' }),
        el('p', { className: 'ai-config-hint', text: 'Use your own account with a service you trust. Your questions go straight from this browser to that service, not through this site.' }),
        field('Service', provider),
        el('div', { id: 'ai-config-base-row' }, field('Address', base, 'Use https://\u2026, or http://localhost\u2026 for a server on this computer. The service must allow requests from a web page.')),
        field('Model', model),
        field('API key', key),
        el('label', { className: 'ai-config-check' }, remember, el('span', { text: ' Remember the key on this device (otherwise it is forgotten when this tab closes)' })),
        forget,
        el('p', { className: 'ai-config-warn', text: 'The key stays in this browser and is sent only to the address above. Anyone who can use this browser profile could read it, so don\u2019t use this on a shared computer, and prefer a key with a spending limit. The book passages found for your question are sent too, under that service\u2019s terms.' }));

    const error = el('p', { id: 'ai-config-error', className: 'ai-config-error', role: 'alert', hidden: true });
    const save = el('button', { type: 'button', id: 'ai-config-save', className: 'ai-config-primary', text: 'Save' });
    const cancel = el('button', { type: 'button', id: 'ai-config-cancel', text: 'Cancel' });

    const dialog = el('div', { className: 'ai-config', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ai-config-title' },
        el('h2', { id: 'ai-config-title', text: 'AI assistant settings' }),
        tiers, custom, error,
        el('div', { className: 'ai-config-actions' }, cancel, save));
    const overlay = el('div', { id: 'ai-config', className: 'ai-config-overlay', hidden: true }, dialog);
    document.body.appendChild(overlay);

    const syncProvider = () => {
        const info = PROVIDER_INFO[provider.value];
        $('ai-config-base-row').hidden = !info.needsBaseUrl;
        base.placeholder = info.baseUrlExample || '';
        model.placeholder = info.defaultModel || 'Model name from your service';
    };
    provider.addEventListener('change', syncProvider);

    forget.addEventListener('click', () => {
        keyStore.clear();
        key.value = '';
        key.placeholder = '';
        remember.checked = false;
        forget.hidden = true;
        if (onSavedCb) onSavedCb();
    });

    cancel.addEventListener('click', closeAiConfig);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeAiConfig(); });
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeAiConfig(); } });

    save.addEventListener('click', () => {
        const info = PROVIDER_INFO[provider.value];
        let baseUrl = base.value.trim();
        if (info.needsBaseUrl && baseUrl) {
            const ok = normalizeBaseUrl(baseUrl);
            if (!ok) {
                showError('That address isn\u2019t allowed. Use https://\u2026 (or http://localhost\u2026 for a server on this computer).');
                return;
            }
            baseUrl = ok;
        }
        const chosen = overlay.querySelector('input[name="ai-local-tier"]:checked');
        saveSettings({
            aiLocalModel: chosen ? chosen.value : loadSettings().aiLocalModel,
            aiCustom: { provider: provider.value, baseUrl: info.needsBaseUrl ? baseUrl : '', model: model.value.trim() },
        });
        // Empty box + a key already stored = keep it (the box is never pre-filled with the key).
        keyStore.set(key.value.trim() || keyStore.get(), remember.checked);
        key.value = '';
        closeAiConfig();
        if (onSavedCb) onSavedCb();
    });
}

function showError(text) {
    const e = $('ai-config-error');
    e.textContent = text;
    e.hidden = !text;
}

function populate() {
    const s = loadSettings();
    document.querySelectorAll('input[name="ai-local-tier"]').forEach(r => { r.checked = r.value === s.aiLocalModel; });
    $('ai-config-provider').value = s.aiCustom.provider;
    $('ai-config-provider').dispatchEvent(new Event('change'));
    $('ai-config-base').value = s.aiCustom.baseUrl;
    $('ai-config-model').value = s.aiCustom.model;
    const has = !!keyStore.get();
    $('ai-config-key').value = '';
    $('ai-config-key').placeholder = has ? 'Saved \u2014 leave empty to keep it' : '';
    $('ai-config-remember').checked = keyStore.isRemembered();
    $('ai-config-forget').hidden = !has;
    showError('');
}

/** @param {{onSaved?: () => void}} [opts] onSaved runs after a save or after the key is forgotten */
export function openAiConfig({ onSaved } = {}) {
    build();
    onSavedCb = onSaved || null;
    lastFocus = document.activeElement;
    populate();
    $('ai-config').hidden = false;
    document.querySelector('input[name="ai-local-tier"]:checked')?.focus();
}

export function closeAiConfig() {
    const o = $('ai-config');
    if (o) o.hidden = true;
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    lastFocus = null;
}

export function isAiConfigOpen() {
    const o = $('ai-config');
    return !!o && !o.hidden;
}
