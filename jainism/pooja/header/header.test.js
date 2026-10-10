const {
    getActiveLangs,
    saveActiveLangs,
    initLangPicker,
    updateMediaVisibility,
    updateReadTrackingVisibility,
    initHeaderDropdown,
    initZenModeControl,
    loadSettings,
    saveSettings,
    applySettings,
    SETTINGS_KEY,
} = require('./header');

// Every assertion below that checks the full loadSettings() object includes
// these two defaults alongside langs/videos/qrs/readTracking. Paper size and
// font scale each have their own module and their own test file — see
// paper-size.test.js and font-scale.test.js — and the shared schema/
// validation behind both lives in settings.js, tested in settings.test.js.
const DEFAULT_PAPER_FONT = { paperSize: 'dynamic', fontScale: 1 };

function baseDom() {
    document.body.innerHTML = `
        <button id="settings-btn"></button>
        <div id="settings-menu"></div>
        <button id="lang-trigger" aria-expanded="false"><span id="lang-summary"></span></button>
        <div id="lang-panel" hidden>
            <input type="text" id="lang-search">
            <div id="lang-list"></div>
        </div>
        <input type="checkbox" id="toggle-videos" checked>
        <input type="checkbox" id="toggle-qrs">
        <input type="checkbox" id="toggle-read-tracking">
        <select id="paper-size-select">
            <option value="dynamic">Dynamic</option>
            <option value="a4">A4</option>
            <option value="a3">A3</option>
        </select>
        <button id="font-scale-decrease"></button>
        <span id="font-scale-display"></span>
        <button id="font-scale-increase"></button>
        <style id="print-page-size"></style>
        <button id="zen-mode-btn"></button>
        <button id="zen-exit-btn" hidden></button>
        <button id="zen-peek-btn" hidden></button>
    `;
    // Match production: --font-scale's default lives in core/font-scale.css's
    // :root rule, which isn't loaded in jsdom unit tests.
    document.documentElement.style.removeProperty('--font-scale');
}

beforeEach(() => {
    localStorage.clear();
    baseDom();
});

describe('getActiveLangs / saveActiveLangs', () => {
    test('defaults to both known languages when nothing is stored', () => {
        expect(getActiveLangs()).toEqual(['kn', 'en']);
    });

    test('round-trips a saved selection', () => {
        saveActiveLangs(['en']);
        expect(getActiveLangs()).toEqual(['en']);
    });

    test('drops unknown/stale language codes and falls back to the default if none remain valid', () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ langs: ['fr', 'de'] }));
        expect(getActiveLangs()).toEqual(['kn', 'en']);
    });

    test('keeps the valid codes when the stored list is a mix of known and unknown', () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ langs: ['en', 'fr'] }));
        expect(getActiveLangs()).toEqual(['en']);
    });

    test('saving a lang change does not clobber previously saved videos/QR/read-tracking settings', () => {
        saveSettings({ videos: false, qrs: true, readTracking: true });
        saveActiveLangs(['en']);

        const saved = loadSettings();
        expect(saved).toEqual({ langs: ['en'], videos: false, qrs: true, readTracking: true, ...DEFAULT_PAPER_FONT });
    });
});

