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

test("persists resumable Claude conversations and message memory", async () => {
  const schema = await readFile(new URL("database/schema.sql", root), "utf8");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS chat_conversations/i);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS chat_messages/i);
  assert.match(schema, /conversation_id UUID NOT NULL REFERENCES chat_conversations\(id\) ON DELETE CASCADE/i);
  assert.match(schema, /CHECK \(role IN \('user', 'assistant'\)\)/i);
  assert.match(schema, /sources JSONB NOT NULL/i);
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
  assert.match(config, /GEMINI_TIMEOUT_MS/);
  assert.match(extractor, /config\.geminiTimeoutMs/);
  assert.match(extractor, /generativelanguage\.googleapis\.com/);
  assert.doesNotMatch(extractor, /api\.openai\.com/);
  assert.doesNotMatch(schema, /BYTEA/i);
});

test("gives Claude read-only ledger tools and live web search", async () => {
  const [agent, config] = await Promise.all([
    readFile(new URL("server/chat-agent.ts", root), "utf8"),
    readFile(new URL("server/config.ts", root), "utf8"),
  ]);
  assert.match(config, /claude-sonnet-5/);
  assert.match(agent, /web_search_20260209/);
  assert.match(agent, /get_spending_summary/);
  assert.match(agent, /get_spending_breakdown/);
  assert.match(agent, /search_expenses/);
  assert.match(agent, /messages\.stream/);
  assert.match(agent, /generateConversationTitle/);
  assert.match(agent, /output_config: \{ effort: "low" \}/);
  assert.doesNotMatch(agent, /country:\s*"AM"/);
  assert.doesNotMatch(agent, /INSERT\s+INTO|UPDATE\s+expenses|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+TABLE/i);
});

test("exposes conversation history and streaming chat UI", async () => {
  const [api, page, ambientGeometry, chatStyles] = await Promise.all([
    readFile(new URL("server/index.ts", root), "utf8"),
    readFile(new URL("app/chat/page.tsx", root), "utf8"),
    readFile(new URL("app/chat/ambient-geometry.tsx", root), "utf8"),
    readFile(new URL("app/chat/chat.css", root), "utf8"),
  ]);
  assert.match(api, /app\.get\("\/api\/chat\/conversations"/);
  assert.match(api, /text\/event-stream/);
  assert.match(api, /runChatAgent/);
  assert.match(api, /generateConversationTitle/);
  assert.doesNotMatch(api, /titleFromMessage/);
  assert.match(page, /Conversation history/);
  assert.match(page, /getReader\(\)/);
  assert.match(page, /ReactMarkdown/);
  assert.match(page, /remarkGfm/);
  assert.match(page, /messageScrollRef/);
  assert.match(page, /scroller\.scrollTo/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
  assert.match(page, /<AmbientGeometry/);
  assert.match(page, /historyCollapsed/);
  assert.match(page, /PanelRight/);
  assert.match(page, /title=\{conversation\.title\}/);
  assert.match(chatStyles, /\.conversation-rail\.is-collapsed/);
  assert.match(chatStyles, /order:\s*2/);
  assert.match(chatStyles, /\.message-content[^}]*font-size:\s*14px/s);
  assert.match(chatStyles, /\.markdown-content td[^}]*font-size:\s*14\.4px/s);
  assert.match(chatStyles, /@media \(max-width: 520px\)[\s\S]*\.markdown-content td[^}]*font-size:\s*13\.5px/s);
  assert.match(ambientGeometry, /requestAnimationFrame/);
  assert.match(ambientGeometry, /prefers-reduced-motion/);
  assert.match(ambientGeometry, /drawConnections/);
  assert.match(ambientGeometry, /Math\.floor\(point\.seed \* 6\)/);
  assert.match(page, /Ledger · read only/);
  assert.match(page, /Live web/);
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
  assert.match(envExample, /^ANTHROPIC_API_KEY=$/m);
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
