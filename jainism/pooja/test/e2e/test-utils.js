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

module.exports = { hasClass };