// This is the piece that regressed silently in the branch, then evolved
// again for scale: master had a single <select id="lang-select"> (All/kn/en);
// the branch replaced it with a flat checkbox list; this replaces THAT with
// a collapsed summary that expands into a searchable checkbox list, so it
// doesn't turn into a wall of checkboxes once more languages are added.
describe('initLangPicker', () => {
    test('starts collapsed, showing a summary of the active languages', () => {
        initLangPicker(() => {});
        expect(document.getElementById('lang-panel').hidden).toBe(true);
        expect(document.getElementById('lang-summary').textContent).toBe('ಕನ್ನಡ, English');
    });

    test('clicking the trigger opens the panel and builds one checkbox row per known language', () => {
        initLangPicker(() => {});
        document.getElementById('lang-trigger').click();

        expect(document.getElementById('lang-panel').hidden).toBe(false);
        const kn = document.getElementById('lang-chk-kn');
        const en = document.getElementById('lang-chk-en');
        expect(kn.checked).toBe(true);
        expect(en.checked).toBe(true);
    });

    test('clicking the trigger again closes the panel', () => {
        initLangPicker(() => {});
        const trigger = document.getElementById('lang-trigger');
        trigger.click();
        trigger.click();
        expect(document.getElementById('lang-panel').hidden).toBe(true);
    });

    test('clicking outside the panel closes it', () => {
        initLangPicker(() => {});
        document.getElementById('lang-trigger').click();
        expect(document.getElementById('lang-panel').hidden).toBe(false);

        document.body.click();
        expect(document.getElementById('lang-panel').hidden).toBe(true);
    });

    test('typing in the search box filters the visible language rows', () => {
        initLangPicker(() => {});
        document.getElementById('lang-trigger').click();

        const search = document.getElementById('lang-search');
        search.value = 'english';
        search.dispatchEvent(new Event('input'));

        expect(document.getElementById('lang-chk-en')).not.toBeNull();
        expect(document.getElementById('lang-chk-kn')).toBeNull();
    });

    test('a search with no matches shows an empty-state message instead of an empty list', () => {
        initLangPicker(() => {});
        document.getElementById('lang-trigger').click();

        const search = document.getElementById('lang-search');
        search.value = 'zzz-no-such-language';
        search.dispatchEvent(new Event('input'));

        expect(document.querySelector('#lang-list .lang-empty')).not.toBeNull();
    });

    test('checking/unchecking calls back with the new active list, updates the summary, and persists it', () => {
        const onChange = jest.fn();
        initLangPicker(onChange);
        document.getElementById('lang-trigger').click();

        const kn = document.getElementById('lang-chk-kn');
        kn.checked = false; // simulate the user unchecking it
        kn.dispatchEvent(new Event('change'));

        expect(onChange).toHaveBeenCalledWith(['en']);
        expect(getActiveLangs()).toEqual(['en']);
        expect(document.getElementById('lang-summary').textContent).toBe('English');
    });

    test('unchecking the last remaining active language reverts instead of leaving zero active', () => {
        saveActiveLangs(['en']);
        const onChange = jest.fn();
        initLangPicker(onChange);
        document.getElementById('lang-trigger').click();

        const en = document.getElementById('lang-chk-en');
        en.checked = false;
        en.dispatchEvent(new Event('change'));

        expect(en.checked).toBe(true); // reverted
        expect(onChange).not.toHaveBeenCalled();
        expect(getActiveLangs()).toEqual(['en']);
    });

    test('a selection made while search-filtered is preserved after the search is cleared', () => {
        initLangPicker(() => {});
        document.getElementById('lang-trigger').click();

        const search = document.getElementById('lang-search');
        search.value = 'kannada';
        search.dispatchEvent(new Event('input'));
        document.getElementById('lang-chk-kn').checked = false;
        document.getElementById('lang-chk-kn').dispatchEvent(new Event('change'));

        search.value = '';
        search.dispatchEvent(new Event('input'));

        expect(document.getElementById('lang-chk-kn').checked).toBe(false);
        expect(document.getElementById('lang-chk-en').checked).toBe(true);
    });

    test('closing the panel clears the search box', () => {
        initLangPicker(() => {});
        const trigger = document.getElementById('lang-trigger');
        trigger.click();
        const search = document.getElementById('lang-search');
        search.value = 'english';
        search.dispatchEvent(new Event('input'));

        trigger.click(); // close

        expect(search.value).toBe('');
    });
});

describe('updateMediaVisibility', () => {
    test('shows videos and hides QR codes by default', () => {
        document.body.insertAdjacentHTML('beforeend',
            '<div class="video-card"></div><div class="qr-code"></div>');

        updateMediaVisibility();

        expect(document.querySelector('.video-card').style.display).toBe('');
        expect(document.querySelector('.qr-code').style.display).toBe('none');
        expect(document.body.classList.contains('show-videos')).toBe(true);
        expect(document.body.classList.contains('show-qrs')).toBe(false);
    });

    test('persists the toggle state via saveSettings, merged into the shared settings object', () => {
        document.getElementById('toggle-qrs').checked = true;
        updateMediaVisibility();

        const saved = loadSettings();
        expect(saved.qrs).toBe(true);
        expect(saved.videos).toBe(true);
    });
});

describe('updateReadTrackingVisibility', () => {
    test('toggles the show-read-tracking body class to match the checkbox', () => {
        document.getElementById('toggle-read-tracking').checked = true;
        updateReadTrackingVisibility();
        expect(document.body.classList.contains('show-read-tracking')).toBe(true);

        document.getElementById('toggle-read-tracking').checked = false;
        updateReadTrackingVisibility();
        expect(document.body.classList.contains('show-read-tracking')).toBe(false);
    });
});

describe('applySettings / saveSettings round-trip', () => {
    test('restores checkbox states saved in an earlier session', () => {
        document.getElementById('toggle-videos').checked = false;
        document.getElementById('toggle-qrs').checked = true;
        document.getElementById('toggle-read-tracking').checked = true;
        saveSettings({ videos: false, qrs: true, readTracking: true });

        baseDom(); // simulate a fresh page load
        applySettings();

        expect(document.getElementById('toggle-videos').checked).toBe(false);
        expect(document.getElementById('toggle-qrs').checked).toBe(true);
        expect(document.getElementById('toggle-read-tracking').checked).toBe(true);
    });
});

