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
} = require('./header');

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
    `;
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
        expect(saved).toEqual({ langs: ['en'], videos: false, qrs: true, readTracking: true });
    });
});

// One settings object, one localStorage key: saveSettings(partial) merges
// into whatever's already saved, so any single control can persist its own
// change with one call without needing to know about (or touch) the others.
describe('loadSettings / saveSettings', () => {
    test('defaults every field when nothing has ever been saved', () => {
        expect(loadSettings()).toEqual({ langs: ['kn', 'en'], videos: true, qrs: false, readTracking: false });
    });

    test('saveSettings merges a partial update into the existing saved settings', () => {
        saveSettings({ qrs: true });
        saveSettings({ readTracking: true });

        expect(loadSettings()).toEqual({ langs: ['kn', 'en'], videos: true, qrs: true, readTracking: true });
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
