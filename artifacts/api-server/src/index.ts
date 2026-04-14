import http from "http";
import app from "./app.js";
import { createWebSocketServer } from "./lib/websocket.js";
import { initSchema } from "./lib/rotation.js";
import { seedSongs } from "./lib/seed.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main() {
  await initSchema();
  await seedSongs();

  const server = http.createServer(app);
  createWebSocketServer(server);

  server.listen(port, () => {
    console.log(`[NEON KJ] Server listening on port ${port}`);
    console.log(`[NEON KJ] KJ Panel: http://localhost:${port}/host`);
    console.log(`[NEON KJ] Singer View: http://localhost:${port}/singer`);
  });
}

main().catch((err) => {
  console.error("[NEON KJ] Fatal startup error:", err);
  process.exit(1);
});
