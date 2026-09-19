// home/home.js — Home surface: a nav element separate from the Book/
// Continuous toggle (not a third view). Shows the cover, an overall
// read-progress summary, and the same settings as the header.
//
// Settings here are NOT a second copy: every control below proxies its
// change onto the corresponding header control (setting its value/checked
// state, then dispatching a real 'change' event) so all of header.js's
// existing save/apply logic — including things like the lang picker's
// "at least one language must stay active" rule — runs exactly once,
// in exactly the place it already lives. Home then re-reads that same
// state to redraw itself. The header dropdown stays the source of truth;
// this is just a second, larger-font place to reach the same switches.

import { KNOWN_LANGS } from '../core/langs.js';
import { loadSettings, getActiveLangs } from '../header/header.js';
import { getReadBlocks, isBlockTrackable, computeProgress } from '../core/read-tracking.js';

let coverItem = null;
let allData = [];

function totalBlockCount() {
    return allData.reduce((sum, item) => sum + (item.blocks || []).filter(isBlockTrackable).length, 0);
}

function renderCover() {
    const img = document.getElementById('home-cover-image');
    const title = document.getElementById('home-cover-title');
    if (!img || !title) return;

    if (!coverItem) {
        img.hidden = true;
        title.innerHTML = '';
        return;
    }

    img.hidden = false;
    img.src = coverItem.image.includes('://') ? coverItem.image : `images/${coverItem.image}`;

    const activeLangs = getActiveLangs();
    title.innerHTML = '';
    activeLangs.forEach(lang => {
        const t = coverItem.title?.[lang];
        if (!t) return;
        const line = document.createElement('div');
        line.className = `home-cover-title-line lang-${lang}`;
        line.textContent = t;
        title.appendChild(line);
    });
}

function renderProgress() {
    const el = document.getElementById('home-progress');
    if (!el) return;
    const { read, total, percentage } = computeProgress(getReadBlocks(localStorage), totalBlockCount());
    el.textContent = total > 0 ? `✓ ${read}/${total} read (${percentage}%)` : '';
}

// Proxy a value onto the real header control and fire the header's own
// 'change' handling — see the file header comment for why.
function proxyToHeader(headerId, apply) {
    const el = document.getElementById(headerId);
    if (!el) return;
    apply(el);
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

function renderLangList() {
    const list = document.getElementById('home-lang-list');
    if (!list) return;
    const active = getActiveLangs();
    list.innerHTML = '';

    KNOWN_LANGS.forEach(lang => {
        const row = document.createElement('label');
        row.className = 'home-lang-row';

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = active.includes(lang.code);
        chk.addEventListener('change', () => {
            proxyToHeader(`lang-chk-${lang.code}`, (headerChk) => { headerChk.checked = chk.checked; });
            refreshFromSettings(); // re-sync in case the header enforced "at least one"
        });

        const labelText = document.createElement('span');
        labelText.textContent = `${lang.label} (${lang.name})`;

        row.appendChild(chk);
        row.appendChild(labelText);
        list.appendChild(row);
    });
}

function renderSettingsMirror() {
    const saved = loadSettings();

    const videos = document.getElementById('home-toggle-videos');
    const qrs = document.getElementById('home-toggle-qrs');
    const readTracking = document.getElementById('home-toggle-read-tracking');
    const paperSize = document.getElementById('home-paper-size-select');
    const fontDisplay = document.getElementById('home-font-scale-display');

    if (videos) videos.checked = saved.videos;
    if (qrs) qrs.checked = saved.qrs;
    if (readTracking) readTracking.checked = saved.readTracking;
    if (paperSize) paperSize.value = saved.paperSize;
    if (fontDisplay) fontDisplay.textContent = `${Math.round(saved.fontScale * 100)}%`;

    renderLangList();
}

function refreshFromSettings() {
    renderCover();
    renderProgress();
    renderSettingsMirror();
}

export function initHomeControls(data) {
    allData = data || [];
    coverItem = allData.find(item => item.type === 'cover') || null;

    const homeBtn = document.getElementById('home-btn');
    const overlay = document.getElementById('home-overlay');
    const closeBtn = document.getElementById('home-close-btn');
    if (!homeBtn || !overlay) return;

    homeBtn.addEventListener('click', () => {
        overlay.hidden = false;
        refreshFromSettings();
    });
    if (closeBtn) closeBtn.addEventListener('click', () => { overlay.hidden = true; });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.hidden = true; });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.hidden) overlay.hidden = true;
    });

    // Videos / QRs / read tracking — proxy straight onto the header's own
    // checkboxes, which already have their own save+apply listeners wired
    // (see header.js's initHeaderControls / app.js's media-toggle wiring).
    document.getElementById('home-toggle-videos')?.addEventListener('change', (e) => {
        proxyToHeader('toggle-videos', (headerChk) => { headerChk.checked = e.target.checked; });
    });
    document.getElementById('home-toggle-qrs')?.addEventListener('change', (e) => {
        proxyToHeader('toggle-qrs', (headerChk) => { headerChk.checked = e.target.checked; });
    });
    document.getElementById('home-toggle-read-tracking')?.addEventListener('change', (e) => {
        proxyToHeader('toggle-read-tracking', (headerChk) => { headerChk.checked = e.target.checked; });
    });
    document.getElementById('home-paper-size-select')?.addEventListener('change', (e) => {
        proxyToHeader('paper-size-select', (headerSelect) => { headerSelect.value = e.target.value; });
    });
    document.getElementById('home-font-scale-increase')?.addEventListener('click', () => {
        document.getElementById('font-scale-increase')?.click();
        renderSettingsMirror();
    });
    document.getElementById('home-font-scale-decrease')?.addEventListener('click', () => {
        document.getElementById('font-scale-decrease')?.click();
        renderSettingsMirror();
    });
}

// CommonJS shim for Jest
if (typeof module !== 'undefined' && module.exports) {
    Object.assign(module.exports, { initHomeControls });
}
