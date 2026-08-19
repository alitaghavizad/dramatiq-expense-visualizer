import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.7-flash"),
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

export const config = {
  databaseUrl: environment.DATABASE_URL,
  geminiApiKey: environment.GEMINI_API_KEY,
  geminiModel: environment.GEMINI_MODEL,
  apiHost: environment.API_HOST,
  apiPort: environment.API_PORT,
  appOrigins: environment.APP_ORIGIN.split(",").map((origin) => origin.trim()),
} as const;
