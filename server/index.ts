import cors from "cors";
import express, { type Request, type Response } from "express";
import helmet from "helmet";
import multer from "multer";
import { rateLimit } from "express-rate-limit";
import { ZodError, z } from "zod";
import { config } from "./config.js";
import { pool, withTransaction } from "./database.js";
import { EXPENSE_CATEGORIES, extractReceipt, ReceiptExtractionError } from "./receipt-extractor.js";

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: config.appOrigins }));
app.use(express.json({ limit: "2mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const accepted = ["image/jpeg", "image/png", "image/webp"];
    if (accepted.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new Error("Only JPG, PNG, and WEBP receipt images are supported."));
    }
  },
});

type QueryValue = string | string[] | undefined;

function first(value: QueryValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function buildExpenseFilter(query: Request["query"]) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };

  const from = first(query.from as QueryValue);
  const to = first(query.to as QueryValue);
  const minPrice = first(query.minPrice as QueryValue);
  const maxPrice = first(query.maxPrice as QueryValue);
  const category = first(query.category as QueryValue);
  const store = first(query.store as QueryValue);
  const search = first(query.search as QueryValue);

  if (from) clauses.push(`e.purchase_date >= ${bind(from)}::date`);
  if (to) clauses.push(`e.purchase_date <= ${bind(to)}::date`);
  if (minPrice && Number.isFinite(Number(minPrice))) clauses.push(`e.total_price >= ${bind(Number(minPrice))}::numeric`);
  if (maxPrice && Number.isFinite(Number(maxPrice))) clauses.push(`e.total_price <= ${bind(Number(maxPrice))}::numeric`);
  if (category) clauses.push(`e.item_category = ${bind(category)}`);
  if (store) clauses.push(`e.store = ${bind(store)}`);
  if (search) {
    const placeholder = bind(search);
    clauses.push(
      `(e.item_name ILIKE '%' || ${placeholder} || '%' OR ` +
        `COALESCE(e.item_name_en, '') ILIKE '%' || ${placeholder} || '%')`,
    );
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function numberValue(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({
      status: "ok",
      database: "connected",
      receipt_extraction: config.geminiApiKey ? "ready" : "api_key_required",
      model: config.geminiModel,
    });
  } catch (error) {
    console.error(error);
    response.status(503).json({ status: "error", database: "unavailable" });
  }
});

