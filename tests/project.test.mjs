import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("defines the normalized receipt and expense schema", async () => {
  const schema = await readFile(new URL("database/schema.sql", root), "utf8");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS receipts/i);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS expenses/i);
  assert.match(schema, /item_name_en TEXT/i);
  assert.match(schema, /purchase_date DATE NOT NULL/i);
  assert.match(schema, /ON DELETE CASCADE/i);
});

test("keeps receipt review between extraction and database save", async () => {
  const [page, api] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("server/index.ts", root), "utf8"),
  ]);
  assert.match(page, /Review every line/);
  assert.match(page, /\/api\/receipts\/extract/);
  assert.match(page, /\/api\/receipts/);
  assert.match(api, /withTransaction/);
  assert.match(api, /INSERT INTO expenses/);
});

test("uses structured vision extraction without storing receipt image bytes", async () => {
  const [extractor, config, schema] = await Promise.all([
    readFile(new URL("server/receipt-extractor.ts", root), "utf8"),
    readFile(new URL("server/config.ts", root), "utf8"),
    readFile(new URL("database/schema.sql", root), "utf8"),
  ]);
  assert.match(extractor, /type: "image"/);
  assert.match(extractor, /response_format/);
  assert.match(config, /gemini-3\.7-flash/);
  assert.match(extractor, /generativelanguage\.googleapis\.com/);
  assert.doesNotMatch(extractor, /api\.openai\.com/);
  assert.doesNotMatch(schema, /BYTEA/i);
});

test("keeps secrets out of the repository and validates changes in CI", async () => {
  const [gitignore, envExample, database, workflow] = await Promise.all([
    readFile(new URL(".gitignore", root), "utf8"),
    readFile(new URL(".env.example", root), "utf8"),
    readFile(new URL("server/database.ts", root), "utf8"),
    readFile(new URL(".github/workflows/ci.yml", root), "utf8"),
  ]);
  assert.match(gitignore, /^\.env\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.match(envExample, /^GEMINI_API_KEY=$/m);
  assert.doesNotMatch(database, /postgresql:\/\//);
  assert.match(workflow, /npm run check/);
});
