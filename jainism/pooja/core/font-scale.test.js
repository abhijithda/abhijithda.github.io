const { loadSettings, saveSettings, SETTINGS_KEY } = require('./settings');
const {
    FONT_SCALE_MIN, FONT_SCALE_MAX, FONT_SCALE_STEP,
    applyFontScale, changeFontScale, initFontScaleControl,
} = require('./font-scale');

function baseDom() {
    document.body.innerHTML = `
        <button id="font-scale-decrease"></button>
        <span id="font-scale-display"></span>
        <button id="font-scale-increase"></button>
    `;
}

beforeEach(() => {
    localStorage.clear();
    baseDom();
    // Match production: the --font-scale default lives in core/font-scale.css's
    // :root rule, which isn't loaded in jsdom unit tests.
    document.documentElement.style.removeProperty('--font-scale');
});

// A multiplier (not an absolute override) applied via a single --font-scale
// custom property that both screen and @media print rules read, so the two
// can never drift apart.
describe('applyFontScale', () => {
    test('defaults to 100% and sets --font-scale: 1', () => {
        applyFontScale();
        expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1');
        expect(document.getElementById('font-scale-display').textContent).toBe('100%');
    });

    test('fires a pooja:layout-changed event, so book view can re-measure its pagination', () => {
        let fired = 0;
        window.addEventListener('pooja:layout-changed', () => fired++);
        applyFontScale();
        expect(fired).toBe(1);
    });
});

describe('changeFontScale', () => {
    test('increases/decreases by one step and persists it', () => {
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

    test('persists under the same single settings key as everything else, alongside paper size', () => {
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

describe('initFontScaleControl', () => {
    test('the increase/decrease buttons update the shared setting and display', () => {
        initFontScaleControl();
        document.getElementById('font-scale-increase').click();

        expect(loadSettings().fontScale).toBeCloseTo(1 + FONT_SCALE_STEP);
        expect(document.getElementById('font-scale-display').textContent).toBe('110%');

        document.getElementById('font-scale-decrease').click();
        document.getElementById('font-scale-decrease').click();
        expect(document.getElementById('font-scale-display').textContent).toBe('90%');
    });

    test('applies the current setting immediately on init, without waiting for a click', () => {
        saveSettings({ fontScale: 1.2 });
        initFontScaleControl();
        expect(document.getElementById('font-scale-display').textContent).toBe('120%');
    });
});
