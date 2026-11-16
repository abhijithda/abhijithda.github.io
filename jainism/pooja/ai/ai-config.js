// ai/ai-config.js — The "Configure" dialog for the assistant. Opened from the Settings
// menu and from Home, and it shows only the settings of the engine that is selected:
//  - Cloud : whose hosted service to use — this site's own assistant (free, nothing to
//            set up) or the reader's own AI service (provider, address, model, API key).
//  - Local : where the model comes from — downloaded into this browser (pick a size; it can also be saved to a
//            folder and loaded back, so clearing browser data doesn't mean downloading again) or already on
//            this computer behind a local model server (Ollama, LM Studio).
//
// Everything is built with DOM nodes and textContent — nothing the reader types is ever
// parsed as HTML. The API key goes to engines/custom.js's key store (its own storage,
// session-only unless the reader opts in), never to the settings object.

import { loadSettings, saveSettings, AI_LOCAL_TIERS, AI_LOCAL_SERVER_DEFAULT_URL } from '../core/settings.js';
import { LOCAL_TIERS } from './config.js';
import { PROVIDER_INFO, normalizeBaseUrl, isLocalBaseUrl, createKeyStore } from './engines/custom.js';
import { listServerModels } from './engines/local-server.js';
import {
    saveModelsToFolder, loadModelsFromFolder, folderSource, fileListSource, loadRecordLookup, canSaveToFolder, ModelFolderError,
} from './engines/model-files.js';

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

// Which parts of the dialog this opening shows: only the engine the reader picked has anything to set.
let visible = { local: true, cloud: true };
let keyStore = null;
let onSavedCb = null;
let lastFocus = null;

