// media-states.js — Parametrised e2e tests shared by book view and continuous
// view: the Videos/QR display states (on screen and in print) and the print
// paper-size screenshots.
//
// Those tests used to be copy-pasted per view (four states x on-screen and
// print, three paper sizes, in four files), which let them drift: different
// waits, different selectors, one state missing from one view. Now a view's
// test file lists what is specific to it (a VIEWS entry) and calls the
// define*() functions below INSIDE its own test.describe(), so:
//   - test titles are unchanged,
//   - snapshot file names are unchanged (they derive from `view.id` and the
//     state), and snapshots still live next to the calling test file,
//     so existing baselines keep matching.
//
// Both views build their videos with the same markup now
// (.media-wrap > .video-card + .qr-code, from core/media.js), so the only
// per-view differences left are how to open the view, how to find a
// read-tick, and a few documented exceptions (see VIEWS).

const path = require('path');
const { test, expect } = require('@playwright/test');

// The four ways the two display toggles can be set.
//   thumb / qr: what must be visible in that state.
const MEDIA_STATES = {
    videosOnly: { videos: true,  qrs: false },
    both:       { videos: true,  qrs: true  },
    qrOnly:     { videos: false, qrs: true  },
    none:       { videos: false, qrs: false },
};

const VIEWS = {
    book: {
        id: 'book',
        container: '#book-container',
        // The first video row in the book. (.media-wrap exists in both views'
        // DOM, so it is always scoped to its view's container.)
        mediaRow: page => page.locator('#book-container .media-wrap').first(),
        // With both toggles off book view hides the whole row; continuous
        // view leaves an empty wrapper (it has no layout of its own to hide).
        rowHiddenWhenNone: true,
        readTick: '#book-q_001_b_1 .read-tick',
        screenWait: '#book-columns .media-wrap',
        // On-screen states this view has a screenshot for, in test order.
        screenStates: ['default', 'qrOnly', 'both', 'none'],
        async open(page) {
            await page.locator('.view-toggle-btn[data-view="book"]').click();
            await expect(page.locator('#book-container')).toHaveClass(/active/);
            await expect(page.locator('#book-columns .book-card').first()).toBeVisible();
        },
    },
    continuous: {
        id: 'continuous',
        container: '#continuous-container',
        mediaRow: page => page.locator('#continuous-container .media-wrap').first(),
        rowHiddenWhenNone: false,
        readTick: '#q_001_b_1 .read-tick',
        screenWait: '#continuous-container .card .video-card',
        screenStates: ['default', 'qrOnly', 'both', 'none', 'videosOnly'],
        // Baselines kept as captured: this one was taken viewport-only.
        screenshotOptions: { none: { fullPage: false, maxDiffPixels: 1000 } },
        // Extra checks a state's screen test also makes in this view.
        extraChecks: {
            // Both on: the QR is an overlay (picture-in-picture) inside .media-wrap.
            both: async page => {
                const wrap = page.locator('#continuous-container .card:has(.video-card) .media-wrap').first();
                const wrapBox = await wrap.boundingBox();
                const qrBox = await wrap.locator('.qr-code').boundingBox();
                if (qrBox && wrapBox) {
                    expect(qrBox.x >= wrapBox.x).toBe(true);
                    expect(qrBox.y >= wrapBox.y).toBe(true);
                }
            },
        },
        async open(page) {
            await page.locator('.view-toggle-btn[data-view="continuous"]').click();
            await expect(page.locator('.card').first()).toBeVisible();
        },
    },
};

// ── Shared setup ──────────────────────────────────────────────────────────

/** Serve the shared small fixture (test/data.json) as the app's data. */
async function routeFixtureData(page) {
    await page.route('**/data.json', route => {
        route.fulfill({ path: path.join(__dirname, '..', 'data.json') });
    });
}

/** Fresh load -> open the view -> open Settings and wait for a control in it. */
async function openViewWithSettings(page, view, settingsControl = '#toggle-videos') {
    await routeFixtureData(page);
    await page.goto('/');
    await view.open(page);
    await page.locator('#settings-btn').click();
    await expect(page.locator(settingsControl)).toBeVisible();
}

async function setMediaState(page, state) {
    await page.locator('#toggle-videos').setChecked(state.videos);
    await page.locator('#toggle-qrs').setChecked(state.qrs);
}

/** What is visible in a state: the thumbnail iff Videos is on, the QR iff QR is on. */
async function expectMediaVisible(row, state) {
    const check = async (locator, shown) => (shown ? expect(locator).toBeVisible() : expect(locator).toBeHidden());
    await check(row.locator('.video-card'), state.videos);
    await check(row.locator('.qr-code'), state.qrs);
}

// ── Print: the four states ────────────────────────────────────────────────
// Call inside a describe whose beforeEach has already run openViewWithSettings().

