const {
    offlineSupported, shouldRegisterServiceWorker, describeStatus, formatSize,
    initOffline, removeOfflineCopy, STATUS_ELEMENT_ID, TOGGLE_ID, MAX_AUTO_RETRIES,
} = require('./offline');

const https = { protocol: 'https:', search: '' };

describe('offlineSupported', () => {
    test('needs a browser with service workers and an http(s) page', () => {
        expect(offlineSupported({ serviceWorker: {} }, https)).toBe(true);
        expect(offlineSupported({}, https)).toBe(false);
        expect(offlineSupported(undefined, https)).toBe(false);
        expect(offlineSupported({ serviceWorker: {} }, { protocol: 'file:' })).toBe(false);
    });
});

describe('shouldRegisterServiceWorker', () => {
    test('registers in a normal browser on http(s)', () => {
        expect(shouldRegisterServiceWorker({ serviceWorker: {} }, https)).toBe(true);
    });

    test('does nothing without support or on file:// pages', () => {
        expect(shouldRegisterServiceWorker({}, https)).toBe(false);
        expect(shouldRegisterServiceWorker({ serviceWorker: {} }, { protocol: 'file:', search: '' })).toBe(false);
    });

    test('stays off under automation unless the page opts in with ?sw=on', () => {
        const nav = { serviceWorker: {}, webdriver: true };
        expect(shouldRegisterServiceWorker(nav, https)).toBe(false);
        expect(shouldRegisterServiceWorker(nav, { protocol: 'https:', search: '?sw=on' })).toBe(true);
        expect(shouldRegisterServiceWorker(nav, { protocol: 'https:', search: '?x=1&sw=on' })).toBe(true);
        expect(shouldRegisterServiceWorker(nav, { protocol: 'https:', search: '?sw=only' })).toBe(false);
    });
});

describe('formatSize', () => {
    test('shows megabytes, and "under 1 MB" for small amounts', () => {
        expect(formatSize(2.4 * 1024 * 1024)).toBe('2.4 MB');
        expect(formatSize(300 * 1024)).toBe('under 1 MB');
        expect(formatSize(0)).toBe('');
        expect(formatSize(undefined)).toBe('');
    });
});

describe('describeStatus', () => {
    test('shows nothing until the worker has reported (and we are online)', () => {
        expect(describeStatus(null, true)).toBeNull();
    });

    test('ready, with the amount of storage used when known', () => {
        const d = describeStatus({ state: 'ready', done: 7, total: 7 }, true, 2.4 * 1024 * 1024);
        expect(d.state).toBe('ready');
        expect(d.text).toContain('Ready to use offline');
        expect(d.text).toContain('about 2.4 MB');
        expect(describeStatus({ state: 'ready', done: 7, total: 7 }, true).text).not.toContain('about');
    });

    test('preparing shows progress, or just the message before the total is known', () => {
        expect(describeStatus({ state: 'preparing', done: 3, total: 11 }, true).text).toContain('3/11');
        expect(describeStatus({ state: 'preparing', done: 0, total: 0 }, true).text).not.toContain('/');
    });

    test('incomplete says how many pictures are missing, singular and plural', () => {
        expect(describeStatus({ state: 'incomplete', done: 6, total: 7 }, true).text).toContain('1 picture not saved');
        expect(describeStatus({ state: 'incomplete', done: 4, total: 7 }, true).text).toContain('3 pictures not saved');
    });

    test('incomplete because the app files are missing says so, not "0 pictures"', () => {
        const d = describeStatus({ state: 'incomplete', done: 7, total: 7, reason: 'app' }, true);
        expect(d.text).toContain('the app files weren’t saved');
        expect(d.text).not.toContain('picture');
    });

    test('once automatic retries are used up, tells the reader how to try again', () => {
        const d = describeStatus({ state: 'incomplete', done: 6, total: 7, reason: 'pictures', giveUp: true }, true);
        expect(d.text).toContain('Turn the switch off and on to try again.');
        expect(describeStatus({ state: 'incomplete', done: 6, total: 7, reason: 'pictures' }, true).text)
            .toContain('Keep this page open');
    });

    test('offline with a saved copy says the saved copy is being shown', () => {
        const d = describeStatus({ state: 'ready', done: 7, total: 7 }, false);
        expect(d.state).toBe('offline-ready');
        expect(d.text).toContain('saved on this device');
    });

    test('offline with no report still says so', () => {
        expect(describeStatus(null, false).state).toBe('offline');
    });

    test('"off" and unknown states show nothing', () => {
        expect(describeStatus({ state: 'off' }, true)).toBeNull();
        expect(describeStatus({ state: 'mystery' }, true)).toBeNull();
    });
});

