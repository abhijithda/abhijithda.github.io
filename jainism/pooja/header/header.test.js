const {
    getActiveLangs,
    saveActiveLangs,
    initLangPicker,
    updateMediaVisibility,
    updateReadTrackingVisibility,
    initHeaderDropdown,
    loadSettings,
    saveSettings,
    applySettings,
    SETTINGS_KEY,
    PAPER_SIZES,
    FONT_SCALE_MIN,
    FONT_SCALE_MAX,
    FONT_SCALE_STEP,
    applyPaperSize,
    initPaperSizeControl,
    applyFontScale,
    changeFontScale,
    initFontScaleControl,
} = require('./header');

// Every loadSettings()/saveSettings() assertion below that checks the full
// object includes these two defaults alongside the pre-existing fields.
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
    `;
    // Match production: header.js's --font-scale default lives in
    // header.css's :root rule, which isn't loaded in jsdom unit tests.
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

// One settings object, one localStorage key: saveSettings(partial) merges
// into whatever's already saved, so any single control can persist its own
// change with one call without needing to know about (or touch) the others.
describe('loadSettings / saveSettings', () => {
    test('defaults every field when nothing has ever been saved', () => {
        expect(loadSettings()).toEqual({ langs: ['kn', 'en'], videos: true, qrs: false, readTracking: false, ...DEFAULT_PAPER_FONT });
    });

    test('saveSettings merges a partial update into the existing saved settings', () => {
        saveSettings({ qrs: true });
        saveSettings({ readTracking: true });

        expect(loadSettings()).toEqual({ langs: ['kn', 'en'], videos: true, qrs: true, readTracking: true, ...DEFAULT_PAPER_FONT });
    });

    test('invalid/unknown paperSize falls back to dynamic', () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ paperSize: 'letter' }));
        expect(loadSettings().paperSize).toBe('dynamic');
    });

    test.each(PAPER_SIZES)('accepts a saved paperSize of %s', (size) => {
        saveSettings({ paperSize: size });
        expect(loadSettings().paperSize).toBe(size);
    });

    test('out-of-range or non-numeric fontScale falls back to 1', () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ fontScale: 99 }));
        expect(loadSettings().fontScale).toBe(1);

        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ fontScale: 'big' }));
        expect(loadSettings().fontScale).toBe(1);
    });

    test('accepts a saved fontScale within range', () => {
        saveSettings({ fontScale: 1.3 });
        expect(loadSettings().fontScale).toBe(1.3);
    });
});

// Paper size: 'dynamic' is the current/default responsive behavior in both
// views on screen, but must always print as A4 — a printer can't be handed
// "whatever fits your screen" as a paper size. Only 'a3' should change the
// printed sheet.
describe('applyPaperSize / initPaperSizeControl', () => {
    test('defaults to dynamic: sets body[data-paper-size] and the select, and prints as A4', () => {
        applyPaperSize();
        expect(document.body.dataset.paperSize).toBe('dynamic');
        expect(document.getElementById('paper-size-select').value).toBe('dynamic');
        expect(document.getElementById('print-page-size').textContent).toContain('A4');
    });

    test('an explicit A4 choice also prints as A4', () => {
        saveSettings({ paperSize: 'a4' });
        applyPaperSize();
        expect(document.body.dataset.paperSize).toBe('a4');
        expect(document.getElementById('print-page-size').textContent).toContain('A4');
        expect(document.getElementById('print-page-size').textContent).not.toContain('A3');
    });

    test('an A3 choice is the only one that changes the printed sheet', () => {
        saveSettings({ paperSize: 'a3' });
        applyPaperSize();
        expect(document.body.dataset.paperSize).toBe('a3');
        expect(document.getElementById('print-page-size').textContent).toContain('A3');
    });

    test('print orientation follows the active view: landscape for book, portrait for continuous', () => {
        localStorage.setItem('viewMode', 'book');
        applyPaperSize();
        expect(document.getElementById('print-page-size').textContent).toContain('landscape');

        localStorage.setItem('viewMode', 'continuous');
        applyPaperSize();
        expect(document.getElementById('print-page-size').textContent).toContain('portrait');
    });

    test('changing the <select> persists the choice and re-applies it', () => {
        initPaperSizeControl();
        const select = document.getElementById('paper-size-select');
        select.value = 'a3';
        select.dispatchEvent(new Event('change'));

        expect(loadSettings().paperSize).toBe('a3');
        expect(document.body.dataset.paperSize).toBe('a3');
    });

    test('applySettings pushes the saved paper size onto the select', () => {
        saveSettings({ paperSize: 'a3' });
        baseDom();
        applySettings();
        expect(document.getElementById('paper-size-select').value).toBe('a3');
        expect(document.body.dataset.paperSize).toBe('a3');
    });
});

// Font scaling: a multiplier (not an absolute override) applied via a single
// --font-scale custom property that both screen and @media print rules
// read, so the two can never drift apart.
describe('applyFontScale / changeFontScale / initFontScaleControl', () => {
    test('defaults to 100% and sets --font-scale: 1', () => {
        applyFontScale();
        expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1');
        expect(document.getElementById('font-scale-display').textContent).toBe('100%');
    });

    test('changeFontScale increases/decreases by one step and persists it', () => {
        const next = changeFontScale(FONT_SCALE_STEP);
        expect(next).toBeCloseTo(1 + FONT_SCALE_STEP);
        expect(loadSettings().fontScale).toBeCloseTo(1 + FONT_SCALE_STEP);
        expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe(String(next));

        const back = changeFontScale(-FONT_SCALE_STEP);
        expect(back).toBeCloseTo(1);
    });

    test('clamps at FONT_SCALE_MAX / FONT_SCALE_MIN instead of going out of range', () => {
        saveSettings({ fontScale: FONT_SCALE_MAX });
        expect(changeFontScale(FONT_SCALE_STEP)).toBe(FONT_SCALE_MAX);

        saveSettings({ fontScale: FONT_SCALE_MIN });
        expect(changeFontScale(-FONT_SCALE_STEP)).toBe(FONT_SCALE_MIN);
    });

    test('repeated increases avoid floating-point drift', () => {
        for (let i = 0; i < 3; i++) changeFontScale(FONT_SCALE_STEP);
        expect(loadSettings().fontScale).toBe(1.3);
    });

    test('the increase/decrease buttons update the shared setting and display', () => {
        initFontScaleControl();
        document.getElementById('font-scale-increase').click();

        expect(loadSettings().fontScale).toBeCloseTo(1 + FONT_SCALE_STEP);
        expect(document.getElementById('font-scale-display').textContent).toBe('110%');

        document.getElementById('font-scale-decrease').click();
        document.getElementById('font-scale-decrease').click();
        expect(document.getElementById('font-scale-display').textContent).toBe('90%');
    });

    test('font scale and paper size persist under the same single settings key as everything else', () => {
        saveSettings({ qrs: true });
        changeFontScale(FONT_SCALE_STEP);
        saveSettings({ paperSize: 'a3' });

        expect(localStorage.length).toBe(1);
        const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        expect(raw).toEqual({
            langs: ['kn', 'en'], videos: true, readTracking: false,
            qrs: true, fontScale: 1.1, paperSize: 'a3',
        });
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
