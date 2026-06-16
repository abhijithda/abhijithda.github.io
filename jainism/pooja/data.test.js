const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const fs = require("fs");
const path = require("path");

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const testDir = __dirname; // Current directory
const schemaPath = path.join(testDir, 'schema.json');
const dataPath = path.join(testDir, 'data.json');

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Compile and validate
const validate = ajv.compile(schema);
const valid = validate(data);

if (!valid) {
  console.error("❌ data.json schema validation failed:\n");
  validate.errors.forEach(err => {
    console.error(`- Path: ${err.instancePath || 'root'}`);
    console.error(`  Error: ${err.message}`);
  });
  process.exit(1);
} else {
  console.log("✅ data.json is valid!");
  process.exit(0);
}