function makeEnv({ webdriver = false, search = '', supported = true, enabled = false, registrations = [] } = {}) {
    // The page and removeOfflineCopy() each listen for worker messages, so keep a list.
    const messageListeners = [];
    const emit = data => messageListeners.slice().forEach(fn => fn({ data }));
    // A worker that, like the real one, answers "uninstall" with an "off" report
    const postMessage = jest.fn(msg => {
        if (msg && msg.type === 'uninstall') {
            Promise.resolve().then(() => emit({ type: 'offline-status', state: 'off', done: 0, total: 0 }));
        }
    });
    const order = [];
    const register = jest.fn(() => { order.push('register'); return Promise.resolve(); });
    const unregister = jest.fn(() => { order.push('unregister'); return Promise.resolve(); });
    const regs = registrations.map(() => ({ active: { postMessage }, unregister }));
    const nav = {
        webdriver,
        onLine: true,
        ...(supported ? {
            serviceWorker: {
                register,
                getRegistrations: () => Promise.resolve(regs),
                addEventListener: (type, fn) => { if (type === 'message') messageListeners.push(fn); },
                removeEventListener: (type, fn) => {
                    const i = messageListeners.indexOf(fn);
                    if (i >= 0) messageListeners.splice(i, 1);
                },
                ready: Promise.resolve({ active: { postMessage } }),
            },
        } : {}),
    };
    const status = { hidden: true, textContent: '', dataset: {} };
    const toggle = { checked: false, disabled: false, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } };
    const homeToggle = { checked: false };
    const doc = {
        readyState: 'complete',
        baseURI: 'https://example.org/jainism/pooja/',
        getElementById: id => ({ [STATUS_ELEMENT_ID]: status, [TOGGLE_ID]: toggle, ['home-' + TOGGLE_ID]: homeToggle })[id] || null,
    };
    const winListeners = {};
    const deleted = [];
    const win = {
        location: { protocol: 'https:', search },
        addEventListener: (type, fn) => { winListeners[type] = fn; },
        caches: { keys: () => Promise.resolve(['pooja-shell-v1', 'pooja-images-v1', 'other']), delete: n => { deleted.push(n); return Promise.resolve(true); } },
    };
    let stored = enabled;
    const saveEnabled = jest.fn(v => { stored = v; });
    return { nav, doc, win, status, toggle, homeToggle, register, unregister, order, postMessage, emit, winListeners, deleted, saveEnabled, getEnabled: () => stored };
}

const flush = () => new Promise(r => setTimeout(r, 0));

