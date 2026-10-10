#!/usr/bin/env node
// scripts/render-artifacts.js — Renders the site to PDFs/PNGs for review.
// NOT part of the test suite and never commits anything: output goes to
// ./artifacts/ (git-ignored), which the render-artifacts GitHub workflow
// uploads as a downloadable workflow artifact.
//
// Every layout is rendered: both views (continuous, book) x every paper-size
// setting (dynamic, a4, a3), each as a screen PNG and a print PDF — 12 files.
// Note 'dynamic' prints as A4 (see core/paper-size.js), but its on-screen
// sizing differs, so it still gets its own set.
//
// Which data gets rendered is chosen with --data=<real|test> (or the
// DATA_SOURCE env var; default: real):
//   real  -> the site's own ./data.json, exactly as it is deployed
//   test  -> ./test/data.json, the small fixture the e2e tests use
//
// Usage:
//   npm run render:artifacts                      # real data.json
//   npm run render:artifacts -- --data=test       # test/data.json
//   DATA_SOURCE=test npm run render:artifacts     # same, via env (bash)

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'artifacts');
const DATA_FILES = {
    real: path.join(ROOT, 'data.json'),
    test: path.join(ROOT, 'test', 'data.json'),
};

const argData = process.argv.find(a => a.startsWith('--data='));
const dataSource = (argData ? argData.slice('--data='.length) : process.env.DATA_SOURCE || 'real').trim();
if (!DATA_FILES[dataSource]) {
    console.error(`Unknown data source "${dataSource}" — use one of: ${Object.keys(DATA_FILES).join(', ')}`);
    process.exit(1);
}

const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

// Minimal static file server, so this script needs nothing beyond what the
// project already installs (no http-server process to start/stop).
function startServer() {
    const server = http.createServer((req, res) => {
        const urlPath = decodeURIComponent(req.url.split('?')[0]);
        const file = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404).end('Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const VIEWS = [
    { name: 'continuous', ready: page => page.locator('#continuous-container .card').first().waitFor() },
    {
        name: 'book',
        ready: async page => {
            await page.locator('#book-container.active').waitFor();
            await page.locator('#book-columns .book-card').first().waitFor();
        },
    },
];

const PAPER_SIZES = ['dynamic', 'a4', 'a3'];

// Picks a paper size through the real Settings dropdown (not by poking
// localStorage), so applyPaperSize() runs exactly as it does for a user —
// including reading the current view to choose @page orientation.
async function selectPaperSize(page, paperSize) {
    await page.locator('#settings-btn').click();
    await page.locator('#paper-size-select').selectOption(paperSize);
    // Click-outside closes the dropdown so it isn't in the screen PNG.
    await page.evaluate(() => document.body.click());
    await page.waitForTimeout(300);   // let book view re-paginate
}

async function imagesLoaded(page) {
    await page.evaluate(() => Promise.all(
        [...document.images].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; }))
    ));
}

(async () => {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const server = await startServer();
    const base = `http://127.0.0.1:${server.address().port}/`;
    const browser = await chromium.launch();

    try {
        for (const view of VIEWS) {
            for (const paperSize of PAPER_SIZES) {
                // Fresh context per combination: settings persist in
                // localStorage, so reusing one would leak the previous size.
                const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
                const page = await context.newPage();

                // "real" needs no routing — the page fetches ./data.json itself.
                if (dataSource === 'test') {
                    await page.route('**/data.json', route => route.fulfill({ path: DATA_FILES.test }));
                }

                await page.goto(base);
                await page.locator(`.view-toggle-btn[data-view="${view.name}"]`).click();
                await view.ready(page);
                await selectPaperSize(page, paperSize);
                await view.ready(page);
                await imagesLoaded(page);

                const stem = `${view.name}-${paperSize}`;
                await page.screenshot({ path: path.join(OUT_DIR, `${stem}-screen.png`) });
                await page.pdf({
                    path: path.join(OUT_DIR, `${stem}-print.pdf`),
                    preferCSSPageSize: true,   // honour the app's own @page rule (size + orientation)
                    printBackground: false,    // matches Chrome's default print dialog
                });
                console.log(`rendered ${stem} (${dataSource} data)`);
                await context.close();
            }
        }

        fs.writeFileSync(
            path.join(OUT_DIR, 'data-source.txt'),
            `data source: ${dataSource} (${path.relative(ROOT, DATA_FILES[dataSource])})\nrendered at: ${new Date().toISOString()}\n`
        );
    } finally {
        await browser.close();
        server.close();
    }
})().catch(err => {
    console.error(err);
    process.exit(1);
});