app.get("/api/dashboard", async (request, response, next) => {
  try {
    const filter = buildExpenseFilter(request.query);
    const [summaryResult, dailyResult, categoryResult, storeResult, expenseResult, optionsResult] =
      await Promise.all([
        pool.query(
          `SELECT
             COALESCE(SUM(e.total_price), 0) AS total_spent,
             COUNT(*)::int AS item_count,
             COUNT(DISTINCT e.receipt_id)::int AS receipt_count,
             COALESCE(AVG(e.total_price), 0) AS average_item_price
           FROM expenses e ${filter.sql}`,
          filter.values,
        ),
        pool.query(
          `SELECT e.purchase_date::text AS date, SUM(e.total_price) AS total
           FROM expenses e ${filter.sql}
           GROUP BY e.purchase_date ORDER BY e.purchase_date`,
          filter.values,
        ),
        pool.query(
          `SELECT e.item_category AS name, SUM(e.total_price) AS total, COUNT(*)::int AS count
           FROM expenses e ${filter.sql}
           GROUP BY e.item_category ORDER BY total DESC`,
          filter.values,
        ),
        pool.query(
          `SELECT e.store AS name, SUM(e.total_price) AS total, COUNT(*)::int AS count
           FROM expenses e ${filter.sql}
           GROUP BY e.store ORDER BY total DESC LIMIT 8`,
          filter.values,
        ),
        pool.query(
          `SELECT e.id::text, e.receipt_id::text, e.purchase_date::text, e.item_name,
                  e.item_name_en, e.item_category, e.store, e.quantity,
                  e.unit_price, e.total_price, e.currency, e.extraction_confidence
           FROM expenses e ${filter.sql}
           ORDER BY e.purchase_date DESC, e.created_at DESC, e.id DESC
           LIMIT 500`,
          filter.values,
        ),
        pool.query(
          `SELECT
             (SELECT ARRAY_AGG(DISTINCT item_category ORDER BY item_category) FROM expenses) AS categories,
             (SELECT ARRAY_AGG(DISTINCT store ORDER BY store) FROM expenses) AS stores,
             (SELECT MIN(purchase_date)::text FROM expenses) AS min_date,
             (SELECT MAX(purchase_date)::text FROM expenses) AS max_date,
             (SELECT MAX(total_price) FROM expenses) AS max_price`,
        ),
      ]);

    const summary = summaryResult.rows[0];
    const categories = categoryResult.rows.map((row) => ({
      ...row,
      total: numberValue(row.total),
    }));

    response.json({
      summary: {
        total_spent: numberValue(summary.total_spent),
        item_count: summary.item_count,
        receipt_count: summary.receipt_count,
        average_item_price: numberValue(summary.average_item_price),
        top_category: categories[0]?.name ?? null,
        top_category_total: categories[0]?.total ?? 0,
      },
      daily: dailyResult.rows.map((row) => ({ ...row, total: numberValue(row.total) })),
      categories,
      stores: storeResult.rows.map((row) => ({ ...row, total: numberValue(row.total) })),
      expenses: expenseResult.rows.map((row) => ({
        ...row,
        quantity: numberValue(row.quantity),
        unit_price: row.unit_price === null ? null : numberValue(row.unit_price),
        total_price: numberValue(row.total_price),
        extraction_confidence:
          row.extraction_confidence === null ? null : numberValue(row.extraction_confidence),
      })),
      options: {
        categories: optionsResult.rows[0]?.categories ?? [],
        stores: optionsResult.rows[0]?.stores ?? [],
        min_date: optionsResult.rows[0]?.min_date ?? null,
        max_date: optionsResult.rows[0]?.max_date ?? null,
        max_price: numberValue(optionsResult.rows[0]?.max_price),
      },
    });
  } catch (error) {
    next(error);
  }
});

const extractionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many receipt scans. Please wait a few minutes and try again." },
});

