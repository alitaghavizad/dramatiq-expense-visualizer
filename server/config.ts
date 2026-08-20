import "dotenv/config";
import { z } from "zod";

const optionalNonemptyString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const environmentSchema = z.object({
  DATABASE_URL: optionalNonemptyString,
  POSTGRES_USER: z.string().min(1).default("postgres"),
  POSTGRES_PASSWORD: z.string().min(1).default("postgres"),
  POSTGRES_DB: z.string().min(1).default("expense_visualizer"),
  POSTGRES_HOST: z.string().min(1).default("localhost"),
  POSTGRES_PORT: z.coerce.number().int().min(1).max(65_535).default(5432),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.7-flash"),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(600_000).default(180_000),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  APP_ORIGIN: z.string().min(1).default("http://localhost:3000"),
});

const result = environmentSchema.safeParse(process.env);

if (!result.success) {
  const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid environment configuration: ${fields}. Copy .env.example to .env and review its values.`);
}

const environment = result.data;

const databaseUrl =
  environment.DATABASE_URL ??
  `postgresql://${encodeURIComponent(environment.POSTGRES_USER)}:${encodeURIComponent(environment.POSTGRES_PASSWORD)}` +
    `@${environment.POSTGRES_HOST}:${environment.POSTGRES_PORT}/${encodeURIComponent(environment.POSTGRES_DB)}`;

export const config = {
  databaseUrl,
  geminiApiKey: environment.GEMINI_API_KEY,
  geminiModel: environment.GEMINI_MODEL,
  geminiTimeoutMs: environment.GEMINI_TIMEOUT_MS,
  apiHost: environment.API_HOST,
  apiPort: environment.API_PORT,
  appOrigins: environment.APP_ORIGIN.split(",").map((origin) => origin.trim()),
} as const;
