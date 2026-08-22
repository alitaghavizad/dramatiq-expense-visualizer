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
  assert.match(schema, /total_estimated_cost_nanos BIGINT NOT NULL DEFAULT 0/i);
  assert.match(schema, /estimated_cost_nanos BIGINT NOT NULL DEFAULT 0/i);
  assert.match(schema, /pricing_snapshot JSONB NOT NULL DEFAULT '\{\}'::jsonb/i);
});

test("keeps receipt review between extraction and database save", async () => {
  const [page, api, english] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("server/index.ts", root), "utf8"),
    readFile(new URL("app/i18n/locales/en.json", root), "utf8"),
  ]);
  assert.match(page, /dashboard\.reviewEveryLine/);
  assert.match(english, /Review every line/);
  assert.match(page, /\/api\/receipts\/extract/);
  assert.match(page, /\/api\/receipts/);
  assert.match(api, /withTransaction/);
  assert.match(api, /INSERT INTO expenses/);
});

test("sorts the main expense table with accessible type-aware controls", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(page, /type ExpenseSortKey = "item" \| "category" \| "store" \| "date" \| "price"/);
  assert.match(page, /function compareExpenses/);
  assert.match(page, /left\.total_price - right\.total_price/);
  assert.match(page, /left\.purchase_date\.localeCompare\(right\.purchase_date\)/);
  assert.match(page, /const sortedExpenses = useMemo/);
  assert.match(page, /aria-sort=/);
  assert.match(page, /sortedExpenses\.map/);
  assert.match(styles, /\.sort-button\.is-active/);
});

