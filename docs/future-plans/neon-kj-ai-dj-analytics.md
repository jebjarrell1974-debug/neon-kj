# NEON KJ — AI DJ Voice, Show Analytics & Deployment Package

## What & Why
Add the automated DJ announcer (OpenAI script + ElevenLabs voice) and crowd energy tracking. The ambient USB mic auto-scores crowd response after each song. Analytics give the host a live view of the show's energy curve. Everything degrades gracefully offline. The task ends with a complete deployment package — a single `install.sh` that turns a fresh Intel N100 mini PC running Ubuntu 22.04 into a ready-to-run NEON KJ appliance.

## Architecture Constraints (N100-first)
- **OpenAI via Replit AI Integrations proxy** — no user API key. Falls back to template script when offline.
- **ElevenLabs via Replit Connector integration** — credentials stored as env vars. Falls back to `espeak` (available on Ubuntu/Debian) when offline.
- **Announcement audio playback** — MP3 from ElevenLabs saved to `/opt/neon-kj/cache/announcements/` (keyed by MD5 hash of script text), played via MPV through Scarlett 2i2 → PA system. Repeated singer/song combos reuse cache with no API call.
- **Crowd energy** — pure formula, zero ML, zero GPU: `energy_score = (bpm_factor(bpm) + crowd_response_normalized + energy_base) / 3`. `bpm_factor` maps the song's auto-tagged BPM to a 1-10 scale. `energy_base` comes from the library scanner's BPM-derived default or ID3 tag. Runs in microseconds in Node.js.
- **Ambient USB mic auto-scoring** — applause amplitude from Task 2's Python service populates `crowd_response`. KJ can always override.
- **No heavy analytics libraries** — SQLite aggregation queries, lightweight inline SVG chart.
- **Deployment target** — Ubuntu 22.04 LTS x86-64 on Intel N100 mini PC.

## Done looks like
- On queue advance, system generates and plays a DJ announcement in a polished radio-DJ voice via ElevenLabs
- KJ panel shows announcement preview text, generating/playing/ready status, Skip/Replay buttons
- Live crowd energy gauge (1-10) and mini energy curve chart on KJ panel — fed automatically by USB mic applause detection, all with BPM-derived baseline so values are meaningful from the first song
- Analytics tab: total singers, songs performed, avg wait time, top genres, energy curve for the evening
- Offline: template announcements + `espeak` — show runs without interruption
- Peak hours (10pm-2am, configurable): high-energy songs get -2 virtual minute priority boost
- Slow song alert: if last 3 performances all scored < 4 energy, KJ panel shows "Consider a high-energy pick!"
- `install.sh` on a fresh Ubuntu 22.04 N100 box produces a fully configured, running system. First-time venue deployment should budget 20-30 minutes beyond the install itself to tune the JACK buffer size for the specific machine — this is the #1 site-specific variable and is not predictable in advance.

## Out of scope
- AI karaoke track generation (future)
- Singer performance scoring (future)
- Multi-venue cloud management (future)
- Tip integration (future)

## Tasks
1. **ElevenLabs integration** — Wire ElevenLabs Replit connector. Create `artifacts/api-server/src/lib/voice-synth.ts`. `generateAnnouncement(text)` calls ElevenLabs API, caches MP3 to `/opt/neon-kj/cache/announcements/<md5>.mp3`, returns file path. Falls back to `espeak` subprocess on error or offline.

2. **OpenAI script generation** — `artifacts/api-server/src/lib/script-gen.ts`. `generateAnnouncementScript(singerName, songTitle, artist, context)` calls Replit OpenAI proxy. System prompt: NEON KJ persona — energetic, punchy nightclub DJ, 1-2 sentences max. Contextual variation: first singer of night, milestones, energy context. Falls back to template string offline.

3. **Announcement pipeline** — `artifacts/api-server/src/lib/announcer.ts`. On rotation advance: (1) generate script, (2) synthesize voice, (3) play via MPV through Scarlett 2i2. Pre-generates next announcement while current song plays. Caches all generated audio — repeated singer/song combos hit cache, no duplicate API call.

4. **Announcement API + KJ controls** — `POST /api/announcements/trigger`, `POST /api/announcements/skip`, `GET /api/announcements/status`. KJ panel: preview text, status badge (generating/ready/playing), Skip and Replay buttons, Auto-announce toggle.

5. **Crowd energy tracking** — `crowd_response` and `energy_score` fields on `performances` table. Ambient USB mic auto-populates `crowd_response` via applause detection. `bpm_factor` is derived from the song's `bpm` field (populated at scan time in Task 1 — not null). Energy formula applied server-side. KJ can override. All stored per-performance in SQLite.