app.post("/api/receipts/extract", extractionRateLimit, upload.single("receipt"), async (request, response, next) => {
  try {
    if (!request.file) {
      response.status(400).json({ error: "Choose a receipt image first." });
      return;
    }
    const extraction = await extractReceipt(request.file);
    response.json({
      ...extraction,
      source_filename: request.file.originalname,
      source_mime_type: request.file.mimetype,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "GEMINI_API_KEY_MISSING") {
      response.status(503).json({
        error: "Receipt extraction needs a Google Gemini API key. Add GEMINI_API_KEY to your .env file and restart the app.",
        code: "API_KEY_REQUIRED",
      });
      return;
    }
    next(error);
  }
});

const itemSchema = z.object({
  original_name: z.string().trim().min(1).max(500),
  english_name: z.string().trim().max(500).nullable().optional(),
  category: z.enum(EXPENSE_CATEGORIES),
  quantity: z.number().positive().nullable().optional(),
  unit_price: z.number().nonnegative().nullable().optional(),
  total_price: z.number().nonnegative(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

const receiptSaveSchema = z.object({
  purchase_date: z.iso.date(),
  store: z.string().trim().min(1).max(300),
  receipt_number: z.string().trim().max(200).nullable().optional(),
  receipt_total: z.number().nonnegative().nullable().optional(),
  currency: z.literal("AMD").default("AMD"),
  source_filename: z.string().max(500).nullable().optional(),
  source_mime_type: z.string().max(100).nullable().optional(),
  source_hash: z.string().length(64).nullable().optional(),
  items: z.array(itemSchema).min(1).max(250),
});

app.post("/api/receipts", async (request, response, next) => {
  try {
    const receipt = receiptSaveSchema.parse(request.body);
    const saved = await withTransaction(async (client) => {
      const receiptResult = await client.query(
        `INSERT INTO receipts (
           purchase_date, store, receipt_number, receipt_total, currency,
           source_filename, source_mime_type, source_hash, raw_extraction
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id::text`,
        [
          receipt.purchase_date,
          receipt.store,
          receipt.receipt_number ?? null,
          receipt.receipt_total ?? null,
          receipt.currency,
          receipt.source_filename ?? null,
          receipt.source_mime_type ?? null,
          receipt.source_hash ?? null,
          JSON.stringify(receipt),
        ],
      );
      const receiptId = receiptResult.rows[0].id as string;
      const insertedIds: string[] = [];

      for (const item of receipt.items) {
        const itemResult = await client.query(
          `INSERT INTO expenses (
             receipt_id, purchase_date, item_name, item_name_en, item_category,
             store, quantity, unit_price, total_price, currency, extraction_confidence
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id::text`,
          [
            receiptId,
            receipt.purchase_date,
            item.original_name,
            item.english_name || null,
            item.category,
            receipt.store,
            item.quantity ?? 1,
            item.unit_price ?? null,
            item.total_price,
            receipt.currency,
            item.confidence ?? null,
          ],
        );
        insertedIds.push(itemResult.rows[0].id as string);
      }

      return { receipt_id: receiptId, expense_ids: insertedIds };
    });
    response.status(201).json(saved);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      response.status(409).json({ error: "This receipt has already been saved." });
      return;
    }
    next(error);
  }
});

const manualExpenseSchema = z.object({
  purchase_date: z.iso.date(),
  item_name: z.string().trim().min(1).max(500),
  item_name_en: z.string().trim().max(500).nullable().optional(),
  item_category: z.enum(EXPENSE_CATEGORIES),
  store: z.string().trim().min(1).max(300),
  quantity: z.number().positive().default(1),
  unit_price: z.number().nonnegative().nullable().optional(),
  total_price: z.number().nonnegative(),
});

app.post("/api/expenses", async (request, response, next) => {
  try {
    const expense = manualExpenseSchema.parse(request.body);
    const result = await pool.query(
      `INSERT INTO expenses (
         purchase_date, item_name, item_name_en, item_category, store,
         quantity, unit_price, total_price, currency
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'AMD')
       RETURNING id::text`,
      [
        expense.purchase_date,
        expense.item_name,
        expense.item_name_en ?? null,
        expense.item_category,
        expense.store,
        expense.quantity,
        expense.unit_price ?? null,
        expense.total_price,
      ],
    );
    response.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/expenses/:id", async (request, response, next) => {
  try {
    const id = z.string().regex(/^\d+$/).parse(request.params.id);
    const result = await pool.query("DELETE FROM expenses WHERE id = $1 RETURNING id", [id]);
    if (!result.rowCount) {
      response.status(404).json({ error: "Expense not found." });
      return;
    }
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: Request, response: Response, _next: express.NextFunction) => {
  void _next;
  console.error(error);
  if (error instanceof ZodError) {
    response.status(400).json({ error: "Please check the entered values.", details: error.issues });
    return;
  }
  if (error instanceof multer.MulterError) {
    response.status(400).json({ error: error.code === "LIMIT_FILE_SIZE" ? "Receipt images must be under 12 MB." : error.message });
    return;
  }
  if (error instanceof ReceiptExtractionError) {
    response.status(502).json({ error: error.message });
    return;
  }
  response.status(500).json({ error: "Something went wrong on the server." });
});

const server = app.listen(config.apiPort, config.apiHost, async () => {
  try {
    await pool.query("SELECT 1");
    console.log(`Expense API ready at http://${config.apiHost}:${config.apiPort} (PostgreSQL connected)`);
  } catch {
    console.warn(`Expense API is listening at http://${config.apiHost}:${config.apiPort}, but PostgreSQL is not reachable.`);
  }
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; closing the expense API.`);
  server.close(async (error) => {
    await pool.end();
    process.exit(error ? 1 : 0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
