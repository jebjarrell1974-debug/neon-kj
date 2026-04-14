import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";

let wss: WebSocketServer | null = null;

export function createWebSocketServer(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    console.log(`[WS] Client connected from ${req.socket.remoteAddress}`);

    ws.on("close", () => {
      console.log("[WS] Client disconnected");
    });

    ws.on("error", (err) => {
      console.error("[WS] Error:", err.message);
    });
  });

  console.log("[WS] WebSocket server ready on /api/ws");
  return wss;
}

export function broadcast(event: string, data: unknown): void {
  if (!wss) return;
  const payload = JSON.stringify({ event, data });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

export function getClientCount(): number {
  return wss?.clients.size ?? 0;
}
