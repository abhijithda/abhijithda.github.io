const { KNOWN_LANGS, LANG_CODES, activeLangCodes } = require('./langs');

describe('LANG_CODES', () => {
    test('is the registry\'s codes, in registry order', () => {
        expect(LANG_CODES).toEqual(KNOWN_LANGS.map(l => l.code));
        expect(LANG_CODES).toEqual(expect.arrayContaining(['kn', 'en']));
    });
});

describe('activeLangCodes', () => {
    test("'all' selects every known language, in registry order", () => {
        expect(activeLangCodes('all')).toEqual(LANG_CODES);
    });

    test('a single code selects just that language', () => {
        expect(activeLangCodes('kn')).toEqual(['kn']);
        expect(activeLangCodes('en')).toEqual(['en']);
    });

    test('an unknown code selects nothing; no argument means all', () => {
        expect(activeLangCodes('xx')).toEqual([]);
        expect(activeLangCodes()).toEqual(LANG_CODES);
    });
});
