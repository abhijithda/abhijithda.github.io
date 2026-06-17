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
});