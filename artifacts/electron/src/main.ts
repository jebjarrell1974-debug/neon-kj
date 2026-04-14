import { app, BrowserWindow, Menu, shell, dialog, screen } from "electron";
import path from "path";
import net from "net";
import http from "http";
import { networkInterfaces } from "os";

const isDev = !app.isPackaged;

let serverPort = 3001;
let mainWindow: BrowserWindow | null = null;
let crowdWindow: BrowserWindow | null = null;

// ── Path helpers ──────────────────────────────────────────────────────────────

function getServerPath(): string {
  if (isDev) {
    return path.join(
      __dirname,
      "..",
      "..",
      "api-server",
      "dist",
      "electron-entry.cjs"
    );
  }
  return path.join(app.getAppPath(), "server.cjs");
}

function getRendererPath(): string {
  if (isDev) {
    return path.join(__dirname, "..", "..", "neon-kj", "dist", "public");
  }
  return path.join(app.getAppPath(), "renderer");
}

function getDbPath(): string {
  return path.join(app.getPath("userData"), "neon-kj.db");
}

// ── Network helpers ────────────────────────────────────────────────────────────

function getLocalIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const netList = nets[name];
    if (!netList) continue;
    for (const iface of netList) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as net.AddressInfo;
      server.close(() => resolve(addr.port));
    });
  });
}

function waitForServer(port: number, maxMs = 15_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(
        `http://127.0.0.1:${port}/api/healthz`,
        (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            retry();
          }
          res.resume();
        }
      );
      req.on("error", retry);
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - start > maxMs) {
        reject(new Error("Server did not start within 15 seconds."));
      } else {
        setTimeout(check, 400);
      }
    };
    check();
  });
}

// ── Server startup ─────────────────────────────────────────────────────────────

async function startServer(port: number): Promise<void> {
  const serverPath = getServerPath();
  const dbPath = getDbPath();
  const rendererPath = getRendererPath();

  // Set env vars BEFORE requiring so the db module reads the correct DB_PATH
  process.env["PORT"] = String(port);
  process.env["DB_PATH"] = dbPath;
  process.env["NODE_ENV"] = "production";
  process.env["RENDERER_PATH"] = rendererPath;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const serverModule = require(serverPath) as {
    startServer: () => Promise<void>;
  };
  await serverModule.startServer();
}

// ── Windows ────────────────────────────────────────────────────────────────────

function createMainWindow(port: number): void {
  // Always open the KJ panel on the primary display
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y } = primaryDisplay.bounds;

  mainWindow = new BrowserWindow({
    x: x + 40,
    y: y + 40,
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "NEON KJ — Control Panel",
    backgroundColor: "#0a0a0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://localhost:${port}/host`);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function createCrowdWindow(port: number): boolean {
  const displays = screen.getAllDisplays();
  const secondDisplay = displays.find(
    (d) => d.id !== screen.getPrimaryDisplay().id
  );

  if (!secondDisplay) return false;

  crowdWindow = new BrowserWindow({
    x: secondDisplay.bounds.x,
    y: secondDisplay.bounds.y,
    width: secondDisplay.bounds.width,
    height: secondDisplay.bounds.height,
    fullscreen: true,
    title: "NEON KJ — Crowd Display",
    backgroundColor: "#0a0a0f",
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  crowdWindow.loadURL(`http://localhost:${port}/crowd`);

  crowdWindow.on("closed", () => {
    crowdWindow = null;
  });

  return true;
}

// ── App menu ───────────────────────────────────────────────────────────────────

function buildMenu(port: number, ip: string, hasCrowdScreen: boolean): void {
  const menu = Menu.buildFromTemplate([
    {
      label: "NEON KJ",
      submenu: [
        {
          label: "About NEON KJ",
          click: () => {
            dialog.showMessageBox({
              title: "NEON KJ",
              message: "NEON KJ — Karaoke Rotation System",
              detail: [
                `Running on port ${port}`,
                `Singer URL: http://${ip}:${port}/singer`,
                hasCrowdScreen
                  ? "Crowd display is open on your second screen."
                  : "No second display detected — use Screens → Open Crowd Display.",
              ].join("\n"),
            });
          },
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "CmdOrCtrl+Q",
          click: () => app.quit(),
        },
      ],
    },
    {
      label: "Screens",
      submenu: [
        {
          label: "KJ Control Panel",
          accelerator: "CmdOrCtrl+1",
          click: () => mainWindow?.loadURL(`http://localhost:${port}/host`),
        },
        { type: "separator" },
        {
          label: hasCrowdScreen
            ? "Crowd Display (on second screen)"
            : "Open Crowd Display in Browser",
          accelerator: "CmdOrCtrl+2",
          click: () => {
            if (crowdWindow) {
              crowdWindow.focus();
            } else {
              // No second display — open in the default browser instead
              shell.openExternal(`http://localhost:${port}/crowd`);
            }
          },
        },
        {
          label: "Reopen Crowd on Second Screen",
          enabled: displays().length > 1,
          click: () => {
            if (crowdWindow) crowdWindow.close();
            const opened = createCrowdWindow(port);
            if (!opened) {
              dialog.showMessageBox({
                message: "No second display detected.",
                detail:
                  "Connect a second monitor or TV and try again.",
              });
            }
          },
        },
        { type: "separator" },
        {
          label: `Singer URL: http://${ip}:${port}/singer`,
          enabled: false,
        },
      ],
    },
    {
      label: "Dev",
      submenu: [{ role: "reload" }, { role: "toggleDevTools" }],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

function displays() {
  return screen.getAllDisplays();
}

// ── App lifecycle ──────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  try {
    serverPort = await getFreePort();
    await startServer(serverPort);

    const ip = getLocalIP();

    // Open KJ panel first
    createMainWindow(serverPort);

    // Auto-open crowd display on the second monitor if one is connected
    const hasCrowdScreen = createCrowdWindow(serverPort);

    if (hasCrowdScreen) {
      console.log("[NEON KJ Desktop] Second display detected — crowd screen opened.");
    } else {
      console.log("[NEON KJ Desktop] No second display — use Screens menu to open crowd display.");
    }

    buildMenu(serverPort, ip, hasCrowdScreen);

    console.log(`[NEON KJ Desktop] KJ Panel  → http://localhost:${serverPort}/host`);
    console.log(`[NEON KJ Desktop] Crowd      → http://localhost:${serverPort}/crowd`);
    console.log(`[NEON KJ Desktop] Singer URL → http://${ip}:${serverPort}/singer`);
  } catch (err) {
    dialog.showErrorBox(
      "NEON KJ — Startup Failed",
      err instanceof Error ? err.message : String(err)
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) {
    createMainWindow(serverPort);
  }
});