describe('initOffline', () => {
    test('with the switch off (the default): downloads nothing, registers nothing, shows nothing', async () => {
        const t = makeEnv({ enabled: false });
        initOffline(t);
        await flush();
        expect(t.register).not.toHaveBeenCalled();
        expect(t.status.hidden).toBe(true);
        expect(t.toggle.checked).toBe(false);
    });

    test('with the switch saved as on: registers sw.js next to the page and tells it to enable (a full repair)', async () => {
        const t = makeEnv({ enabled: true });
        initOffline(t);
        await flush();
        expect(t.toggle.checked).toBe(true);
        expect(t.register).toHaveBeenCalledWith('https://example.org/jainism/pooja/sw.js');
        expect(t.postMessage).toHaveBeenCalledWith({ type: 'enable' });
    });

    test('turning the switch on saves the choice and starts straight away', async () => {
        const t = makeEnv({ enabled: false });
        initOffline(t);
        t.toggle.checked = true;
        t.toggle.listeners.change();
        await flush();
        expect(t.saveEnabled).toHaveBeenCalledWith(true);
        expect(t.register).toHaveBeenCalled();
        expect(t.status.dataset.state).toBe('preparing');
    });

    test('turning the switch off removes the worker and every saved copy, and hides the status', async () => {
        const t = makeEnv({ enabled: true, registrations: [1] });
        initOffline(t);
        await flush();
        t.emit({ type: 'offline-status', state: 'ready', done: 7, total: 7 });
        expect(t.status.hidden).toBe(false);
        t.toggle.checked = false;
        t.toggle.listeners.change();
        await flush(); await flush();
        expect(t.saveEnabled).toHaveBeenCalledWith(false);
        expect(t.postMessage).toHaveBeenCalledWith({ type: 'uninstall' });
        expect(t.unregister).toHaveBeenCalled();
        expect(t.deleted).toEqual(['pooja-shell-v1', 'pooja-images-v1']);   // only this app's caches
        expect(t.status.hidden).toBe(true);
    });

    test('keeps the Home copy of the switch in step with the header one', () => {
        const t = makeEnv({ enabled: false });
        initOffline(t);
        t.toggle.checked = true;
        t.toggle.listeners.change();
        expect(t.homeToggle.checked).toBe(true);
    });

    test('with the switch off, sweeps away a copy left over from an older version', async () => {
        const t = makeEnv({ enabled: false, registrations: [1] });
        initOffline(t);
        await flush(); await flush();
        expect(t.unregister).toHaveBeenCalled();
        expect(t.deleted).toContain('pooja-shell-v1');
    });

    test('does nothing under automation without ?sw=on, even if the switch is on', async () => {
        const t = makeEnv({ enabled: true, webdriver: true });
        initOffline(t);
        await flush();
        expect(t.register).not.toHaveBeenCalled();
    });

    test('in a browser without service workers: switch disabled and a plain explanation shown', () => {
        const t = makeEnv({ supported: false });
        initOffline(t);
        expect(t.toggle.disabled).toBe(true);
        expect(t.status.hidden).toBe(false);
        expect(t.status.dataset.state).toBe('unsupported');
    });

    test('shows the worker\'s status once the switch is on', async () => {
        const t = makeEnv({ enabled: true });
        initOffline(t);
        await flush();
        t.emit({ type: 'offline-status', state: 'ready', done: 7, total: 7 });
        expect(t.status.dataset.state).toBe('ready');
    });

    test('ignores unrelated messages', async () => {
        const t = makeEnv({ enabled: true });
        initOffline(t);
        await flush();
        const before = t.status.dataset.state;
        t.emit({ type: 'something-else' });
        expect(t.status.dataset.state).toBe(before);
    });

    test('asks the worker to retry when pictures are missing and we are online', async () => {
        const t = makeEnv({ enabled: true });
        initOffline(t);
        await flush();
        t.emit({ type: 'offline-status', state: 'incomplete', done: 2, total: 7 });
        await flush();
        expect(t.postMessage).toHaveBeenCalledWith({ type: 'retry' });
    });

    test('gives up after a few automatic retries instead of looping (the flicker bug)', async () => {
        const t = makeEnv({ enabled: true });
        initOffline(t);
        await flush();
        const incomplete = { type: 'offline-status', state: 'incomplete', done: 7, total: 7, reason: 'app' };
        for (let i = 0; i < 6; i++) { t.emit(incomplete); await flush(); }
        const retries = t.postMessage.mock.calls.filter(c => c[0] && c[0].type === 'retry').length;
        expect(retries).toBe(MAX_AUTO_RETRIES);
        expect(t.status.textContent).toContain('Turn the switch off and on to try again.');
    });

    test('a successful report resets the retry allowance', async () => {
        const t = makeEnv({ enabled: true });
        initOffline(t);
        await flush();
        const incomplete = { type: 'offline-status', state: 'incomplete', done: 6, total: 7, reason: 'pictures' };
        t.emit(incomplete); t.emit(incomplete);
        t.emit({ type: 'offline-status', state: 'ready', done: 7, total: 7 });
        await flush();
        t.emit(incomplete); await flush();
        const retries = t.postMessage.mock.calls.filter(c => c[0] && c[0].type === 'retry').length;
        expect(retries).toBe(3);
    });

    test('turning off and straight back on: the clean-up finishes before the new copy starts', async () => {
        const t = makeEnv({ enabled: true, registrations: [1] });
        initOffline(t);
        await flush();
        t.order.length = 0;
        t.toggle.checked = false; t.toggle.listeners.change();      // off ...
        await Promise.resolve();                                    // (the off clean-up has begun)
        t.toggle.checked = true;  t.toggle.listeners.change();      // ... and on again
        await flush(); await flush(); await flush(); await flush();
        expect(t.order[0]).toBe('unregister');
        expect(t.order[t.order.length - 1]).toBe('register');
        expect(t.postMessage).toHaveBeenCalledWith({ type: 'enable' });
        expect(t.getEnabled()).toBe(true);
    });

    test('two flips in the same instant just settle on the final choice', async () => {
        const t = makeEnv({ enabled: true, registrations: [1] });
        initOffline(t);
        await flush();
        t.order.length = 0;
        t.toggle.checked = false; t.toggle.listeners.change();
        t.toggle.checked = true;  t.toggle.listeners.change();
        await flush(); await flush(); await flush();
        expect(t.getEnabled()).toBe(true);
        expect(t.order).toContain('register');
        expect(t.postMessage).toHaveBeenCalledWith({ type: 'enable' });
    });

    test('switches to the offline message when the connection drops', async () => {
        const t = makeEnv({ enabled: true });
        initOffline(t);
        await flush();
        t.emit({ type: 'offline-status', state: 'ready', done: 7, total: 7 });
        t.nav.onLine = false;
        t.winListeners.offline();
        expect(t.status.dataset.state).toBe('offline-ready');
    });

    test('is harmless when the page has no switch or status line', async () => {
        const t = makeEnv({ enabled: true });
        t.doc.getElementById = () => null;
        expect(() => initOffline(t)).not.toThrow();
        await flush();
    });
});

describe('removeOfflineCopy', () => {
    test('deletes only this app\'s caches', async () => {
        const t = makeEnv({ registrations: [] });
        await removeOfflineCopy(t.nav, t.win);
        expect(t.deleted).toEqual(['pooja-shell-v1', 'pooja-images-v1']);
    });
});
