// core/offline.js — Page side of offline use (the worker itself is /sw.js).
//
// Offline use is OPT-IN. Saving the book on a device downloads a few MB, which
// matters on mobile data, so nothing is downloaded until the reader turns on
// Settings → "Offline copy" (the switch in the header menu and on Home). Turning
// it off unregisters the worker and deletes everything it saved.
//
// One line on Home (under the switch) shows what is happening:
//
//   📥 Saving a copy for offline use… 4/11   (just turned on, downloading)
//   ✓ Ready to use offline … (about 2.5 MB)  (everything saved)
//   ⚠️ Offline copy incomplete — …           (some pictures missing; retries when online)
//   📴 You're offline — showing the saved copy
//
// If service workers are missing or blocked the switch is disabled and the app
// behaves exactly as before.

import { loadSettings, saveSettings } from './settings.js';

export const SW_PATH = 'sw.js';
export const STATUS_ELEMENT_ID = 'home-offline-status';
export const TOGGLE_ID = 'toggle-offline';

// Can this browser/page use a service worker at all? (They need https, or
// localhost, and a browser that has them.)
export function offlineSupported(nav, loc) {
    if (!nav || !('serviceWorker' in nav)) return false;
    return !!loc && (loc.protocol === 'https:' || loc.protocol === 'http:');
}

// Should we actually register one right now? Automation (Playwright/Puppeteer,
// which is what the e2e tests and print rendering use) is skipped on purpose:
// a worker would answer requests those tools mock or time on their own. A test
// that wants the worker opens the page with ?sw=on.
export function shouldRegisterServiceWorker(nav, loc) {
    if (!offlineSupported(nav, loc)) return false;
    if (nav.webdriver && !/[?&]sw=on(?:&|$)/.test(loc.search || '')) return false;
    return true;
}

export function formatSize(bytes) {
    if (!(bytes > 0)) return '';
    const mb = bytes / (1024 * 1024);
    return mb < 1 ? 'under 1 MB' : `${mb.toFixed(1)} MB`;
}

// What to tell the reader. `status` is the worker's last report ({state, done,
// total}) or null; `online` is navigator.onLine; `usageBytes` is how much
// storage this site uses (optional, shown once everything is saved).
// Returns null (show nothing) or { state, text }.
export function describeStatus(status, online, usageBytes = 0) {
    const missing = status ? Math.max(0, status.total - status.done) : 0;
    if (!online) {
        if (status && status.state === 'ready') {
            return { state: 'offline-ready', text: '📴 You’re offline — showing the copy saved on this device.' };
        }
        return { state: 'offline', text: '📴 You’re offline.' };
    }
    if (!status) return null;
    switch (status.state) {
        case 'ready': {
            const size = formatSize(usageBytes);
            return {
                state: 'ready',
                text: `✓ Ready to use offline — saved on this device${size ? ` (about ${size})` : ''}.`,
            };
        }
        case 'preparing':
            return {
                state: 'preparing',
                text: status.total
                    ? `📥 Saving a copy for offline use… ${status.done}/${status.total}`
                    : '📥 Saving a copy for offline use…',
            };
        case 'incomplete': {
            const what = status.reason === 'app'
                ? 'the app files weren’t saved'
                : `${missing} picture${missing === 1 ? '' : 's'} not saved yet`;
            const next = status.giveUp
                ? 'Turn the switch off and on to try again.'
                : 'Keep this page open on a good connection.';
            return { state: 'incomplete', text: `⚠️ Offline copy incomplete — ${what}. ${next}` };
        }
        default:
            return null;       // 'off' and anything unknown: show nothing
    }
}

function render(doc, info) {
    const el = doc.getElementById(STATUS_ELEMENT_ID);
    if (!el) return;
    if (!info) {
        el.hidden = true;
        el.textContent = '';
        delete el.dataset.state;
        return;
    }
    el.hidden = false;
    // Only touch the DOM when something changed: the line is a live region, and
    // rewriting identical text can make screen readers announce it again.
    if (el.textContent !== info.text) el.textContent = info.text;
    if (el.dataset.state !== info.state) el.dataset.state = info.state;
}

// Unregister the worker(s) and delete everything saved. The worker is asked to
// do it first (so it stops saving at once), with a short wait for its answer;
// the page then sweeps up whatever is left.
export async function removeOfflineCopy(nav, win) {
    const regs = (await nav.serviceWorker.getRegistrations()) || [];
    await Promise.all(regs.map(async reg => {
        const worker = reg.active || reg.waiting || reg.installing;
        if (worker) {
            await new Promise(resolve => {
                const onMessage = event => {
                    if (event.data && event.data.type === 'offline-status' && event.data.state === 'off') {
                        nav.serviceWorker.removeEventListener('message', onMessage);
                        resolve();
                    }
                };
                nav.serviceWorker.addEventListener('message', onMessage);
                setTimeout(resolve, 1500);
                worker.postMessage({ type: 'uninstall' });
            });
        }
        await reg.unregister();
    }));
    if (win.caches) {
        for (const name of await win.caches.keys()) {
            if (name.startsWith('pooja-')) await win.caches.delete(name);
        }
    }
}