6. **Peak hours energy modifier** — Rotation engine reads `PEAK_HOURS_START` / `PEAK_HOURS_END` env vars (default `22:00` / `02:00`). During peak: songs with energy_score > 7 subtract 2 from singer's effective virtual_stage_time. Slow song limiter: if last 3 performances scored < 4, push `low_energy_alert` WebSocket event to KJ panel.

7. **Analytics dashboard** — New Analytics tab in KJ panel: tonight's stats summary card, energy curve (inline SVG line chart, no external chart library), top 5 genres by request count, full performance log (singer, song, wait time, energy score). All from SQLite `GROUP BY` / `AVG` / `COUNT` — instant on NVMe.

8. **N100 deployment package** — `scripts/src/build-deploy.ts`: (1) React production build, (2) esbuild API server bundle, (3) generates `deploy/` directory:

   `deploy/dist/` — complete built app

   `deploy/install.sh` — full setup for fresh Ubuntu 22.04 x86-64:
   - Installs Node.js 20 LTS via NodeSource
   - Installs: `mpv`, `jackd2`, `jalv`, `espeak`, `ffmpeg`, `bpm-tools`, `rubberband-ladspa`, `ladspa-sdk`, `swh-plugins`, `mbeq`, `tap-plugins`, `python3`, `python3-pip`, `python3-sounddevice`, `python3-librosa`, `numpy`, `pyaudio`
   - Creates `/opt/neon-kj/` directory structure including `config/` for jalv-ports.json and jack-patch.json
   - Interactive `.env` prompts:
     - `LIBRARY_PATH` — path to karaoke file library
     - `BREAK_MUSIC_PATH` — path to break music directory
     - `AUDIO_DEVICE` — auto-detected from aplay -l, shown for confirmation
     - `JACK_BUFFER_FRAMES` — prompted with explanation: "256 = 5ms (aggressive, may xrun), 1024 = 21ms (recommended), 2048 = 42ms (very stable)". Default 1024. **This is the #1 setting to tune per-venue.** The install README explains how to test for xruns (`jack_iodelay`) and adjust.
     - `LYRICS_DISPLAY` — display index for MPV fullscreen (0 or 1, default 1)
     - `PEAK_HOURS_START` / `PEAK_HOURS_END`
     - `ELEVENLABS_API_KEY`
     - `PORT`
   - Disables PulseAudio autostart for the neon-kj system user (prevents JACK conflicts)
   - Writes jalv-ports.json and jack-patch.json with hardcoded port assignments and JACK connection map
   - Enables and starts `neon-kj.service` and `neon-kj-ambient.service`

   `deploy/neon-kj.service` — systemd unit:
   ```
   [Unit]
   Description=NEON KJ Karaoke Server
   After=network.target sound.target

   [Service]
   ExecStart=node /opt/neon-kj/dist/index.cjs
   Restart=always
   RestartSec=5
   Environment=NODE_ENV=production
   EnvironmentFile=/opt/neon-kj/.env
   WorkingDirectory=/opt/neon-kj

   [Install]
   WantedBy=multi-user.target
   ```

   `deploy/neon-kj-ambient.service` — systemd unit for Python ambient monitor sidecar

   `deploy/README-hardware.md` — hardware setup guide covering:
   - Scarlett 2i2: USB connection, phantom power button, XLR mic wiring
   - USB ambient mic: placement recommendation (aimed at audience seating, not stage, not PA speakers)
   - Dual display setup: which port goes to operator monitor (display 0), which goes to venue projector/TV (display 1, MPV fullscreen). Note: display index may need adjustment in `.env` depending on cable order — procedure documented.
   - PA connection: balanced TRS from Scarlett outputs to house mixer inputs
   - Wireless mic receiver: connect receiver output to venue mixer (not to Scarlett — the Scarlett handles wired mics only)
   - JACK buffer tuning: how to run `jack_iodelay` to test for xruns, when to increase `JACK_BUFFER_FRAMES`, and what xrun log messages look like

## Relevant files
- `artifacts/api-server/src/lib/voice-synth.ts`
- `artifacts/api-server/src/lib/script-gen.ts`
- `artifacts/api-server/src/lib/announcer.ts`
- `artifacts/api-server/src/routes/index.ts`
- `lib/api-spec/openapi.yaml`
- `scripts/src/build-deploy.ts`
- `scripts/package.json`