test("provides a persistent system-aware dark theme across dashboard and chat", async () => {
  const [layout, page, chatPage, toggle, styles, chatStyles, ambientGeometry] = await Promise.all([
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/chat/page.tsx", root), "utf8"),
    readFile(new URL("app/theme-toggle.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/chat/chat.css", root), "utf8"),
    readFile(new URL("app/chat/ambient-geometry.tsx", root), "utf8"),
  ]);
  assert.match(layout, /suppressHydrationWarning/);
  assert.match(layout, /const preferenceBootstrap/);
  assert.match(page, /<ThemeToggle/);
  assert.match(chatPage, /<ThemeToggle/);
  assert.match(toggle, /useSyncExternalStore/);
  assert.match(toggle, /localStorage\.setItem/);
  assert.match(layout, /prefers-color-scheme: dark/);
  assert.match(layout, /document\.documentElement\.dataset\.theme/);
  assert.match(styles, /:root\[data-theme="dark"\]/);
  assert.match(chatStyles, /:root\[data-theme="dark"\] \.chat-app-shell/);
  assert.match(ambientGeometry, /MutationObserver/);
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
  assert.match(agent, /stream\.on\("streamEvent"/);
  assert.match(agent, /callbacks\.onUsage/);
  assert.match(agent, /generateConversationTitle/);
  assert.match(agent, /output_config: \{ effort: "low" \}/);
  assert.doesNotMatch(agent, /country:\s*"AM"/);
  assert.doesNotMatch(agent, /INSERT\s+INTO|UPDATE\s+expenses|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+TABLE/i);
});

test("exposes conversation history and streaming chat UI", async () => {
  const [api, page, ambientGeometry, chatStyles, english] = await Promise.all([
    readFile(new URL("server/index.ts", root), "utf8"),
    readFile(new URL("app/chat/page.tsx", root), "utf8"),
    readFile(new URL("app/chat/ambient-geometry.tsx", root), "utf8"),
    readFile(new URL("app/chat/chat.css", root), "utf8"),
    readFile(new URL("app/i18n/locales/en.json", root), "utf8"),
  ]);
  assert.match(api, /app\.get\("\/api\/chat\/conversations"/);
  assert.match(api, /text\/event-stream/);
  assert.match(api, /runChatAgent/);
  assert.match(api, /generateConversationTitle/);
  assert.doesNotMatch(api, /titleFromMessage/);
  assert.match(page, /chat\.conversationHistory/);
  assert.match(english, /Conversation history/);
  assert.match(page, /getReader\(\)/);
  assert.match(page, /createAdaptiveStreamBuffer/);
  assert.match(page, /streamBuffer\.push\(payload\.delta\)/);
  assert.match(page, /streamBuffer\.flush\(\)/);
  assert.doesNotMatch(page, /setStreamText\(\(current\) => current \+ payload\.delta\)/);
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
  assert.match(page, /chat\.ledgerReadOnly/);
  assert.match(page, /chat\.liveWeb/);
  assert.match(page, /chat-cost-badge/);
  assert.match(page, /conversation-item-meta/);
  assert.match(page, /cost_warning/);
  assert.match(api, /event: \$\{event\}/);
  assert.match(api, /"cost_warning"/);
  assert.match(api, /calculateEstimatedCostNanos/);
  assert.match(api, /web_search_requests/);
  assert.match(chatStyles, /\.chat-cost-warning/);
  assert.match(english, /Ledger · read only/);
  assert.match(english, /Live web/);
  assert.match(english, /Estimated cumulative Claude API cost/);
});

test("batches rapid Claude deltas at an adaptive rendering cadence", async () => {
  const {
    createAdaptiveStreamBuffer,
    STREAM_BATCH_SIZE,
    STREAM_BUSY_THRESHOLD,
    STREAM_CATCH_UP_THRESHOLD,
    STREAM_FLUSH_INTERVAL_MS,
  } = await import(new URL("app/chat/adaptive-stream-buffer.ts", root));
  const scheduled = new Map();
  const batches = [];
  let nextTimerId = 0;
  const scheduler = {
    setTimeout(callback, delay) {
      const id = ++nextTimerId;
      scheduled.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      scheduled.delete(id);
    },
  };
  const firstScheduledDelay = () => scheduled.values().next().value?.delay;
  const runNextTimer = () => {
    const next = scheduled.entries().next().value;
    assert.ok(next, "expected a pending stream flush");
    const [id, task] = next;
    scheduled.delete(id);
    task.callback();
  };
  const buffer = createAdaptiveStreamBuffer((batch) => batches.push(batch), scheduler);

  buffer.push("Hel");
  buffer.push("lo");
  assert.equal(scheduled.size, 1);
  assert.equal(firstScheduledDelay(), STREAM_FLUSH_INTERVAL_MS.normal);
  assert.deepEqual(batches, []);
  runNextTimer();
  assert.deepEqual(batches, ["Hello"]);

  buffer.push("a");
  assert.equal(firstScheduledDelay(), STREAM_FLUSH_INTERVAL_MS.normal);
  buffer.push("x".repeat(STREAM_BUSY_THRESHOLD));
  assert.equal(scheduled.size, 1);
  assert.equal(firstScheduledDelay(), STREAM_FLUSH_INTERVAL_MS.busy);
  runNextTimer();
  assert.equal(batches.at(-1).length, STREAM_BATCH_SIZE.busy);
  assert.equal(scheduled.size, 1);
  while (scheduled.size) runNextTimer();
  assert.equal(batches.slice(1).join(""), `a${"x".repeat(STREAM_BUSY_THRESHOLD)}`);

  const catchUpText = "z".repeat(STREAM_CATCH_UP_THRESHOLD);
  const catchUpBatchStart = batches.length;
  buffer.push(catchUpText);
  assert.equal(firstScheduledDelay(), STREAM_FLUSH_INTERVAL_MS.busy);
  runNextTimer();
  assert.equal(batches.at(-1).length, STREAM_BATCH_SIZE.catchUp);
  while (scheduled.size) runNextTimer();
  assert.equal(batches.slice(catchUpBatchStart).join(""), catchUpText);

  buffer.push(" final tail");
  buffer.flush();
  assert.equal(scheduled.size, 0);
  assert.equal(batches.at(-1), " final tail");

  buffer.push("discard this");
  buffer.reset();
  assert.equal(scheduled.size, 0);
  assert.notEqual(batches.at(-1), "discard this");

  buffer.push("dispose this");
  buffer.dispose();
  assert.equal(scheduled.size, 0);
  assert.notEqual(batches.at(-1), "dispose this");
});

test("copies every completed chat message with localized feedback", async () => {
  const [page, styles, ...localeFiles] = await Promise.all([
    readFile(new URL("app/chat/page.tsx", root), "utf8"),
    readFile(new URL("app/chat/chat.css", root), "utf8"),
    ...["en", "hy", "de"].map((locale) => readFile(new URL(`app/i18n/locales/${locale}.json`, root), "utf8")),
  ]);
  const dictionaries = localeFiles.map(JSON.parse);

  assert.match(page, /navigator\.clipboard\.writeText\(message\.content\)/);
  assert.match(page, /copiedMessageId === message\.id/);
  assert.match(page, /className=\{`message-copy-button/);
  assert.match(page, /aria-label=\{copyLabel\}/);
  assert.match(page, /title=\{copyLabel\}/);
  assert.match(page, /setCopiedMessageId\(null\), 1_600/);
  assert.match(page, /chat\.copyFailed/);
  assert.match(styles, /\.message-copy-button:focus-visible/);
  assert.match(styles, /\.message-copy-button\.is-copied/);
  assert.match(styles, /:root\[data-theme="dark"\] \.message-copy-button/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.message-copy-button span \{ display: none/);
  dictionaries.forEach((dictionary) => {
    for (const key of ["copy", "copyMessage", "copied", "copyFailed"]) {
      assert.equal(typeof dictionary.chat[key], "string");
      assert.ok(dictionary.chat[key].length > 0);
    }
  });
});

test("reuses the animated chat geometry behind the main dashboard", async () => {
  const [dashboard, styles, ambientGeometry] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/chat/ambient-geometry.tsx", root), "utf8"),
  ]);
  assert.match(dashboard, /import AmbientGeometry from "\.\/chat\/ambient-geometry"/);
  assert.match(dashboard, /className="dashboard-background" aria-hidden="true"/);
  assert.match(dashboard, /className="dashboard-aurora"/);
  assert.match(dashboard, /<AmbientGeometry \/>/);
  assert.match(styles, /\.dashboard-background \{[^}]*position: fixed[^}]*pointer-events: none/s);
  assert.match(styles, /\.dashboard-background \.ambient-geometry/);
  assert.match(styles, /:root\[data-theme="dark"\] \.dashboard-background \.ambient-geometry/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.dashboard-aurora span \{ animation: none/);
  assert.match(ambientGeometry, /drawConnections/);
  assert.match(ambientGeometry, /Math\.floor\(point\.seed \* 6\)/);
});

function leafKeys(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" ? leafKeys(child, path) : [path];
  });
}

test("supports three persistent UI-only locales without translating stored user data", async () => {
  const localeNames = ["en", "hy", "de"];
  const [provider, switcher, layout, page, chatPage, styles, chatStyles, schema, api, ...localeFiles] = await Promise.all([
    readFile(new URL("app/i18n/provider.tsx", root), "utf8"),
    readFile(new URL("app/language-switcher.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/chat/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/chat/chat.css", root), "utf8"),
    readFile(new URL("database/schema.sql", root), "utf8"),
    readFile(new URL("server/index.ts", root), "utf8"),
    ...localeNames.map((locale) => readFile(new URL(`app/i18n/locales/${locale}.json`, root), "utf8")),
  ]);
  const dictionaries = localeFiles.map(JSON.parse);
  const englishKeys = leafKeys(dictionaries[0]).sort();

  assert.deepEqual(localeNames, ["en", "hy", "de"]);
  dictionaries.slice(1).forEach((dictionary) => assert.deepEqual(leafKeys(dictionary).sort(), englishKeys));
  assert.match(provider, /supportedLocales[^=]*= \["en", "hy", "de"\]/);
  assert.match(provider, /dramatiq-locale/);
  assert.match(switcher, /role="menuitemradio"/);
  assert.match(layout, /allowedLocales = \["en", "hy", "de"\]/);
  assert.match(layout, /document\.documentElement\.dir = "ltr"/);
  assert.doesNotMatch(provider, /"fa"/);
  assert.doesNotMatch(layout, /"fa"/);
  await assert.rejects(readFile(new URL("app/i18n/locales/fa.json", root), "utf8"));
  assert.match(page, /<LanguageSwitcher/);
  assert.match(chatPage, /<LanguageSwitcher/);
  assert.doesNotMatch(styles, /:root\[dir="rtl"\]/);
  assert.doesNotMatch(chatStyles, /:root\[dir="rtl"\]/);
  assert.match(styles, /\.language-trigger \{ height: 40px/);
  assert.match(chatStyles, /\.chat-language-switcher \.language-trigger \{ height: 30px/);

  assert.match(page, /<option value=\{category\} key=\{category\}>\{categoryLabel\(category\)\}<\/option>/);
  assert.match(page, /category: event\.target\.value as ReceiptItem\["category"\]/);
  assert.match(page, /items: draft\.items/);
  assert.match(chatPage, /<strong>\{conversation\.title\}<\/strong>/);
  assert.match(chatPage, /AssistantMarkdown content=\{message\.content\}/);
  assert.match(chatPage, /<div className="message-content">\{message\.content\}<\/div>/);
  assert.doesNotMatch(schema, /dramatiq-locale|data-locale/);
  assert.doesNotMatch(api, /dramatiq-locale|data-locale/);
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
