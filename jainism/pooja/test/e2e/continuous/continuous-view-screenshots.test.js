const { test } = require('@playwright/test');
const { VIEWS, openViewWithSettings, defineMediaStateScreenTests } = require('../media-states');

test.describe('Continuous View - Screenshot Tests (Display Options)', () => {

    test.beforeEach(async ({ page }) => {
        await openViewWithSettings(page, VIEWS.continuous);
    });

    // Default / QR-only / Both (+ the QR's picture-in-picture position) / None
    // / Videos-only: shared with book view, see ../media-states.js
    defineMediaStateScreenTests(VIEWS.continuous);
});