// Automatic "retry" requests per page load when the worker reports the copy is
// incomplete. Retrying forever is what made the status line flicker when a
// retry couldn't fix the problem, so give up after a couple and say so.
export const MAX_AUTO_RETRIES = 2;

export function initOffline({
    nav = navigator,
    win = window,
    doc = document,
    getEnabled = () => loadSettings().offline,
    saveEnabled = value => saveSettings({ offline: value }),
} = {}) {
    const supported = offlineSupported(nav, win.location);
    const toggle = doc.getElementById(TOGGLE_ID);
    let lastStatus = null;
    let usageBytes = 0;
    let enabled = false;
    let started = false;       // the reader has used the switch in this page (vs. page start-up)
    let retries = 0;
    let queue = Promise.resolve();

    const online = () => nav.onLine !== false;
    const redraw = () => {
        if (!supported) {
            render(doc, {
                state: 'unsupported',
                text: 'Offline copy isn’t available in this browser (it needs a secure https connection).',
            });
            return;
        }
        render(doc, enabled ? describeStatus(lastStatus, online(), usageBytes) : null);
    };

    if (toggle) {
        toggle.checked = !!getEnabled();
        if (!supported) toggle.disabled = true;
    }

    const activeWorker = () => nav.serviceWorker.ready.then(reg => reg.active);

    if (nav.serviceWorker) {
        nav.serviceWorker.addEventListener('message', event => {
            const msg = event.data;
            if (!msg || msg.type !== 'offline-status') return;
            if (msg.state === 'ready') retries = 0;
            let giveUp = false;
            if (enabled && msg.state === 'incomplete' && online()) {
                console.warn('Offline copy incomplete:', msg);
                if (retries < MAX_AUTO_RETRIES) {
                    retries += 1;
                    activeWorker().then(worker => worker && worker.postMessage({ type: 'retry' }));
                } else {
                    giveUp = true;
                }
            }
            lastStatus = { ...msg, giveUp };
            if (msg.state === 'ready' && nav.storage && nav.storage.estimate) {
                nav.storage.estimate().then(e => { usageBytes = (e && e.usage) || 0; redraw(); }).catch(() => {});
            }
            redraw();
        });
    }

    win.addEventListener('online', () => {
        redraw();
        if (enabled && nav.serviceWorker) {
            retries = 0;
            activeWorker().then(worker => worker && worker.postMessage({ type: 'get-status' }));
        }
    });
    win.addEventListener('offline', redraw);

    async function doEnable() {
        enabled = true;
        retries = 0;
        if (!shouldRegisterServiceWorker(nav, win.location)) { redraw(); return; }
        lastStatus = { state: 'preparing', done: 0, total: 0 };
        redraw();
        // At page start, wait for the page to finish loading so saving the copy
        // never competes with showing it. When the reader has just flipped the
        // switch, start right away.
        if (!started && doc.readyState !== 'complete') {
            await new Promise(resolve => win.addEventListener('load', resolve, { once: true }));
        }
        try {
            await nav.serviceWorker.register(new URL(SW_PATH, doc.baseURI).href);
            const worker = await activeWorker();
            // "enable" = full repair. The browser may hand back the worker it
            // kept from before the switch was turned off (still switched off, or
            // missing its saved files), so switching on must revive it, not just
            // register.
            if (worker) worker.postMessage({ type: 'enable' });
        } catch (err) {
            console.warn('Offline support unavailable:', err);
        }
    }

    async function doDisable() {
        enabled = false;
        lastStatus = null;
        redraw();
        if (!shouldRegisterServiceWorker(nav, win.location)) return;
        try { await removeOfflineCopy(nav, win); } catch (err) { console.warn('Could not remove the offline copy:', err); }
    }

    // One action at a time, always aiming at the latest choice. Turning the
    // switch off and straight back on must not let the "off" clean-up run while
    // the "on" is saving (it would delete what was just saved).
    function sync() {
        queue = queue
            .then(() => (getEnabled() ? doEnable() : doDisable()))
            .catch(err => console.warn('Offline copy:', err));
        return queue;
    }

    if (toggle) {
        toggle.addEventListener('change', () => {
            started = true;
            // Keep the Home copy of the switch in step when the header one was used
            const homeToggle = doc.getElementById('home-' + TOGGLE_ID);
            if (homeToggle) homeToggle.checked = toggle.checked;
            saveEnabled(toggle.checked);
            sync();
        });
    }

    // Start-up: honour the saved choice. When it is off, also sweep away any
    // copy left over (e.g. from an earlier version) so "off" really means off.
    if (supported) sync();
    else redraw();
}
