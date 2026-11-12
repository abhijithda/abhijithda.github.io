// sw.js — Service worker: lets the book be opened and read with no signal
// (a temple, a train, a bad connection) after one visit on a good connection.
// It is OPT-IN: the page (core/offline.js) only registers it when the reader
// turns on Settings → Offline copy, and removes it again when they turn it off.
//
// How it works
//   • On install it crawls the app itself (index.html → its <script>/<link>
//     tags → every module each script imports → every url() in the CSS) and
//     saves all of it, plus data.json. No file list to maintain: add a new
//     module and it is picked up the next time this worker updates.
//   • After activating it also saves every image data.json uses, one at a
//     time (best effort: a missing image never breaks the rest) and reports
//     progress to the page, which shows it on Home.
//   • Pages, scripts, styles and data.json are NETWORK-FIRST: online readers
//     always get the latest, and the saved copy is used when the network is
//     down or slower than NETWORK_TIMEOUT_MS. (Cache-first would be quicker but
//     can serve a new app.js next to an old module from the previous visit.)
//   • Images are cache-first and quietly re-checked with the server.
//   • Anything outside this folder (YouTube thumbnails, the QR code service) is
//     left alone: it needs the network and is not saved.
//
// Changing this file makes browsers fetch a new worker. Change VERSION to make
// every device throw away its saved copy and download everything again.

'use strict';

const VERSION = 'v1';
const SHELL_CACHE = `pooja-shell-${VERSION}`;
const IMAGE_CACHE = `pooja-images-${VERSION}`;
const NETWORK_TIMEOUT_MS = 3000;
// A page is a chain (index.html → app.js → modules → data.json), so waiting the
// full timeout at every step would multiply it (5 steps × 3s = 15s on a weak
// signal). After one request gives up on the network, the saved copy is used
// straight away for this long; the network is still asked in the background.
const SLOW_NETWORK_WINDOW_MS = 30000;

const SCOPE = new URL(self.registration.scope);
const INDEX_URL = new URL('index.html', SCOPE).href;
const DATA_URL = new URL('data.json', SCOPE).href;

let precacheRunning = false;
let slowUntil = 0;
// Set when the reader turns "Offline copy" off: from then on this worker saves
// nothing and answers nothing (the page unregisters it right after).
let disabled = false;

// ── URL helpers ───────────────────────────────────────────────────────────

const inScope = url => url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname);

// The saved copy ignores ?query and #hash, so /?sw=on and / are one page and a
// cache-busting ?v=2 can't fill the cache with duplicates.
function keyFor(href) {
    const u = new URL(href);
    u.search = '';
    u.hash = '';
    return u.href;
}

const isImage = (req, url) => req.destination === 'image' || url.pathname.includes('/images/');

// ── Crawling the app ──────────────────────────────────────────────────────

const HTML_TAG_RE = /<(?:link|script|img|source)\b[^>]*?\b(?:href|src)\s*=\s*["']([^"']+)["']/gi;
const JS_REFS_RE = [
    /\bfrom\s*['"]([^'"]+)['"]/g,              // import x from '…'  /  export … from '…'
    /\bimport\s*['"]([^'"]+)['"]/g,            // import '…'
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,     // import('…')
];
const CSS_REFS_RE = [
    /@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)/g,
    /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g,
];

function matches(text, regexes) {
    const out = [];
    for (const re of regexes) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text))) out.push(m[1]);
    }
    return out;
}

function referencesIn(text, url) {
    const path = new URL(url).pathname;
    let refs = [];
    if (path.endsWith('.html') || path.endsWith('/')) refs = matches(text, [HTML_TAG_RE]);
    else if (path.endsWith('.js') || path.endsWith('.mjs')) refs = matches(text, JS_REFS_RE);
    else if (path.endsWith('.css')) refs = matches(text, CSS_REFS_RE);
    return refs.filter(r => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(r) || /^https?:/i.test(r));
}

const SCANNED = /\.(?:html|js|mjs|css)$|\/$/;

