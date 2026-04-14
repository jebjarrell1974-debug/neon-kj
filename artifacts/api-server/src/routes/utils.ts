import { Router } from "express";
import type { Request } from "express";
import QRCode from "qrcode";
import { networkInterfaces } from "os";
import { getClientCount } from "../lib/websocket.js";

const router = Router();

function getLocalIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const net = nets[name];
    if (!net) continue;
    for (const iface of net) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

function getSingerUrl(req: Request): string {
  // 1. Explicit override via env var (e.g. set in Replit Secrets as PUBLIC_URL)
  if (process.env["PUBLIC_URL"]) {
    return `${process.env["PUBLIC_URL"].replace(/\/$/, "")}/singer`;
  }

  // 2. Deployed: Replit (and most reverse proxies) set x-forwarded-host
  const forwardedHost = req.headers["x-forwarded-host"] as string | undefined;
  const forwardedProto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}/singer`;
  }

  // 3. Local dev fallback — use the machine's LAN IP so phones on the same WiFi can reach it
  const ip = getLocalIP();
  const port = process.env["PORT"] ?? "8080";
  return `http://${ip}:${port}/singer`;
}

router.get("/qrcode", async (req, res) => {
  try {
    const url = getSingerUrl(req);
    const qr = await QRCode.toDataURL(url, { width: 600, margin: 2 });
    return res.json({ url, qrDataUrl: qr });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to generate QR code" });
  }
});

router.get("/status", (_req, res) => {
  return res.json({ wsClients: getClientCount() });
});

export default router;