const PRINT_STATE_CASES = [
    // [state, title (unchanged from the originals), snapshot suffix (ditto)]
    ['videosOnly', 'Videos-only state (Videos ON, QR OFF): the video thumbnail prints, the QR does not', 'default-state'],
    ['both',       'Default / Both state (Videos ON, QR ON): both the thumbnail and the QR print',        'both-state'],
    ['qrOnly',     'QR-only state (Videos OFF, QR ON): the QR prints, the video thumbnail does not',      'qr-only-state'],
    ['none',       'None state (Videos OFF, QR OFF): neither prints',                                     'none-state'],
];

function defineMediaStatePrintTests(view) {
    for (const [key, title, suffix] of PRINT_STATE_CASES) {
        test(title, async ({ page }) => {
            const state = MEDIA_STATES[key];
            await setMediaState(page, state);

            const row = view.mediaRow(page);
            await page.emulateMedia({ media: 'print' });
            await page.waitForTimeout(200);

            // The precise checks catch a logic regression even if it happens
            // to look pixel-identical; the screenshot catches a visual one
            // with an image to review in the PR.
            await expectMediaVisible(row, state);
            await expect(page).toHaveScreenshot(`${view.id}-print-${suffix}.png`, { fullPage: true, timeout: 15000 });
        });
    }
}

// ── Print: paper sizes ────────────────────────────────────────────────────
// Call inside a describe whose beforeEach has run openViewWithSettings(page, view, '#paper-size-select').
//
// Added after a real bug (an active A3/A4 screen setting leaking its width
// into print) shipped because nothing ever looked at print output with a
// non-default paper size. A4/A3 use the fullest state a printout can use:
// QR codes on (a paper page can't play a video, but the QR gets the reader
// there) and read-tracking on with one tick marked, so progress shows too.

function definePaperSizePrintTests(view) {
    test('Print screenshot: Dynamic (default) paper size', async ({ page }) => {
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(300);
        await expect(page).toHaveScreenshot(`${view.id}-print-paper-size-dynamic.png`, { fullPage: true, timeout: 15000 });
    });

    for (const [size, label] of [['a4', 'A4'], ['a3', 'A3']]) {
        test(`Print screenshot: ${label} paper size`, async ({ page }) => {
            await page.locator('#toggle-qrs').check();
            await page.locator('#toggle-read-tracking').check();
            await page.locator(view.readTick).click();
            await page.locator('#paper-size-select').selectOption(size);
            await page.waitForTimeout(200);

            await page.emulateMedia({ media: 'print' });
            await page.waitForTimeout(300);
            await expect(page).toHaveScreenshot(`${view.id}-print-paper-size-${size}.png`, { fullPage: true, timeout: 15000 });
        });
    }
}

// ── Screen: display-option screenshots ────────────────────────────────────
// Call inside a describe whose beforeEach has run openViewWithSettings().

const SCREEN_STATE_CASES = {
    // key: [title, snapshot name]
    default:    ['Screenshot: Default state (Videos ON, QR ON)',  'default-state-videos-on-qr-on'],
    qrOnly:     ['Screenshot: QR-only state (Videos OFF, QR ON)', 'qr-only-state-videos-off-qr-on'],
    both:       ['Screenshot: Both state (Videos ON, QR ON)',     'both-state-videos-on-qr-on'],
    none:       ['Screenshot: None state (Videos OFF, QR OFF)',   'none-state-videos-off-qr-off'],
    videosOnly: ['Screenshot: Videos-only state (Videos ON, QR OFF)', 'videos-only-state-videos-on-qr-off'],
};

function defineMediaStateScreenTests(view) {
    for (const key of view.screenStates) {
        const [title, name] = SCREEN_STATE_CASES[key];
        test(title, async ({ page }) => {
            await page.waitForSelector(view.screenWait);

            if (key === 'default') {
                // Nothing to set: this documents that both toggles start ON.
                await expect(page.locator('#toggle-videos')).toBeChecked();
                await expect(page.locator('#toggle-qrs')).toBeChecked();
            } else {
                await setMediaState(page, MEDIA_STATES[key]);
                await page.waitForTimeout(500);
            }

            const state = key === 'default' ? MEDIA_STATES.both : MEDIA_STATES[key];
            const row = view.mediaRow(page);
            await expectMediaVisible(row, state);
            if (key === 'none' && view.rowHiddenWhenNone) await expect(row).toBeHidden();
            if (view.extraChecks?.[key]) await view.extraChecks[key](page);

            const options = view.screenshotOptions?.[key] ?? { fullPage: true, timeout: 20000 };
            await expect(page).toHaveScreenshot(`${view.id}-screenshot-${name}.png`, options);
        });
    }
}

module.exports = {
    MEDIA_STATES, VIEWS, routeFixtureData, openViewWithSettings, setMediaState, expectMediaVisible,
    defineMediaStatePrintTests, definePaperSizePrintTests, defineMediaStateScreenTests,
};
