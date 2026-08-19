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
  const [gitignore, dockerignore, envExample, database, dockerfile, compose, workflow] = await Promise.all([
    readFile(new URL(".gitignore", root), "utf8"),
    readFile(new URL(".dockerignore", root), "utf8"),
    readFile(new URL(".env.example", root), "utf8"),
    readFile(new URL("server/database.ts", root), "utf8"),
    readFile(new URL("Dockerfile", root), "utf8"),
    readFile(new URL("compose.yaml", root), "utf8"),
    readFile(new URL(".github/workflows/ci.yml", root), "utf8"),
  ]);
  assert.match(gitignore, /^\.env\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.match(envExample, /^GEMINI_API_KEY=$/m);
  assert.doesNotMatch(database, /postgresql:\/\//);
  assert.match(dockerignore, /^\.env$/m);
  assert.match(dockerfile, /^USER app$/m);
  assert.doesNotMatch(dockerfile, /GEMINI_API_KEY/);
  assert.match(compose, /env_file:\s*\n\s+- \.env/);
  assert.match(workflow, /npm run check/);
});

test("provides a reproducible Docker startup path", async () => {
  const [config, dockerfile, compose, bundledCompose, packageJson] = await Promise.all([
    readFile(new URL("server/config.ts", root), "utf8"),
    readFile(new URL("Dockerfile", root), "utf8"),
    readFile(new URL("compose.yaml", root), "utf8"),
    readFile(new URL("compose.bundled-db.yaml", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);
  assert.match(config, /POSTGRES_HOST/);
  assert.match(config, /encodeURIComponent/);
  assert.match(dockerfile, /npm run build/);
  assert.match(dockerfile, /start:container/);
  assert.match(compose, /host\.docker\.internal/);
  assert.match(bundledCompose, /condition: service_healthy/);
  assert.match(packageJson, /server-dist\/server\/init-db\.js && npm start/);
});
