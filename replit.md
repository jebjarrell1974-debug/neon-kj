# NEON KJ — Karaoke Show Management System

## Overview

A complete, live karaoke show management system. Singers connect via local WiFi, scan a QR code, search songs, and join the rotation queue. The KJ host manages the queue in real time via a desktop control panel. Built to run on an Intel N100 mini PC.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: SQLite (better-sqlite3 + Drizzle ORM) — single file at `./data/dev.db`
- **WebSocket**: Raw `ws` library on `/ws` path (real-time queue updates)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React 19 + Vite + Tailwind CSS 4

## Structure

```text
├── artifacts/
│   ├── api-server/          Express API server (port 8080)
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── rotation.ts    Rotation engine (virtual stage time algorithm)
│   │       │   ├── websocket.ts   WebSocket server + broadcast
│   │       │   └── seed.ts        101 seed songs
│   │       └── routes/
│   │           ├── shows.ts       Show management
│   │           ├── singers.ts     Singer registration
│   │           ├── songs.ts       Song library + search
│   │           ├── queue.ts       Queue add/advance/skip/reorder
│   │           └── utils.ts       QR code, status
│   └── neon-kj/             React frontend (Vite dev server)
│       └── src/
│           ├── pages/
│           │   ├── Host.tsx       KJ control panel (desktop)
│           │   └── Singer.tsx     Singer join/queue view (mobile)
│           └── hooks/
│               └── use-websocket.ts  Real-time queue state
├── lib/
│   ├── api-spec/            OpenAPI spec + Orval codegen config
│   ├── api-client-react/    Generated React Query hooks
│   ├── api-zod/             Generated Zod schemas
│   └── db/                  Drizzle ORM schema + SQLite connection
├── scripts/                 Utility scripts
├── pnpm-workspace.yaml
└── replit.md
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

## Key Config

- `DB_PATH` env var — SQLite file path (default: `./data/dev.db` in dev, `./data/neon-kj.db` in production)
- `PEAK_HOURS_START` / `PEAK_HOURS_END` — peak hours for energy modifier (default: 22, 2)

## Development

- API server: `pnpm --filter @workspace/api-server run dev` (port 8080)
- Frontend: `pnpm --filter @workspace/neon-kj run dev` (auto-assigned port, proxies /api + /ws to 8080)
- Codegen: `pnpm --filter @workspace/api-spec run codegen`
- DB push: `pnpm --filter @workspace/db run push`

## Views

- `/` or `/host` — KJ/Host Panel: queue control, advance/skip/reorder, now-playing strip, QR code
- `/singer` — Singer View: name entry → song search → queue join → position tracker (no wait time shown to singers)

## Design Decisions

- `/` always shows the KJ panel — no screen-width auto-redirect. Singers reach `/singer` via QR code only.
- Wait time is intentionally hidden from singers. The KJ panel shows it; singers just see their position number.
- DB path uses `./data/` relative to working directory in all environments. The `/opt/neon-kj/` path is reserved for future mini PC deployment only (see `docs/future-plans/`).
- QR code shows local network IP — useful at a venue on local WiFi. On the deployed version, singers navigate to `/singer` directly.

## Future Plans (archived)

Bigger features are saved in `docs/future-plans/` and not actively being built:
- `neon-kj-playback.md` — MPV karaoke playback engine + jalv/JACK audio processing
- `neon-kj-singer-pwa.md` — Singer PWA with countdown push notifications
- `neon-kj-ai-dj-analytics.md` — AI DJ announcements (OpenAI + ElevenLabs) + crowd energy analytics + N100 deployment package
