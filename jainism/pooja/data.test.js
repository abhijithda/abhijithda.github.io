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
      if ((validate.errors || []).some((e) => e.params && e.params.missingProperty === 'id')) {
        console.error('An item or block has no id. Run:  node scripts/new-id.js --fill');
      }
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
    const { ID_PATTERN, hasId, FILL_COMMAND } = require('./scripts/new-id');
    const { itemNumber } = require('./core/blocks');
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));
    const entries = data.flatMap((item, i) => [
      { where: `item #${i + 1} (${item.type})`, obj: item },
      ...(item.blocks || []).map((b, j) => ({ where: `item #${i + 1} (${item.type}), block #${j + 1}`, obj: b })),
    ]);
    const everyId = entries.filter((e) => hasId(e.obj)).map((e) => e.obj.id);
    const itemById = Object.fromEntries(data.filter(hasId).map((i) => [i.id, i]));

    // Jest has no custom failure messages, so the instructions go in a thrown Error.
    const failWith = (message) => { throw new Error(message); };

    test('every item and block has an id', () => {
      const missing = entries.filter((e) => !hasId(e.obj)).map((e) => e.where);
      if (missing.length) {
        failWith(`${missing.length} item(s)/block(s) have no id:\n  ${missing.join('\n  ')}\n\nFix: run  ${FILL_COMMAND}`);
      }
    });

    test('every id is opaque and well-formed', () => {
      const bad = everyId.filter((id) => !ID_PATTERN.test(id));
      if (bad.length) {
        failWith(`Malformed id(s): ${bad.join(', ')}\n\nFix: delete those "id" lines and run  ${FILL_COMMAND}`);
      }
    });

    test('every id is unique across the whole file', () => {
      const dupes = [...new Set(everyId.filter((id, i) => everyId.indexOf(id) !== i))];
      if (dupes.length) {
        failWith(`Duplicate id(s): ${dupes.join(', ')}\n(Did you copy an item or block?) Delete the "id" lines on the COPY (the item and each of its blocks), then run  ${FILL_COMMAND}`);
      }
    });

    test('every item resolves to a number and every block has a num (they drive the A-3.1 style labels)', () => {
      const badItems = data.filter((i) => itemNumber(i, itemById) === undefined).map((i) => i.id || '(no id)');
      const badBlocks = data.flatMap((i) => (i.blocks || []).filter((b) => !Number.isInteger(b.num)).map((b) => b.id || '(no id)'));
      if (badItems.length || badBlocks.length) {
        failWith(`Missing number on item(s): ${badItems.join(', ') || 'none'}; block(s): ${badBlocks.join(', ') || 'none'}\n\n`
          + 'Fix: add "num" to each (items: a question or standalone answer needs its own; an answer that lists its question in "references" takes the question\'s. Blocks: 1, 2, 3 …).');
      }
    });

    test('an answer never carries a number that differs from the question it replies to', () => {
      const clashes = data.filter((i) => {
        if (i.type !== 'answer' || i.num === undefined) return false;
        const q = (i.references || []).map((r) => itemById[r]).find((t) => t && t.type === 'question');
        return q && q.num !== i.num;
      }).map((i) => i.id);
      if (clashes.length) {
        failWith(`Answer(s) ${clashes.join(', ')} have a "num" different from their question's.\n\nFix: delete the answer's "num" so it follows the question.`);
      }
    });

    test('every reference points at an item or block that exists', () => {
      const known = new Set(everyId);
      const broken = data.flatMap((i) => (i.references || []).filter((r) => !known.has(r)).map((r) => `${i.id} -> ${r}`));
      expect(broken).toEqual([]);
    });
  });
});
