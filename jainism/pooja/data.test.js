const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const fs = require("fs");
const path = require("path");

describe('Data Layer Validation', () => {
  test('data.json exactly matches the schema', () => {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);

    const schemaPath = path.join(__dirname, 'schema.json');
    const dataPath = path.join(__dirname, 'data.json');

    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    const validate = ajv.compile(schema);
    const isValid = validate(data);

    // If it fails, print the errors nicely in Jest
    if (!isValid) {
      console.error(validate.errors);
    }

    expect(isValid).toBe(true);
  });

  test('the first item, when it is an insert, has both an image and content (it is the book\'s cover) and hideId set', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));
    if (data[0]?.type !== 'insert') return; // no cover — nothing to check
    const block = data[0].blocks?.[0];
    expect(block?.images?.[0]?.src).toBeTruthy();
    expect(block?.content?.kn?.length || block?.content?.en?.length).toBeTruthy();
    expect(data[0].hideId).toBe(true);
  });

  test('schema requires blocks on every item except insert, and accepts hideId', () => {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'schema.json'), 'utf8'));
    const validate = ajv.compile(schema);

    const withInsert = [{
        id: 'ins_001', type: 'insert', hideId: true,
        blocks: [{ id: 'ins_001_b_1', type: 'images', images: [{ src: 'x.jpg' }], content: { kn: ['ಶೀ'], en: ['Title'] } }],
    }];
    expect(validate(withInsert)).toBe(true);

    // A plain blank insert — no blocks at all — is the minimal, common
    // case for a blank/separator page, and must validate.
    const blankInsert = [{ id: 'blank_000', type: 'insert' }];
    expect(validate(blankInsert)).toBe(true);

    const missingBlocks = [{ id: 'a_001', type: 'answer' }];
    expect(validate(missingBlocks)).toBe(false);
  });

  test('every local image in data.json follows the naming convention and exists in images/', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));
    const srcs = [];
    for (const item of data) {
      for (const block of item.blocks || []) {
        for (const img of block.images || []) srcs.push(img.src);
      }
    }
    const local = srcs.filter((s) => !s.includes('://'));
    expect(local.length).toBeGreaterThan(0);

    // lowercase letters, digits and hyphens only: no spaces or capitals, which break on case-sensitive hosts and in URLs
    const badNames = local.filter((s) => !/^[a-z0-9-]+\.(jpg|jpeg|png|webp)$/.test(s));
    expect(badNames).toEqual([]);

    const missing = local.filter((s) => !fs.existsSync(path.join(__dirname, 'images', s)));
    expect(missing).toEqual([]);
  });

  describe('permanent ids (shared links depend on these never changing)', () => {
    const { ID_PATTERN } = require('./scripts/new-id');
    const { itemNumber } = require('./core/blocks');
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));
    const everyId = data.flatMap((item) => [item.id, ...(item.blocks || []).map((b) => b.id)]);
    const itemById = Object.fromEntries(data.map((i) => [i.id, i]));

    test('every item and block id is opaque, well-formed and unique across the whole file', () => {
      expect(everyId.filter((id) => !ID_PATTERN.test(id))).toEqual([]);
      const dupes = everyId.filter((id, i) => everyId.indexOf(id) !== i);
      expect(dupes).toEqual([]);
    });

    test('every item resolves to a number and every block has a num (they drive the A-3.1 style labels)', () => {
      const badItems = data.filter((i) => itemNumber(i, itemById) === undefined).map((i) => i.id);
      const badBlocks = data.flatMap((i) => (i.blocks || []).filter((b) => !Number.isInteger(b.num)).map((b) => b.id));
      expect([...badItems, ...badBlocks]).toEqual([]);
    });

    test('an answer never carries a number that differs from the question it replies to', () => {
      const clashes = data.filter((i) => {
        if (i.type !== 'answer' || i.num === undefined) return false;
        const q = (i.references || []).map((r) => itemById[r]).find((t) => t && t.type === 'question');
        return q && q.num !== i.num;
      }).map((i) => i.id);
      expect(clashes).toEqual([]);
    });

    test('every reference points at an item or block that exists', () => {
      const known = new Set(everyId);
      const broken = data.flatMap((i) => (i.references || []).filter((r) => !known.has(r)).map((r) => `${i.id} -> ${r}`));
      expect(broken).toEqual([]);
    });
  });
});
