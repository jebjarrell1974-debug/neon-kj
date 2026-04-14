/**
 * Server entry point for Electron desktop builds.
 * Exports startServer() instead of running immediately.
 * The Electron main process sets env vars then calls startServer().
 */
import http from "http";
import appExpress from "./app.js";
import { createWebSocketServer } from "./lib/websocket.js";
import { initSchema } from "./lib/rotation.js";
import { seedSongs } from "./lib/seed.js";

export async function startServer(): Promise<void> {
  const rawPort = process.env["PORT"];
  if (!rawPort) throw new Error("PORT env var is required");

  const port = Number(rawPort);
  if (Number.isNaN(port) || port <= 0)
    throw new Error(`Invalid PORT: "${rawPort}"`);

  await initSchema();
  await seedSongs();

  const server = http.createServer(appExpress);
  createWebSocketServer(server);

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, "0.0.0.0", () => {
      console.log(`[NEON KJ] Server running on port ${port}`);
      resolve();
    });
  });
}
