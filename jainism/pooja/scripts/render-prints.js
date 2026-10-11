#!/usr/bin/env node
// scripts/render-prints.js — Renders the site's print layouts to PDFs.
//
// Writes ./prints/ (git-ignored). The "Publish Pooja Prints" GitHub workflow
// runs this against the repo's real data.json, uploads the result as a
// downloadable artifact and, if asked, attaches it to a GitHub Release. Nothing
// is ever committed. (Test fixtures are never rendered or published.)
//
// Both views (continuous, book) are rendered at each paper size, one PDF each:
//   Jaina-Pooja-Vichara-Sankalana-<View>-<Size>-<YYYY-MM-DD>.pdf
// By default the sizes are dynamic, a4 and a3. 'dynamic' prints as A4 and is
// meant to be identical to it; it stays in the set for now so that can be
// confirmed over a few updates, after which it can be dropped (--sizes=a4,a3).
//
// Each page has a small footer (no URL): the date on the left and, for
// continuous view, "Page X of Y" on the right. Book view shows the date only —
// Chrome would number printed *sheets* (two book pages each), which would
// mislabel the pages; real folios belong in the app itself.
//
// Usage:
//   npm run render:prints                      # all sizes
//   npm run render:prints -- --sizes=a3        # just one paper size

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'prints');
const TITLE = 'Jaina Pooja Vichara Sankalana';

const ALL_SIZES = ['dynamic', 'a4', 'a3'];
const argSizes = process.argv.find(a => a.startsWith('--sizes='));
const PAPER_SIZES = (argSizes ? argSizes.slice('--sizes='.length) : 'dynamic,a4,a3')
    .split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const badSize = PAPER_SIZES.find(x => !ALL_SIZES.includes(x));
if (badSize) {
    console.error(`Unknown paper size "${badSize}" — use any of: ${ALL_SIZES.join(', ')}`);
    process.exit(1);
}

// Dates are UTC: "10 Oct 2026" for display, "2026-10-10" for file names.
const NOW = new Date();
const PRINT_DATE = NOW.toLocaleDateString('en-GB', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
});
const FILE_DATE = NOW.toISOString().slice(0, 10);

const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
};

// Minimal static file server, so this script needs nothing beyond what the
// project already installs.
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
    {
        name: 'continuous', label: 'Continuous', pageNumbers: true,
        ready: page => page.locator('#continuous-container .card').first().waitFor(),
    },
    {
        name: 'book', label: 'Book', pageNumbers: false,
        ready: async page => {
            await page.locator('#book-container.active').waitFor();
            await page.locator('#book-columns .book-card').first().waitFor();
        },
    },
];

// Picks a paper size through the real Settings dropdown (not by poking
// localStorage), so applyPaperSize() runs exactly as it does for a user —
// including reading the current view to choose @page orientation.
async function selectPaperSize(page, paperSize) {
    await page.locator('#settings-btn').click();
    await page.locator('#paper-size-select').selectOption(paperSize);
    // Click-outside closes the dropdown.
    await page.evaluate(() => document.body.click());
    await page.waitForTimeout(300);   // let book view re-paginate
}

// Footer drawn by Chrome in the 15mm bottom page margin (no URL; the header
// is deliberately blank). Chrome fills in pageNumber/totalPages.
function footerTemplate(showPageNumbers) {
    const pages = showPageNumbers
        ? 'Page <span class="pageNumber"></span> of <span class="totalPages"></span>'
        : '';
    return `<div style="width:100%; box-sizing:border-box; padding:0 15mm; font-size:8px;
        font-family:Arial,sans-serif; color:#777; display:flex; justify-content:space-between;">
        <span>${PRINT_DATE}</span><span>${pages}</span>
    </div>`;
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

                await page.goto(base);
                await page.locator(`.view-toggle-btn[data-view="${view.name}"]`).click();
                await view.ready(page);
                await selectPaperSize(page, paperSize);
                await view.ready(page);
                await imagesLoaded(page);

                const sizeLabel = paperSize === 'dynamic' ? 'Dynamic' : paperSize.toUpperCase();
                // Chrome uses document.title as the PDF's title (what a viewer
                // shows in its title bar).
                await page.evaluate(t => { document.title = t; },
                    `${TITLE} — ${view.label} (${sizeLabel}) — ${PRINT_DATE}`);

                const fileName = `${TITLE.replace(/ /g, '-')}-${view.label}-${sizeLabel}-${FILE_DATE}.pdf`;
                await page.pdf({
                    path: path.join(OUT_DIR, fileName),
                    preferCSSPageSize: true,   // honour the app's own @page rule (size + orientation)
                    printBackground: false,    // matches Chrome's default print dialog
                    displayHeaderFooter: true,
                    headerTemplate: '<span></span>',
                    footerTemplate: footerTemplate(view.pageNumbers),
                });
                console.log(`rendered ${fileName}`);
                await context.close();
            }
        }
    } finally {
        await browser.close();
        server.close();
    }
})().catch(err => {
    console.error(err);
    process.exit(1);
});
