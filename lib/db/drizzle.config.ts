import { defineConfig } from "drizzle-kit";
import path from "path";

const dbPath =
  process.env["DB_PATH"] ??
  (process.env["NODE_ENV"] === "production"
    ? "/opt/neon-kj/data/neon-kj.db"
    : path.join(process.cwd(), "data", "dev.db"));

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
