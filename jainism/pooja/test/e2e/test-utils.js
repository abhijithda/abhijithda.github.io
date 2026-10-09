// test/e2e/test-utils.js — Shared helpers for Playwright e2e tests.
//
// hasClass(): checks for an exact class-token match via classList.contains,
// not a substring regex. Playwright's toHaveClass(/foo/) matches /foo/
// anywhere in the *entire* class attribute string — which silently breaks
// for any element whose own base class name contains the token you're
// checking for as a substring. `.read-tick` is exactly that case: its base
// (unmarked) class is literally "read-tick", which already contains "read"
// with no modifier class present at all. That made
// `expect(tick).not.toHaveClass(/read/)` fail even when correctly unread
// (the real bug this helper fixes), and — easy to miss, since it doesn't
// fail loudly — made the positive form `toHaveClass(/read/)` vacuously true
// regardless of whether the tick was ever actually marked read, silently
// weakening those assertions to check nothing at all.
async function hasClass(locator, className) {
    return locator.evaluate((el, cls) => el.classList.contains(cls), className);
}

// A plain standalone-photo insert (image + per-image caption, no
// block.content) for the e2e specs that need one in an isolated fixture.
// Uses an image that really exists in the repo's images/ folder — an
// earlier version used a made-up 'test.jpg', which rendered as a broken
// image icon: useless as a screenshot baseline, and a broken <img> has no
// aspect ratio, so the print-height assertions measured nothing real.
function plainPhotoInsert(id = 'i_001') {
    return {
        id, type: 'insert',
        blocks: [{
            id: `${id}_b_1`, type: 'images',
            images: [{
                src: 'Bharata Bahubali Swami.jpeg',
                caption: {
                    kn: 'ಭರತ ಚಕ್ರವರ್ತಿ ಮತ್ತು ಬಾಹುಬಲಿ ಸ್ವಾಮಿ',
                    en: 'Bharata Chakravarthi and Bahubali Swami',
                },
            }],
        }],
    };
}

module.exports = { hasClass, plainPhotoInsert };
