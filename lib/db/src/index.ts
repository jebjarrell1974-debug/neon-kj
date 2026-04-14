import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const dbPath =
  process.env["DB_PATH"] ??
  path.join(process.cwd(), "data", process.env["NODE_ENV"] === "production" ? "neon-kj.db" : "dev.db");

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const client = createClient({ url: `file:${dbPath}` });

export const db = drizzle(client, { schema });

export * from "./schema";