// Fetch index.html and everything it needs. Returns Map<url, Response>. Throws
// if any of it can't be fetched, so a half-saved app never becomes active.
async function crawlShell() {
    const saved = new Map();
    const queue = [INDEX_URL, DATA_URL];
    while (queue.length) {
        const href = keyFor(queue.shift());
        if (saved.has(href)) continue;
        // 'reload' = bypass the browser's HTTP cache so we save what the server has now
        const res = await fetch(href, { cache: 'reload', credentials: 'same-origin' });
        if (!res.ok) throw new Error(`${href}: HTTP ${res.status}`);
        saved.set(href, res);
        if (SCANNED.test(new URL(href).pathname)) {
            const text = await res.clone().text();
            for (const ref of referencesIn(text, href)) {
                const u = new URL(ref, href);
                if (inScope(u) && !isImageUrl(u)) queue.push(u.href);
            }
        }
    }
    return saved;
}

const isImageUrl = u => /\.(?:png|jpe?g|webp|gif|svg|avif|ico)$/i.test(u.pathname);

async function cacheShell() {
    const saved = await crawlShell();
    const cache = await caches.open(SHELL_CACHE);
    for (const [href, res] of saved) await cache.put(href, res.clone());
    // The folder URL itself (what people open) is the same page as index.html
    await cache.put(keyFor(SCOPE.href), saved.get(INDEX_URL).clone());
}

// ── Images ────────────────────────────────────────────────────────────────

function imageUrlsFromData(text) {
    let data;
    try { data = JSON.parse(text); } catch { return []; }
    const urls = new Set();
    for (const item of Array.isArray(data) ? data : []) {
        for (const block of item.blocks || []) {
            for (const img of block.images || []) {
                if (!img || typeof img.src !== 'string') continue;
                if (img.src.includes('://')) continue;      // remote images are not saved
                urls.add(new URL(`images/${img.src}`, SCOPE).href);
            }
        }
    }
    return [...urls];
}

async function shellPresent() {
    if (!(await caches.has(SHELL_CACHE))) return false;
    const shell = await caches.open(SHELL_CACHE);
    return !!(await shell.match(INDEX_URL)) && !!(await shell.match(DATA_URL));
}

async function savedImageUrls() {
    if (!(await caches.has(SHELL_CACHE))) return [];
    const shell = await caches.open(SHELL_CACHE);
    const res = await shell.match(DATA_URL);
    return res ? imageUrlsFromData(await res.text()) : [];
}

// caches.open() quietly creates a cache that doesn't exist, so check with
// caches.has() first: a report must never "repair" the thing it is reporting on.
async function status() {
    if (disabled) return { type: 'offline-status', state: 'off', done: 0, total: 0 };
    const haveShell = await shellPresent();
    const urls = await savedImageUrls();
    let done = 0;
    if (await caches.has(IMAGE_CACHE)) {
        const images = await caches.open(IMAGE_CACHE);
        for (const u of urls) if (await images.match(u)) done++;
    }
    let state = 'ready';
    if (!haveShell || done < urls.length) state = precacheRunning ? 'preparing' : 'incomplete';
    // reason: what is missing, so the page (and the console) can say so
    const reason = !haveShell ? 'app' : (done < urls.length ? 'pictures' : '');
    return { type: 'offline-status', state, done, total: urls.length, reason };
}

async function broadcast(message) {
    for (const client of await self.clients.matchAll({ includeUncontrolled: true })) {
        client.postMessage(message);
    }
}

async function precacheImages() {
    if (precacheRunning || disabled) return;
    precacheRunning = true;
    try {
        const urls = await savedImageUrls();
        const cache = await caches.open(IMAGE_CACHE);
        await broadcast(await status());
        for (const url of urls) {
            if (disabled) break;
            if (!(await cache.match(url))) {
                try {
                    const res = await fetch(url, { credentials: 'same-origin' });
                    if (res.ok && !disabled) await cache.put(url, res);
                } catch { /* offline or missing: carry on, report as incomplete */ }
            }
            await broadcast(await status());
        }
    } finally {
        precacheRunning = false;
        if (!disabled) await broadcast(await status());
    }
}

