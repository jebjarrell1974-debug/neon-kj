# NEON KJ — Karaoke Show Management System

## Overview

A complete, live karaoke show management system. Singers connect via local WiFi, scan a QR code, search songs, and join the rotation queue. The KJ host manages the queue in real time via a desktop control panel. Packaged as an offline Windows/macOS desktop app via Electron.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 20+
- **Package manager**: pnpm
- **TypeScript**: 5.x
- **API framework**: Express 5
- **Database**: SQLite via `@libsql/client` + Drizzle ORM — single file
- **WebSocket**: Raw `ws` library on `/api/ws` (real-time queue updates)
- **Validation**: Zod, `drizzle-zod`
- **Build**: esbuild (CJS bundle for server), Vite (React frontend)
- **Frontend**: React 19 + Vite + Tailwind CSS 4
- **Desktop**: Electron 33 + electron-builder (Windows/macOS installers)

## Structure

```text
├── artifacts/
│   ├── api-server/          Express API + WebSocket server
│   │   ├── src/
│   │   │   ├── index.ts           Standalone entry (reads env vars, starts server)
│   │   │   ├── electron-entry.ts  Electron entry (exports startServer())
│   │   │   ├── app.ts             Express app (serves React static in Electron mode)
│   │   │   ├── lib/
│   │   │   │   ├── rotation.ts    Rotation engine (virtual stage time algorithm)
│   │   │   │   ├── websocket.ts   WebSocket server + broadcast
│   │   │   │   └── seed.ts        618-song demo library
│   │   │   └── routes/
│   │   │       ├── shows.ts       Show management
│   │   │       ├── singers.ts     Singer registration
│   │   │       ├── songs.ts       Song library + search
│   │   │       ├── queue.ts       Queue add/advance/skip/reorder
│   │   │       ├── utils.ts       QR code (auto-detects LAN IP), status
│   │   │       └── health.ts      /api/healthz
│   │   └── build.ts           esbuild script → dist/index.cjs + dist/electron-entry.cjs
│   ├── neon-kj/             React frontend (Vite dev server)
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── Host.tsx       KJ control panel
│   │       │   ├── Singer.tsx     Singer join/queue view (mobile)
│   │       │   └── Crowd.tsx      Crowd display (TV screen)
│   │       └── hooks/
│   │           └── use-websocket.ts  WS URL = window.location.host (works in Electron)
│   └── electron/            Desktop app packaging
│       ├── src/
│       │   ├── main.ts      Electron main process (finds port, starts server, opens window)
│       │   └── preload.ts   Context isolation preload
│       ├── electron-builder.yml
│       └── package.json
├── lib/
│   ├── api-spec/            OpenAPI spec + Orval codegen config
│   ├── api-client-react/    Generated React Query hooks
│   ├── api-zod/             Generated Zod schemas
│   └── db/                  Drizzle ORM schema + libsql connection
├── .github/workflows/
│   └── build-electron.yml   GitHub Actions: builds .exe (Windows) and .dmg (macOS)
├── scripts/
└── pnpm-workspace.yaml
```

## Rotation Algorithm

Every singer has a `virtualStageTimeMinutes` starting at -10 (head start):
- **Next singer** = lowest virtual_stage_time
- **After performing** = virtual_stage_time += song.duration_minutes
- **Wait time** = sum of durations for all singers ahead
- **Peak hours modifier** (10pm-2am): songs with energy > 7 get -2 min effective boost
- **Slow song alert**: if last 3 songs all < 4 energy → `low_energy_alert` WebSocket event

## WebSocket Events

All events follow `{ event: string, data: unknown }` format:
- `queue_update` — full QueueState, broadcast after every queue change
- `now_playing` — the current performer
- `singer_called` — stage notification (performing | next | soon)
- `low_energy_alert` — last 3 songs were low-energy
- `show_started` / `show_ended`

## Key Config / Env Vars

| Variable | Purpose |
|---|---|
| `PORT` | Server port (required) |
| `DB_PATH` | SQLite file path (default: `./data/dev.db` in dev) |
| `RENDERER_PATH` | Path to built React files (Electron mode only) |
| `BASE_PATH` | Vite base URL for React build (use `/` for Electron) |
| `PUBLIC_URL` | Override QR code URL (optional, for cloud deployments) |

## Development (Replit web app)

```bash
# API server (port 8080)
pnpm --filter @workspace/api-server run dev

# React frontend (Vite, auto-port, proxies /api and /api/ws to 8080)
pnpm --filter @workspace/neon-kj run dev

# DB push
pnpm --filter @workspace/db run push

# API codegen
pnpm --filter @workspace/api-spec run codegen
```

## Desktop Build (Electron .exe / .dmg)

Triggered automatically by GitHub Actions when you push a tag (`v1.0.0`, etc.) or via manual dispatch.

**How the Electron app works:**
1. Main process finds a free TCP port dynamically
2. Sets `PORT`, `DB_PATH` (userData dir), `RENDERER_PATH`, `NODE_ENV=production`
3. `require()`s `server.cjs` (bundled Express server) — it reads env vars at load time
4. Calls `startServer()` — starts Express + WebSocket on 0.0.0.0:{port}
5. Opens BrowserWindow → `http://localhost:{port}/host`
6. Express serves the React static files (`renderer/`) for all non-API routes
7. QR code auto-detects LAN IP → `http://{IP}:{port}/singer` for singers

**Build manually (on Windows/macOS):**
```bash
# 1. Build React frontend
PORT=3001 BASE_PATH=/ NODE_ENV=production pnpm --filter @workspace/neon-kj run build

# 2. Build API server (produces electron-entry.cjs)
pnpm --filter @workspace/api-server run build

# 3. Copy artifacts into electron package
cp artifacts/api-server/dist/electron-entry.cjs artifacts/electron/server.cjs
cp -r artifacts/neon-kj/dist/public artifacts/electron/renderer

# 4. Copy native libsql binary for target platform
mkdir -p artifacts/electron/node_modules/@libsql
cp -r node_modules/@libsql/client artifacts/electron/node_modules/@libsql/client
cp -r node_modules/@libsql/win32-x64-msvc artifacts/electron/node_modules/@libsql/win32-x64-msvc  # Windows only

# 5. Build Electron app
cd artifacts/electron
npm install
npx tsc
npx electron-builder --win  # or --mac
```

## Views / Routes

- `/` or `/host` — KJ/Host Panel: queue control, advance/skip/reorder, now-playing strip, QR code
- `/singer` — Singer View: name entry → song search → queue join → position tracker
- `/crowd` — Crowd Display: now-playing + up-next shown on a TV/projector

## Design Decisions

- `/` always shows the KJ panel — no screen-width auto-redirect. Singers reach `/singer` via QR code only.
- Wait time is intentionally hidden from singers. The KJ panel shows it; singers just see their position number.
- In Electron, the server and renderer are on the same HTTP server, so the WebSocket URL (`window.location.host`) and relative API calls (`/api/...`) both work without any changes to the React code.
- QR code uses LAN IP detection (no `x-forwarded-host` in Electron) — singers connect from their phones on the same WiFi.
- `DB_PATH` in Electron uses `app.getPath('userData')` so the database persists across app updates.

## Song Library

618 unique songs. Audited — duplicates removed, durations corrected, energy scores verified.

## Future Plans (archived)

Bigger features are saved in `docs/future-plans/` and not actively being built:
- `neon-kj-playback.md` — MPV karaoke playback engine
- `neon-kj-singer-pwa.md` — Singer PWA with countdown push notifications
- `neon-kj-ai-dj-analytics.md` — AI DJ announcements + crowd energy analytics