describe('initHeaderDropdown', () => {
    test('toggles the settings menu open and closed on button click', () => {
        initHeaderDropdown();
        const btn = document.getElementById('settings-btn');
        const menu = document.getElementById('settings-menu');

        btn.click();
        expect(menu.style.display).toBe('block');
        btn.click();
        expect(menu.style.display).toBe('none');
    });

    test('closes the menu on an outside click', () => {
        initHeaderDropdown();
        document.getElementById('settings-btn').click();
        expect(document.getElementById('settings-menu').style.display).toBe('block');

        document.body.click();
        expect(document.getElementById('settings-menu').style.display).toBe('none');
    });
});

// Not persisted (see header.css's comment on body.zen-mode): a transient
// reading mode for this visit, not a saved preference. jsdom doesn't
// implement requestFullscreen/exitFullscreen, so these tests cover the
// header-hiding class toggle and the keyboard/Escape fallback — the
// (best-effort, try/caught) real Fullscreen calls are exercised by the e2e
// suite where a real browser is available.
describe('initZenModeControl', () => {
    test('the enter button hides the header (via body.zen-mode) and reveals the exit button', () => {
        initZenModeControl();
        document.getElementById('zen-mode-btn').click();

        expect(document.body.classList.contains('zen-mode')).toBe(true);
        expect(document.getElementById('zen-exit-btn').hidden).toBe(false);
    });

    test('the exit button restores the header', () => {
        initZenModeControl();
        document.getElementById('zen-mode-btn').click();
        document.getElementById('zen-exit-btn').click();

        expect(document.body.classList.contains('zen-mode')).toBe(false);
        expect(document.getElementById('zen-exit-btn').hidden).toBe(true);
    });

    test('clicking the Focus button again while peeked open exits zen mode, rather than no-op-ing', () => {
        initZenModeControl();
        document.getElementById('zen-mode-btn').click();
        document.getElementById('zen-peek-btn').click(); // header (and #zen-mode-btn) visible again
        expect(document.body.classList.contains('zen-header-visible')).toBe(true);

        document.getElementById('zen-mode-btn').click();
        expect(document.body.classList.contains('zen-mode')).toBe(false);
        expect(document.body.classList.contains('zen-header-visible')).toBe(false);
    });

    test('Escape exits zen mode even when fullscreen was never actually entered', () => {
        initZenModeControl();
        document.getElementById('zen-mode-btn').click();
        expect(document.body.classList.contains('zen-mode')).toBe(true);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(document.body.classList.contains('zen-mode')).toBe(false);
    });

    test('Escape does nothing when not in zen mode', () => {
        initZenModeControl();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(document.body.classList.contains('zen-mode')).toBe(false);
    });

    test('exiting real fullscreen some other way (fullscreenchange) also restores the header', () => {
        initZenModeControl();
        document.getElementById('zen-mode-btn').click();
        expect(document.body.classList.contains('zen-mode')).toBe(true);

        // Simulate the browser having exited fullscreen on its own
        // (Esc/F11/browser UI) — document.fullscreenElement is read-only in
        // real browsers, but jsdom allows this for test purposes.
        document.dispatchEvent(new Event('fullscreenchange'));
        expect(document.body.classList.contains('zen-mode')).toBe(false);
    });

    test('the peek button shows/hides the header without leaving zen mode', () => {
        initZenModeControl();
        document.getElementById('zen-mode-btn').click();
        expect(document.body.classList.contains('zen-mode')).toBe(true);

        document.getElementById('zen-peek-btn').click();
        expect(document.body.classList.contains('zen-header-visible')).toBe(true);
        expect(document.body.classList.contains('zen-mode')).toBe(true); // still in zen mode

        document.getElementById('zen-peek-btn').click();
        expect(document.body.classList.contains('zen-header-visible')).toBe(false);
        expect(document.body.classList.contains('zen-mode')).toBe(true);
    });

    test('exiting zen mode also clears a peeked-open header, rather than leaving stale state', () => {
        initZenModeControl();
        document.getElementById('zen-mode-btn').click();
        document.getElementById('zen-peek-btn').click();
        expect(document.body.classList.contains('zen-header-visible')).toBe(true);

        document.getElementById('zen-exit-btn').click();
        expect(document.body.classList.contains('zen-mode')).toBe(false);
        expect(document.body.classList.contains('zen-header-visible')).toBe(false);
    });
});
