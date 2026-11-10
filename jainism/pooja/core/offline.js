// core/offline.js — Page side of offline use (the worker itself is /sw.js).
//
// Registers the service worker and keeps one line on Home up to date, so a
// reader can SEE whether this device has a saved copy before they lose signal:
//
//   📥 Saving for offline use… 4/11     (first visit, still downloading)
//   ✓ Ready to use offline              (everything saved)
//   ⚠️ Saved copy incomplete — …        (some images missing; retries when online)
//   📴 You're offline — showing the saved copy
//
// Nothing here is needed for the app to work: if service workers are missing or
// blocked the app behaves exactly as before and the line stays hidden.

export const SW_PATH = 'sw.js';
export const STATUS_ELEMENT_ID = 'home-offline-status';

// Browsers only allow service workers on https (and localhost). Automation
// (Playwright/Puppeteer, which is what the e2e tests and print rendering use)
// is skipped on purpose: a worker would answer requests those tools mock or
// time on their own. A test that wants the worker opens the page with ?sw=on.
export function shouldRegisterServiceWorker(nav, loc) {
    if (!nav || !('serviceWorker' in nav)) return false;
    if (!loc || (loc.protocol !== 'https:' && loc.protocol !== 'http:')) return false;
    if (nav.webdriver && !/[?&]sw=on(?:&|$)/.test(loc.search || '')) return false;
    return true;
}

// What to tell the reader. `status` is the worker's last report ({state, done,
// total}) or null if it hasn't reported; `online` is navigator.onLine.
// Returns null (show nothing) or { state, text }.
export function describeStatus(status, online) {
    const missing = status ? Math.max(0, status.total - status.done) : 0;
    if (!online) {
        if (status && status.state === 'ready') {
            return { state: 'offline-ready', text: '📴 You’re offline — showing the copy saved on this device.' };
        }
        return { state: 'offline', text: '📴 You’re offline.' };
    }
    if (!status) return null;
    switch (status.state) {
        case 'ready':
            return { state: 'ready', text: '✓ Ready to use offline — this device has saved a copy.' };
        case 'preparing':
            return {
                state: 'preparing',
                text: status.total
                    ? `📥 Saving a copy for offline use… ${status.done}/${status.total}`
                    : '📥 Saving a copy for offline use…',
            };
        case 'incomplete':
            return {
                state: 'incomplete',
                text: `⚠️ Offline copy incomplete — ${missing} picture${missing === 1 ? '' : 's'} not saved yet. Keep this page open on a good connection.`,
            };
        default:
            return null;
    }
}

function render(doc, status, online) {
    const el = doc.getElementById(STATUS_ELEMENT_ID);
    if (!el) return;
    const info = describeStatus(status, online);
    if (!info) {
        el.hidden = true;
        el.textContent = '';
        delete el.dataset.state;
        return;
    }
    el.hidden = false;
    el.textContent = info.text;
    el.dataset.state = info.state;
}

export function initOffline({ nav = navigator, win = window, doc = document } = {}) {
    if (!shouldRegisterServiceWorker(nav, win.location)) return;

    let lastStatus = null;
    const online = () => nav.onLine !== false;
    const redraw = () => render(doc, lastStatus, online());

    nav.serviceWorker.addEventListener('message', event => {
        const msg = event.data;
        if (!msg || msg.type !== 'offline-status') return;
        lastStatus = msg;
        redraw();
        // Something didn't download (signal dropped) — try again now that we're here
        if (msg.state === 'incomplete' && online()) {
            nav.serviceWorker.ready.then(reg => reg.active && reg.active.postMessage({ type: 'retry' }));
        }
    });

    win.addEventListener('online', () => {
        redraw();
        nav.serviceWorker.ready.then(reg => reg.active && reg.active.postMessage({ type: 'get-status' }));
    });
    win.addEventListener('offline', redraw);

    // Register after the page has finished loading so saving the copy never
    // competes with showing the page.
    const start = () => {
        nav.serviceWorker.register(new URL(SW_PATH, doc.baseURI).href)
            .then(() => nav.serviceWorker.ready)
            .then(reg => { if (reg.active) reg.active.postMessage({ type: 'get-status' }); })
            .catch(err => console.warn('Offline support unavailable:', err));
    };
    if (doc.readyState === 'complete') start();
    else win.addEventListener('load', start, { once: true });

    redraw();
}