function build() {
    if ($('ai-config')) return;
    keyStore = createKeyStore();

    // ── Local: where the model comes from ────────────────────────────────
    const srcBrowser = el('input', { type: 'radio', name: 'ai-local-source', value: 'browser', id: 'ai-lsource-browser' });
    const srcServer = el('input', { type: 'radio', name: 'ai-local-source', value: 'server', id: 'ai-lsource-server' });

    const tierList = el('div', { id: 'ai-config-browser', className: 'ai-config-own' });
    tierList.append(el('p', { className: 'ai-config-hint', text: 'Runs entirely on this device; nothing is sent anywhere. Bigger models usually write better summaries, but take longer to download and need more graphics memory. Only the models listed here are offered.' }));
    AI_LOCAL_TIERS.forEach(id => {
        const t = LOCAL_TIERS[id];
        const radio = el('input', { type: 'radio', name: 'ai-local-tier', value: id, id: `ai-tier-${id}` });
        tierList.append(el('label', { className: 'ai-config-tier', htmlFor: `ai-tier-${id}` },
            radio,
            el('span', {},
                el('strong', { text: t.label }),
                el('span', { className: 'ai-config-hint', text: ` \u2014 download ${t.size}, needs ${t.gpu} of graphics memory` }))));
    });
    // The browser keeps the model until its data is cleared; a copy in a folder survives that.
    const saveFolder = el('button', { type: 'button', id: 'ai-config-save-folder', className: 'ai-config-small', text: 'Save downloaded model to a folder\u2026' });
    const loadFolder = el('button', { type: 'button', id: 'ai-config-load-folder', className: 'ai-config-small', text: 'Load a saved model from a folder\u2026' });
    const folderInput = el('input', { type: 'file', id: 'ai-config-folder-input', hidden: true, multiple: true });
    folderInput.setAttribute('webkitdirectory', '');
    const folderStatus = el('p', { id: 'ai-config-folder-status', className: 'ai-config-status', role: 'status' });
    tierList.append(
        el('p', { className: 'ai-config-hint', text: 'The browser keeps the model until its data is cleared. To avoid downloading it again after that, save a copy to a folder and load it back later.' }),
        el('div', { className: 'ai-config-row' }, saveFolder, loadFolder, folderInput),
        folderStatus);

    const serverBase = el('input', { type: 'url', id: 'ai-config-server-base', autocomplete: 'off', spellcheck: false, placeholder: AI_LOCAL_SERVER_DEFAULT_URL });
    const serverModel = el('input', { type: 'text', id: 'ai-config-server-model', autocomplete: 'off', spellcheck: false, placeholder: 'e.g. llama3.2:3b' });
    serverModel.setAttribute('list', 'ai-config-server-models');   // `list` is read-only as a property
    const serverModels = el('datalist', { id: 'ai-config-server-models' });
    const serverCheck = el('button', { type: 'button', id: 'ai-config-server-check', className: 'ai-config-small', text: 'Check connection' });
    const serverStatus = el('p', { id: 'ai-config-server-status', className: 'ai-config-status', role: 'status' });
    const serverForm = el('div', { id: 'ai-config-server', className: 'ai-config-own' },
        el('p', { className: 'ai-config-hint', text: 'Uses a model you already have on this computer, through a local model server such as Ollama (http://localhost:11434/v1) or LM Studio (http://localhost:1234/v1). Nothing is downloaded by this page, and clearing your browser\u2019s data doesn\u2019t remove the model.' }),
        field('Server address', serverBase, 'Must be on this computer (http://localhost\u2026). The server has to allow requests from this page: Ollama needs its OLLAMA_ORIGINS setting to include this site\u2019s address, LM Studio needs \u201cEnable CORS\u201d. Your browser may also ask whether this site can access devices on your computer; choose Allow.'),
        field('Model', serverModel, 'The name as the server lists it. \u201cCheck connection\u201d shows what it has. Choose a model installed on this computer: a server can also offer models it runs online, and those would not stay on this computer.'),
        serverModels,
        el('div', { className: 'ai-config-row' }, serverCheck),
        serverStatus);

    const tiers = el('fieldset', { id: 'ai-config-local', className: 'ai-config-section' }, el('legend', { text: 'On-device model' }),
        el('label', { className: 'ai-config-tier', htmlFor: 'ai-lsource-browser' }, srcBrowser,
            el('span', {}, el('strong', { text: 'In this browser' }), el('span', { className: 'ai-config-hint', text: ' \u2014 downloaded once, then kept by the browser' }))),
        tierList,
        el('label', { className: 'ai-config-tier', htmlFor: 'ai-lsource-server' }, srcServer,
            el('span', {}, el('strong', { text: 'A model already on this computer' }), el('span', { className: 'ai-config-hint', text: ' \u2014 through Ollama, LM Studio or similar' }))),
        serverForm);

    // ── Cloud: this site's assistant, or the reader's own service ────────
    const sourceSite = el('input', { type: 'radio', name: 'ai-cloud-source', value: 'site', id: 'ai-source-site' });
    const sourceOwn = el('input', { type: 'radio', name: 'ai-cloud-source', value: 'own', id: 'ai-source-own' });

    const provider = el('select', { id: 'ai-config-provider' });
    Object.entries(PROVIDER_INFO).forEach(([id, info]) => provider.append(el('option', { value: id, text: info.label })));
    const base = el('input', { type: 'url', id: 'ai-config-base', autocomplete: 'off', spellcheck: false });
    const model = el('input', { type: 'text', id: 'ai-config-model', autocomplete: 'off', spellcheck: false });
    const key = el('input', { type: 'password', id: 'ai-config-key', autocomplete: 'off', spellcheck: false });
    const remember = el('input', { type: 'checkbox', id: 'ai-config-remember' });
    const forget = el('button', { type: 'button', id: 'ai-config-forget', text: 'Forget my key' });

    const ownForm = el('div', { id: 'ai-config-custom', className: 'ai-config-own' },
        el('p', { className: 'ai-config-hint', text: 'Your questions go straight from this browser to that service, not through this site.' }),
        field('Service', provider),
        el('div', { id: 'ai-config-base-row' }, field('Address', base, 'Use https://\u2026, or http://localhost\u2026 for a server on this computer. The service must allow requests from a web page.')),
        field('Model', model),
        field('API key', key),
        el('label', { className: 'ai-config-check' }, remember, el('span', { text: ' Remember the key on this device (otherwise it is forgotten when this tab closes)' })),
        forget,
        el('p', { className: 'ai-config-warn', text: 'The key stays in this browser and is sent only to the address above. Anyone who can use this browser profile could read it, so don\u2019t use this on a shared computer. The book passages found for your question are sent too, under that service\u2019s terms.' }));

    const cloud = el('fieldset', { id: 'ai-config-cloud', className: 'ai-config-section' },
        el('legend', { text: 'Cloud assistant' }),
        el('label', { className: 'ai-config-tier', htmlFor: 'ai-source-site' }, sourceSite,
            el('span', {}, el('strong', { text: 'This site\u2019s assistant' }), el('span', { className: 'ai-config-hint', text: ' \u2014 free, nothing to set up' }))),
        el('label', { className: 'ai-config-tier', htmlFor: 'ai-source-own' }, sourceOwn,
            el('span', {}, el('strong', { text: 'My own AI service' }), el('span', { className: 'ai-config-hint', text: ' \u2014 your account and API key' }))),
        ownForm);

    const error = el('p', { id: 'ai-config-error', className: 'ai-config-error', role: 'alert', hidden: true });
    const save = el('button', { type: 'button', id: 'ai-config-save', className: 'ai-config-primary', text: 'Save' });
    const cancel = el('button', { type: 'button', id: 'ai-config-cancel', text: 'Cancel' });

    const dialog = el('div', { className: 'ai-config', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ai-config-title' },
        el('h2', { id: 'ai-config-title', text: 'AI assistant settings' }),
        cloud, tiers, error,
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

    // The service form only matters when "my own service" is the chosen source.
    const syncSource = () => { ownForm.hidden = !sourceOwn.checked; };
    sourceSite.addEventListener('change', syncSource);
    sourceOwn.addEventListener('change', syncSource);

    // Only the chosen local source's form is shown.
    const syncLocalSource = () => { tierList.hidden = !srcBrowser.checked; serverForm.hidden = !srcServer.checked; };
    srcBrowser.addEventListener('change', syncLocalSource);
    srcServer.addEventListener('change', syncLocalSource);

    // ── Local server: what does it have? ─────────────────────────────────
    let checking = null;
    serverCheck.addEventListener('click', async () => {
        checking?.abort();
        checking = new AbortController();
        serverStatus.textContent = 'Checking\u2026';
        const result = await listServerModels(serverBase.value, { signal: checking.signal }).catch(() => null);
        if (!result) return;   // a newer check replaced this one
        if (!result.ok) { serverStatus.textContent = result.reason; return; }
        serverModels.replaceChildren(...result.models.map(m => el('option', { value: m })));
        const wanted = serverModel.value.trim();
        serverStatus.textContent = !result.models.length
            ? 'Connected, but the server lists no models. Install one first (Ollama: ollama pull <name>).'
            : wanted && !result.models.includes(wanted)
                ? `Connected. The server doesn\u2019t list \u201c${wanted}\u201d. It has: ${result.models.slice(0, 8).join(', ')}.`
                : `Connected. Models on the server: ${result.models.slice(0, 8).join(', ')}${result.models.length > 8 ? ', \u2026' : ''}. Click the Model box to choose.`;
    });

    // ── Local browser model: save to / load from a folder ────────────────
    const setFolderBusy = busy => { saveFolder.disabled = busy; loadFolder.disabled = busy; };
    const showFolderError = err => {
        if (err?.name === 'AbortError') { folderStatus.textContent = ''; return; }   // the reader cancelled the folder picker
        folderStatus.textContent = err instanceof ModelFolderError ? err.message : `That didn\u2019t work: ${err?.message || err}`;
    };
    const mb = bytes => `${Math.round(bytes / (1024 * 1024))} MB`;

    saveFolder.addEventListener('click', async () => {
        if (!canSaveToFolder()) {
            folderStatus.textContent = 'Saving to a folder needs Chrome or Edge on a computer. (Loading a saved folder also works in other browsers.)';
            return;
        }
        setFolderBusy(true);
        try {
            const dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'pooja-model' });
            folderStatus.textContent = 'Preparing\u2026';
            const lookup = await loadRecordLookup();
            const models = Object.values(LOCAL_TIERS).flatMap(t => [t.model, t.compat])
                .map(modelId => ({ modelId, record: lookup(modelId) })).filter(m => m.record);
            const result = await saveModelsToFolder({ models, dir, caches: window.caches, onProgress: p => { folderStatus.textContent = p.text; } });
            folderStatus.textContent = result.saved.length
                ? `Saved ${result.saved.length === 1 ? 'one model' : result.saved.length + ' models'} (${mb(result.bytes)}) to that folder. Keep the folder; \u201cLoad a saved model\u201d puts it back without downloading.`
                : 'Nothing to save yet: no model is fully downloaded in this browser. Ask a question with Local first (it downloads once), then save it.';
        } catch (err) { showFolderError(err); } finally { setFolderBusy(false); }
    });

    const loadFrom = async source => {
        folderStatus.textContent = 'Checking the folder\u2026';
        const lookup = await loadRecordLookup();
        const result = await loadModelsFromFolder({ source, recordFor: lookup, caches: window.caches, onProgress: p => { folderStatus.textContent = p.text; } });
        folderStatus.textContent = `Loaded ${result.restored.length === 1 ? 'one model' : result.restored.length + ' models'} (${mb(result.bytes)}) into this browser. Local will start from it without downloading.`
            + (result.warnings.length ? ' ' + result.warnings.join(' ') : '');
    };
    loadFolder.addEventListener('click', async () => {
        setFolderBusy(true);
        try {
            if (canSaveToFolder()) await loadFrom(folderSource(await window.showDirectoryPicker({ id: 'pooja-model' })));
            else folderInput.click();          // other browsers: pick the folder with a file input
        } catch (err) { showFolderError(err); } finally { setFolderBusy(false); }
    });
    folderInput.addEventListener('change', async () => {
        setFolderBusy(true);
        try { await loadFrom(fileListSource(folderInput.files)); } catch (err) { showFolderError(err); } finally { folderInput.value = ''; setFolderBusy(false); }
    });

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
        const partial = {};
        if (visible.cloud) {
            const source = sourceOwn.checked ? 'own' : 'site';
            partial.aiCloudSource = source;
            // The service form is only read when it is the chosen source; otherwise what was saved before is left alone.
            if (source === 'own') {
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
                partial.aiCustom = { provider: provider.value, baseUrl: info.needsBaseUrl ? baseUrl : '', model: model.value.trim() };
            }
        }
        if (visible.local) {
            const chosen = overlay.querySelector('input[name="ai-local-tier"]:checked');
            partial.aiLocalModel = chosen ? chosen.value : loadSettings().aiLocalModel;
            partial.aiLocalSource = srcServer.checked ? 'server' : 'browser';
            // The server form is only read when it is the chosen source; otherwise what was saved before is left alone.
            if (srcServer.checked) {
                const url = normalizeBaseUrl(serverBase.value) || '';
                if (!url || !isLocalBaseUrl(url)) {
                    showError('The server address must be on this computer, for example http://localhost:11434/v1.');
                    return;
                }
                partial.aiLocalServer = { baseUrl: url, model: serverModel.value.trim() };
            }
        }
        saveSettings(partial);
        if (visible.cloud && partial.aiCloudSource === 'own') {
            // Empty box + a key already stored = keep it (the box is never pre-filled with the key).
            keyStore.set(key.value.trim() || keyStore.get(), remember.checked);
            key.value = '';
        }
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
    $('ai-lsource-browser').checked = s.aiLocalSource !== 'server';
    $('ai-lsource-server').checked = s.aiLocalSource === 'server';
    $('ai-lsource-server').dispatchEvent(new Event('change'));
    $('ai-config-server-base').value = s.aiLocalServer.baseUrl;
    $('ai-config-server-model').value = s.aiLocalServer.model;
    $('ai-config-server-status').textContent = '';
    $('ai-config-folder-status').textContent = '';
    $('ai-config-save-folder').hidden = !canSaveToFolder();
    $('ai-source-site').checked = s.aiCloudSource !== 'own';
    $('ai-source-own').checked = s.aiCloudSource === 'own';
    $('ai-source-own').dispatchEvent(new Event('change'));
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

/**
 * @param {{section?: 'local'|'cloud', onSaved?: () => void}} [opts]
 *   section: show only that engine's settings (anything else shows both).
 *   onSaved runs after a save or after the key is forgotten.
 */
export function openAiConfig({ section, onSaved } = {}) {
    build();
    onSavedCb = onSaved || null;
    visible = { local: section !== 'cloud', cloud: section !== 'local' };
    lastFocus = document.activeElement;
    populate();
    $('ai-config-local').hidden = !visible.local;
    $('ai-config-cloud').hidden = !visible.cloud;
    $('ai-config-title').textContent = section === 'local' ? 'On-device model'
        : section === 'cloud' ? 'Cloud assistant'
        : 'AI assistant settings';
    $('ai-config').hidden = false;
    (visible.cloud ? document.querySelector('input[name="ai-cloud-source"]:checked') : document.querySelector('input[name="ai-local-tier"]:checked'))?.focus();
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
