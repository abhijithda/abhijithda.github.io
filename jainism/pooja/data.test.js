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

  test('schema requires blocks on every item, insert included, and accepts hideId', () => {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'schema.json'), 'utf8'));
    const validate = ajv.compile(schema);

    const withInsert = [{
        id: 'ins_001', type: 'insert', hideId: true,
        blocks: [{ id: 'ins_001_b_1', type: 'images', images: [{ src: 'x.jpg' }], content: { kn: ['ಶೀ'], en: ['Title'] } }],
    }];
    expect(validate(withInsert)).toBe(true);

    const missingBlocks = [{ id: 'a_001', type: 'answer' }];
    expect(validate(missingBlocks)).toBe(false);
  });
});