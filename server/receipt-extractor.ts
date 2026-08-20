import { createHash } from "node:crypto";
import { z } from "zod";
import { config } from "./config.js";

export class ReceiptExtractionError extends Error {
  override name = "ReceiptExtractionError";
}

export const EXPENSE_CATEGORIES = [
  "Groceries",
  "Dining",
  "Transport",
  "Household",
  "Health",
  "Personal care",
  "Entertainment",
  "Clothing",
  "Utilities",
  "Other",
] as const;

const extractedReceiptSchema = z.object({
  store: z.string().nullable(),
  receipt_date: z.string().nullable(),
  receipt_number: z.string().nullable(),
  currency: z.literal("AMD"),
  receipt_total: z.number().nonnegative().nullable(),
  items: z.array(
    z.object({
      original_name: z.string().min(1),
      english_name: z.string().nullable(),
      category: z.enum(EXPENSE_CATEGORIES),
      quantity: z.number().positive().nullable(),
      unit_price: z.number().nonnegative().nullable(),
      total_price: z.number().nonnegative(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export type ExtractedReceipt = z.infer<typeof extractedReceiptSchema>;

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "store",
    "receipt_date",
    "receipt_number",
    "currency",
    "receipt_total",
    "items",
  ],
  properties: {
    store: { type: ["string", "null"] },
    receipt_date: {
      type: ["string", "null"],
      description: "Receipt date in YYYY-MM-DD format, or null if unreadable",
    },
    receipt_number: { type: ["string", "null"] },
    currency: { type: "string", enum: ["AMD"] },
    receipt_total: { type: ["number", "null"], minimum: 0 },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "original_name",
          "english_name",
          "category",
          "quantity",
          "unit_price",
          "total_price",
          "confidence",
        ],
        properties: {
          original_name: {
            type: "string",
            description: "Item name exactly as printed, normally Armenian",
          },
          english_name: {
            type: ["string", "null"],
            description: "Concise English translation without inventing brand details",
          },
          category: { type: "string", enum: EXPENSE_CATEGORIES },
          quantity: { type: ["number", "null"], minimum: 0.001 },
          unit_price: { type: ["number", "null"], minimum: 0 },
          total_price: { type: "number", minimum: 0 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
} as const;

function responseText(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload.steps)) return undefined;

  for (const step of payload.steps as Array<Record<string, unknown>>) {
    if (!Array.isArray(step.content)) continue;
    for (const content of step.content as Array<Record<string, unknown>>) {
      if (content.type === "text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return undefined;
}

export async function extractReceipt(
  file: Express.Multer.File,
): Promise<ExtractedReceipt & { file_hash: string }> {
  const apiKey = config.geminiApiKey;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY_MISSING");
  }

  const fileHash = createHash("sha256").update(file.buffer).digest("hex");
  const imageData = file.buffer.toString("base64");
  const model = config.geminiModel;

  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
        "Api-Revision": "2026-05-20",
      },
      signal: AbortSignal.timeout(config.geminiTimeoutMs),
      body: JSON.stringify({
        model,
        store: false,
        input: [
          {
            type: "text",
            text: "You extract Armenian retail receipts into reliable purchase records. Read Armenian and Russian text. Never invent unreadable values. Prices are normally Armenian dram. Return every purchased line item, but exclude receipt totals, subtotals, tax, discounts, payment methods, loyalty balances, and change. For weighted products, quantity may be kilograms and unit_price the per-kilogram price. Categorize by what the product is, not by the store. Re-check that item totals align with the receipt total when visible. Preserve each original printed item name and add a concise English translation. Use null for any unreadable optional field.",
          },
          { type: "image", data: imageData, mime_type: file.mimetype },
        ],
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: jsonSchema,
        },
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ReceiptExtractionError("Receipt recognition timed out. Please try again.");
    }
    throw new ReceiptExtractionError("Could not reach Google Gemini. Check your internet connection and try again.");
  }

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const apiError = payload.error as { message?: string } | undefined;
    throw new ReceiptExtractionError(apiError?.message ?? `Gemini request failed (${response.status})`);
  }

  const text = responseText(payload);
  if (!text) throw new ReceiptExtractionError("The receipt could not be read. Try a clearer photo.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ReceiptExtractionError("The receipt extraction returned invalid data. Please try again.");
  }

  const receipt = extractedReceiptSchema.safeParse(parsed);
  if (!receipt.success) {
    throw new ReceiptExtractionError("Gemini returned receipt data in an unexpected format. Please try again.");
  }
  return { ...receipt.data, file_hash: fileHash };
}
