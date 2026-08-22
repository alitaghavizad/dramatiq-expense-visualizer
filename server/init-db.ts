import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "./database.js";

const schemaUrl = new URL("../database/schema.sql", import.meta.url);
const schema = await readFile(fileURLToPath(schemaUrl), "utf8");

try {
  await pool.query(schema);
  console.log("PostgreSQL schema is ready: expense and conversation tables created.");
} finally {
  await pool.end();
}
