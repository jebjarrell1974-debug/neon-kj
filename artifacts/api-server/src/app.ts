import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import router from "./routes/index.js";

const app: Express = express();

// #12: credentials: true is incompatible with origin: "*" and serves no purpose
// since there are no auth cookies/headers. Removed credentials flag.
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes always take priority
app.use("/api", router);

// In desktop (Electron) mode the RENDERER_PATH env var points to the built
// React static files. Serve them so the BrowserWindow can load the UI.
const rendererPath = process.env["RENDERER_PATH"];
if (rendererPath && fs.existsSync(rendererPath)) {
  app.use(express.static(rendererPath));
  // SPA fallback — any non-API path returns index.html so React Router works
  app.get("*", (_req, res) => {
    res.sendFile(path.join(rendererPath, "index.html"));
  });
}

export default app;
