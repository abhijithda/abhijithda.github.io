const { shouldRegisterServiceWorker, describeStatus, initOffline, STATUS_ELEMENT_ID } = require('./offline');

const https = { protocol: 'https:', search: '' };

describe('shouldRegisterServiceWorker', () => {
    test('registers in a normal browser on http(s)', () => {
        expect(shouldRegisterServiceWorker({ serviceWorker: {} }, https)).toBe(true);
        expect(shouldRegisterServiceWorker({ serviceWorker: {} }, { protocol: 'http:', search: '' })).toBe(true);
    });

    test('does nothing when the browser has no service worker support', () => {
        expect(shouldRegisterServiceWorker({}, https)).toBe(false);
        expect(shouldRegisterServiceWorker(undefined, https)).toBe(false);
    });

    test('does nothing for file:// pages', () => {
        expect(shouldRegisterServiceWorker({ serviceWorker: {} }, { protocol: 'file:', search: '' })).toBe(false);
    });

    test('stays off under automation (Playwright / Puppeteer) unless the page opts in with ?sw=on', () => {
        const nav = { serviceWorker: {}, webdriver: true };
        expect(shouldRegisterServiceWorker(nav, https)).toBe(false);
        expect(shouldRegisterServiceWorker(nav, { protocol: 'https:', search: '?sw=on' })).toBe(true);
        expect(shouldRegisterServiceWorker(nav, { protocol: 'https:', search: '?x=1&sw=on' })).toBe(true);
        expect(shouldRegisterServiceWorker(nav, { protocol: 'https:', search: '?sw=only' })).toBe(false);
    });
});

describe('describeStatus', () => {
    test('shows nothing until the worker has reported (and we are online)', () => {
        expect(describeStatus(null, true)).toBeNull();
    });

    test('ready', () => {
        const d = describeStatus({ state: 'ready', done: 7, total: 7 }, true);
        expect(d.state).toBe('ready');
        expect(d.text).toContain('Ready to use offline');
    });

    test('preparing shows progress, or just the message before the total is known', () => {
        expect(describeStatus({ state: 'preparing', done: 3, total: 11 }, true).text).toContain('3/11');
        expect(describeStatus({ state: 'preparing', done: 0, total: 0 }, true).text).not.toContain('/');
    });

    test('incomplete says how many pictures are missing, singular and plural', () => {
        expect(describeStatus({ state: 'incomplete', done: 6, total: 7 }, true).text).toContain('1 picture not saved');
        expect(describeStatus({ state: 'incomplete', done: 4, total: 7 }, true).text).toContain('3 pictures not saved');
    });

    test('offline with a saved copy says the saved copy is being shown', () => {
        const d = describeStatus({ state: 'ready', done: 7, total: 7 }, false);
        expect(d.state).toBe('offline-ready');
        expect(d.text).toContain('saved on this device');
    });

    test('offline with no report still says so', () => {
        expect(describeStatus(null, false).state).toBe('offline');
    });

    test('an unknown state shows nothing', () => {
        expect(describeStatus({ state: 'mystery' }, true)).toBeNull();
    });
});

describe('initOffline', () => {
    function setup({ webdriver = false, search = '' } = {}) {
        const postMessage = jest.fn();
        const listeners = {};
        const register = jest.fn(() => Promise.resolve());
        const nav = {
            webdriver,
            onLine: true,
            serviceWorker: {
                register,
                addEventListener: (type, fn) => { listeners[type] = fn; },
                ready: Promise.resolve({ active: { postMessage } }),
            },
        };
        const el = { hidden: true, textContent: '', dataset: {} };
        const doc = {
            readyState: 'complete',
            baseURI: 'https://example.org/jainism/pooja/',
            getElementById: id => (id === STATUS_ELEMENT_ID ? el : null),
        };
        const winListeners = {};
        const win = {
            location: { protocol: 'https:', search },
            addEventListener: (type, fn) => { winListeners[type] = fn; },
        };
        return { nav, doc, win, el, register, postMessage, listeners, winListeners };
    }

    const flush = () => new Promise(r => setTimeout(r, 0));

    test('registers sw.js next to the page and asks it for its status', async () => {
        const t = setup();
        initOffline(t);
        await flush();
        expect(t.register).toHaveBeenCalledWith('https://example.org/jainism/pooja/sw.js');
        expect(t.postMessage).toHaveBeenCalledWith({ type: 'get-status' });
    });

    test('does not register under automation without ?sw=on', async () => {
        const t = setup({ webdriver: true });
        initOffline(t);
        await flush();
        expect(t.register).not.toHaveBeenCalled();
    });

    test('shows the worker\'s status on Home', () => {
        const t = setup();
        initOffline(t);
        t.listeners.message({ data: { type: 'offline-status', state: 'ready', done: 7, total: 7 } });
        expect(t.el.hidden).toBe(false);
        expect(t.el.dataset.state).toBe('ready');
        expect(t.el.textContent).toContain('Ready to use offline');
    });

    test('ignores unrelated messages', () => {
        const t = setup();
        initOffline(t);
        t.listeners.message({ data: { type: 'something-else' } });
        expect(t.el.hidden).toBe(true);
    });

    test('asks the worker to retry when pictures are missing and we are online', async () => {
        const t = setup();
        initOffline(t);
        t.listeners.message({ data: { type: 'offline-status', state: 'incomplete', done: 2, total: 7 } });
        await flush();
        expect(t.postMessage).toHaveBeenCalledWith({ type: 'retry' });
    });

    test('switches to the offline message when the connection drops', () => {
        const t = setup();
        initOffline(t);
        t.listeners.message({ data: { type: 'offline-status', state: 'ready', done: 7, total: 7 } });
        t.nav.onLine = false;
        t.winListeners.offline();
        expect(t.el.dataset.state).toBe('offline-ready');
    });

    test('is harmless when the page has no status element', () => {
        const t = setup();
        t.doc.getElementById = () => null;
        expect(() => {
            initOffline(t);
            t.listeners.message({ data: { type: 'offline-status', state: 'ready', done: 1, total: 1 } });
        }).not.toThrow();
    });
});