// Turning "Offline copy" on again after off, in the same tab, reuses the
// worker the browser kept (it only goes away once the tab is closed or
// reloaded), and that worker may be switched off or have lost its saved files.
// So "enable" and "retry" both do a full repair: switch back on, re-save the
// app files if they're missing, then the pictures.
async function repair() {
    disabled = false;
    if (!(await shellPresent())) {
        try { await cacheShell(); } catch { /* offline: reported as incomplete below */ }
    }
    await precacheImages();
}

// ── Lifecycle ─────────────────────────────────────────────────────────────

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        await cacheShell();
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        // Forget saved copies from older VERSIONs
        for (const name of await caches.keys()) {
            if (name.startsWith('pooja-') && name !== SHELL_CACHE && name !== IMAGE_CACHE) {
                await caches.delete(name);
            }
        }
        await self.clients.claim();
        await precacheImages();
    })());
});

self.addEventListener('message', event => {
    const type = event.data && event.data.type;
    if (type === 'get-status') {
        event.waitUntil(status().then(s => event.source && event.source.postMessage(s)));
    } else if (type === 'enable' || type === 'retry') {
        event.waitUntil(repair());
    } else if (type === 'uninstall') {
        event.waitUntil(removeEverything());
    }
});

// "Offline copy" turned off: stop saving, delete every saved file, and
// unregister. Pages already open keep working over the network.
async function removeEverything() {
    disabled = true;
    for (const name of await caches.keys()) {
        if (name.startsWith('pooja-')) await caches.delete(name);
    }
    await broadcast({ type: 'offline-status', state: 'off', done: 0, total: 0 });
    await self.registration.unregister();
}

// ── Serving requests ──────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (disabled || !inScope(url) || url.pathname.endsWith('/sw.js')) return;
    event.respondWith(isImage(req, url) ? imageResponse(event) : networkFirst(event));
});

// 'no-cache' = ask the server "has this changed?" (a cheap 304 when it hasn't)
// instead of trusting the browser's HTTP cache, so online readers get updates now.
async function fetchFresh(href) {
    const res = await fetch(href, { cache: 'no-cache', credentials: 'same-origin' });
    // A redirected response can't be replayed for a navigation, so don't save it
    if (res.ok && res.type === 'basic' && !res.redirected && !disabled) {
        const cache = await caches.open(SHELL_CACHE);
        await cache.put(keyFor(href), res.clone());
    }
    return res;
}

async function networkFirst(event) {
    const req = event.request;
    const cache = await caches.open(SHELL_CACHE);
    const cached = (await cache.match(keyFor(req.url)))
        || (req.mode === 'navigate' ? await cache.match(INDEX_URL) : undefined);

    const network = fetchFresh(req.url);
    if (!cached) return network;                       // nothing saved yet: just the network

    // Network known to be slow right now: don't wait again, just use the saved copy
    if (Date.now() < slowUntil) {
        event.waitUntil(network.catch(() => {}));
        return cached;
    }

    let timer;
    const TIMED_OUT = Symbol('timed out');
    const timedOut = new Promise(resolve => { timer = setTimeout(() => resolve(TIMED_OUT), NETWORK_TIMEOUT_MS); });
    const winner = await Promise.race([network.catch(() => null), timedOut]);
    clearTimeout(timer);

    if (winner && winner !== TIMED_OUT && (winner.ok || winner.status < 500)) return winner;
    // Offline, too slow, or a server error: use the saved copy, and let the
    // network request finish in the background so the next visit is fresh.
    // Only a real timeout marks the network as slow. Being offline fails
    // instantly and costs nothing, and must not make us ignore the network
    // the moment it comes back.
    if (winner === TIMED_OUT) slowUntil = Date.now() + SLOW_NETWORK_WINDOW_MS;
    event.waitUntil(network.catch(() => {}));
    return cached;
}

async function imageResponse(event) {
    const href = event.request.url;
    const cache = await caches.open(IMAGE_CACHE);
    const key = keyFor(href);
    const cached = await cache.match(key);
    const refresh = fetch(href, { cache: 'no-cache', credentials: 'same-origin' }).then(async res => {
        if (res.ok && res.type === 'basic' && !disabled) await cache.put(key, res.clone());
        return res;
    });
    if (cached) {
        event.waitUntil(refresh.catch(() => {}));
        return cached;
    }
    return refresh;
}
