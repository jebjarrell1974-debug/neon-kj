# NEON KJ — Karaoke Playback Engine & Audio Processing

## What & Why
MPV is the karaoke playback engine. It replaced VLC for three concrete reasons: MPV's IPC is a clean JSON-over-Unix-socket protocol that reliably responds to every command and returns structured state, whereas VLC's RC interface is a text-line protocol with known quirks under load; MPV has frame-accurate seeking and correct A/V sync on MP4/MKV files; and MPV was purpose-built as a media player with a clean subprocess API, where VLC was not. CDG+MP3 pairs are converted to MP4 at library scan time (Task 1) so the playback engine always receives standard video files — CDG never touches this layer.

Real-time pitch shifting uses the Rubberband LADSPA plugin on MPV's JACK output. MPV routes audio to JACK via `--ao=jack`, then Rubberband sits in the JACK graph and accepts live parameter updates via OSC at ~5ms response time.

## Hardware in This Task
- **Focusrite Scarlett 2i2 4th Gen** — USB audio interface. 2 XLR/TRS combo inputs with preamps and phantom power, balanced TRS outputs → house PA/mixer. Full ALSA kernel driver support on Ubuntu/Debian x86-64, zero configuration needed beyond plugging in.
- **USB Ambient Microphone** — any inexpensive USB desktop mic (~$8-15). Plugs into a spare USB port on the N100. Used only for room analysis — never routed to PA output.
- **N100 has its own cooling** — fanless chassis or built-in fan. No active cooler purchase needed. CPU stays cool at ~29% sustained load.
- **Dual display** — N100 has HDMI + secondary display output. Display 1: KJ panel (browser). Display 2: lyrics/video (MPV fullscreen). These are separate physical outputs, not a split-screen.

## Architecture Constraints (N100-first)

### Display layout
- MPV launched with `--fs --screen=1` (or equivalent for the connected display index) to go fullscreen on the venue-facing projector/TV
- KJ panel browser runs on display 0 (the operator-facing monitor at the machine)
- Display assignment is configured in `install.sh` via prompted `LYRICS_DISPLAY` env var (default `1`). KJ can override at runtime via `PATCH /api/playback/display`
- This applies to both karaoke video (MPV fullscreen) and the idle/break state (MPV shows a looping branded screen or black)

### Single-device JACK setup (Scarlett 2i2)
- JACK server targets Scarlett 2i2 ALSA device (`hw:Scarlett2i2`)
- **Buffer size: 1024 frames at 48kHz = 21.3ms latency** — deliberately conservative. 256 frames (5.3ms) sounds lower-latency on paper but causes xruns under real N100 load (Node.js WebSocket spikes, MPV decode, LADSPA chains all compete). 21ms is imperceptible for karaoke — the music is playing at room volume, nobody detects it. The buffer size is exposed as a configurable env var (`JACK_BUFFER_FRAMES`, default `1024`) and as an interactive prompt in `install.sh`, since the right value varies by venue machine. Tune up (2048) if xruns persist; tune down (512) only if latency is genuinely perceptible.
- x86-64: all JACK plugins, LADSPA libraries, and MPV JACK output available natively — no ARM build concerns
- JACK started by watchdog on server startup — not fire-and-forget
- Fallback mode (see Audio Watchdog section): MPV switches to `--ao=alsa`, mics bypassed, show continues

### Plugin host: jalv vs carla-rack
Carla-rack headless (`carla-rack --no-gui`) is the natural choice for hosting multiple LADSPA plugins under JACK, but it has a real practical problem: the OSC paths it assigns to plugin parameters depend on plugin load order and are not stable across restarts. A `setParam()` call to the wrong path silently does nothing — there is no error, the plugin simply doesn't update. Debugging this in a live show is painful.

**jalv** is the safer alternative. It hosts one LV2/LADSPA plugin per process with a predictable, stable OSC path structure. Tradeoffs:

| | carla-rack | jalv |
|---|---|---|
| Processes | 1 (all plugins) | 1 per plugin instance (~10 for full chain) |
| OSC path stability | Load-order dependent, can shift | Stable and predictable |
| Debugging | Silent failures | Straightforward |
| CPU overhead | Slightly lower | Slightly higher (process overhead) |
| Maturity | More features | Simpler, more focused |

**Decision**: Use jalv as the default plugin host. The extra processes are trivial on the N100 (each jalv instance is ~1-2MB RAM). Predictable OSC paths are worth more than slightly lower process count in a live environment. carla-rack remains documented as an alternative if jalv causes issues with a specific plugin.

Each LADSPA plugin in the chain is launched as a separate jalv instance with `--control` OSC port assigned at a known, hardcoded address. The audio-watchdog stores the full set of jalv pids and their OSC port assignments. On recovery, all jalv instances are killed and restarted cleanly.

### Audio subsystem state machine (the watchdog)
Linux pro-audio plumbing is the highest-risk area in this project. Device indices can shift between boots, PulseAudio can grab the ALSA device before JACK, and jalv plugin connections are lost if JACK restarts. A fire-and-forget start-once approach will fail mid-show. The watchdog is a first-class component.

States and transitions:
```
UNCONFIGURED
  → detect Scarlett via aplay -l
  → if found: JACK_STARTING
  → if not found: FALLBACK_ALSA

JACK_STARTING
  → kill PulseAudio if running (pulseaudio --kill)
  → spawn jackd with correct hw: device name, 1024 frame buffer
  → verify via jack_lsp within 3s
  → if ok: CHAIN_LOADING
  → if fail: retry up to 3×, then FALLBACK_ALSA

CHAIN_LOADING
  → start one jalv instance per plugin per channel
  → patch all JACK ports using declarative config (jack-patch.json)
  → verify all expected ports appear in jack_lsp output
  → if ok: READY
  → if fail: kill all jalv instances, retry 3×, then FALLBACK_ALSA

READY
  → health check every 2 seconds: jack_lsp, verify expected ports present
  → if all ok: stay READY
  → if any port missing or jackd dead: RECOVERING

RECOVERING
  → kill all jalv instances and jackd cleanly
  → re-detect Scarlett ALSA device (index may have changed)
  → return to JACK_STARTING
  → KJ panel: yellow "Audio restarting..." badge (~3-5s)
  → on return to READY: re-apply current singer profile via OSC

FALLBACK_ALSA (show must not die)
  → MPV switches to --ao=alsa --audio-device=hw:Scarlett2i2
  → jalv chain offline, mic processing unavailable
  → break music continues via ALSA
  → KJ panel: persistent red "Audio degraded — mic processing offline" badge
  → watchdog retries full recovery every 30s in background
  → if recovery succeeds: transition to READY, re-apply singer profile
```

Key implementation notes:
- ALSA device discovery: parse `aplay -l` by device name ("Scarlett"), not hardware index. Index can change on USB re-enumeration.
- PulseAudio conflict: must be killed before jackd starts. Handled in JACK_STARTING.
- JACK port patching: stored declaratively in `/opt/neon-kj/config/jack-patch.json`. Watchdog re-applies after every CHAIN_LOADING without hardcoded wiring logic.
- MPV JACK reconnection: when JACK restarts, MPV is restarted with `--ao=jack --start=<current_position>` to resume from correct point.

### MPV IPC control
- MPV launched with `--input-ipc-server=/tmp/mpv-karaoke.sock --fs --screen=${LYRICS_DISPLAY} --ao=jack`
- Node.js communicates via JSON over Unix socket
- Playback: `{"command": ["loadfile", "/path/to/song.mp4"]}`, pause, resume, seek, stop, get position
- Tempo: `{"command": ["set_property", "speed", 0.95]}` — mid-song capable, pitch preserved by scaletempo
- A second MPV instance handles break music on `/tmp/mpv-break.sock`

### Full audio signal chain
```
[MPV karaoke output] → JACK (via --ao=jack)
  → jalv: rubberband-pitchshifter-stereo (pitch ±12 semitones) ← OSC, ~5ms
  → jalv: scaletempo (tempo smoothing)
  → Scarlett 2i2 output → PA/Mixer/Speakers

[Mic 1 XLR Input] → JACK capture_1
  → jalv: gate_1410 (noise gate)      ← OSC, threshold auto-adjusts from ambient mic
  → jalv: HPF (high-pass 90Hz)
  → jalv: mbeq (3-band parametric EQ) ← OSC, ~5ms
  → jalv: sc4_1882 (compressor)
  → jalv: g2reverb (reverb)           ← OSC, ~5ms
  → jalv: amp_mono (gain/volume)      ← OSC, ~5ms
  → Scarlett 2i2 output mix

[Mic 2 XLR Input] → identical jalv chain → Scarlett 2i2 output mix

[USB ambient mic] → separate ALSA device → Python analyzer service
  → RMS loudness, applause detection, noise floor, feedback frequency scan
  → HTTP/WebSocket → Node.js
```

### Real-time OSC control — all mid-song capable
- Node.js sends UDP OSC messages to individual jalv instances on their assigned ports
- Each jalv instance has a fixed, hardcoded OSC port assigned at launch (e.g., Rubberband on :9001, Mic1 EQ on :9010, Mic2 gain on :9020, etc.)
- No runtime OSC path discovery needed — ports are constants in the config
- Parameter updates at JACK buffer boundaries: ~5ms LADSPA response time
- Total perceived latency (UI drag → KJ hears change): ~25-45ms including 21ms JACK buffer, plugin processing, and UI round-trip. Imperceptible for pitch and volume. Tune buffer size in the actual venue — 1024 frames is the starting point.

### Tempo — improved over VLC
- MPV IPC supports `set_property speed N` at any time, including mid-song
- Scaletempo filter preserves pitch when speed changes
- Tempo slider active before AND during playback, range 0.80×–1.20×, rate-limited in UI

### CPU budget (Intel N100, 4 cores @ 3.4GHz, fanless)
```
JACK server:                  ~1%
jalv instances (all plugins): ~12%  (more processes than carla-rack, same CPU work)
MPV karaoke playback:         ~4%
MPV break music:              ~1%
Python ambient analyzer:      ~2%
Node.js + WebSocket:          ~3%
OS + idle:                    ~3%
─────────────────────────────────
Total estimate:               ~26%  ← ~74% headroom for a 4-hour show
```

### RAM budget (N100, 8GB)
```
OS (Ubuntu 22.04):            ~500 MB
JACK + jalv instances (~10):  ~100 MB
MPV (karaoke):                ~120 MB
MPV (break music):            ~80 MB
Node.js server:               ~150 MB
Python ambient analyzer:      ~60 MB
SQLite (in-process):          ~20 MB
─────────────────────────────────
Total estimate:               ~1.03 GB  ← well within 8GB
```

## Per-Singer Audio Profile (SQLite)
Tables: `singer_audio_profiles` (singer_id, voice_type, mic_gain_db, eq_low_db, eq_mid_db, eq_high_db, eq_preset, reverb_level, reverb_type, compressor_amount, gate_threshold_db, notes, updated_at) and `singer_song_keys` (singer_id, song_id, key_offset -12 to +12, use_count, last_used_at).

On queue advance → auto-load profile → apply all OSC params to jalv instances → pre-set Rubberband to stored key offset. `applyProfile()` is also called by the watchdog after any RECOVERING → READY transition so singer settings are instantly restored. All KJ adjustments auto-save after 3 seconds (debounced).

## Ambient USB Mic — Honest Accuracy Statement
**Reliable**: RMS loudness every 100ms, running noise floor baseline, gate auto-tighten on rising floor.

**Heuristic — requires per-venue tuning**: Applause detection (energy spike 1-3s after song end with characteristic decay) and feedback detection (sustained narrowband FFT peak). Both will produce false positives in some venues. Threshold is configurable via env var. Raw room energy is always visible on the KJ panel. The ambient mic is a hint to the KJ — never an autonomous action. All automated scores pass through the KJ for accept/override.

Lightweight Python sidecar (`ambient_monitor.py`) as systemd unit:
- Auto-detects USB mic ALSA device (separate from Scarlett)
- Every 100ms: RMS, noise floor delta
- Post-song applause heuristic → POST candidate score to Node.js API (KJ accepts or overrides)
- FFT feedback scan → `feedback_alert` WebSocket event (visual hint, no automated action)
- Exposes `GET /api/audio/room-energy` returning {rms, noiseFloor, applauseActive, feedbackAlert}

## Done looks like
- KJ connects Scarlett 2i2 via USB → watchdog starts JACK, launches jalv plugin chain, patches ports, KJ panel shows green audio badge
- If JACK crashes mid-show: watchdog detects within 2s, recovers (~3-5s audio gap), re-applies singer profile, KJ panel returns to green
- If Scarlett unplugged: FALLBACK_ALSA, KJ panel shows red degraded badge, show continues with audio, mics offline
- Singer walks up → audio profile loads automatically, KJ panel shows all settings pre-populated
- KJ drags pitch slider mid-song → Rubberband jalv instance updates via OSC, KJ hears change in ~25-45ms
- KJ adjusts tempo slider → MPV speed updates cleanly mid-song, pitch unaffected
- KJ raises mic volume fader → amp jalv instance updates via OSC
- EQ, reverb, compressor all adjustable mid-song, auto-save to profile
- MPV plays lyrics/video fullscreen on the venue display (display 2), KJ panel on display 1
- N100 holds ~26% CPU all night, fanless and silent

## Out of scope
- Singer push notifications (Task 3)
- AI announcements and crowd analytics dashboard (Task 4)
- Wireless mic pairing (user-provided hardware, documented in install README)
- Phantom power UI (hardware button on Scarlett, not Linux software-accessible)
- CDG format handling (converted to MP4 at library scan time in Task 1)

## Tasks
1. **Scarlett 2i2 ALSA detection** — Parse `aplay -l` output, match on device name "Scarlett" (not hardware index). Write detected `hw:N` string to runtime config. Return null if not found.

2. **Audio watchdog & state machine** — `artifacts/api-server/src/lib/audio-watchdog.ts`. Implements full state machine: UNCONFIGURED → JACK_STARTING → CHAIN_LOADING → READY → RECOVERING → FALLBACK_ALSA. In JACK_STARTING: kill PulseAudio, detect Scarlett, spawn `jackd -d alsa -d hw:Scarlett2i2 -r 48000 -p ${JACK_BUFFER_FRAMES} -n 3`. In CHAIN_LOADING: launch one jalv instance per plugin per channel with hardcoded OSC ports, apply jack-patch.json connections. Health check loop every 2s in READY state. RECOVERING: clean kill all jalv pids + jackd, re-detect device, restart from JACK_STARTING. FALLBACK_ALSA: switch MPV to --ao=alsa, attempt recovery every 30s. All state transitions broadcast `audio_status` WebSocket event.

3. **jalv plugin chain** — Each plugin instance launched as: `jalv.jack <plugin-uri> --control osc.udp://localhost:<port>`. Port assignments stored in `/opt/neon-kj/config/jalv-ports.json` (constants, not discovered at runtime). Plugins per channel: gate_1410 → HPF → mbeq → sc4_1882 → g2reverb → amp_mono. Rubberband stereo on MPV output. JACK port connections defined in `/opt/neon-kj/config/jack-patch.json`.

4. **OSC parameter control** — `artifacts/api-server/src/lib/audio-chain.ts`. Reads jalv-ports.json to know each plugin's OSC port. Implements `applyProfile(profile)` (batch OSC to all relevant plugins), `setParam(channel, plugin, param, value)` (single plugin OSC), `setPitch(semitones)` (Rubberband control). Called by both the KJ panel API routes and the watchdog recovery path.

5. **MPV manager** — `artifacts/api-server/src/lib/mpv-manager.ts`. Manages two MPV subprocesses (karaoke + break music), each with its own IPC socket. Karaoke MPV: `--fs --screen=${LYRICS_DISPLAY} --ao=jack`. Supports switching audio mode between `--ao=jack` (READY) and `--ao=alsa` (FALLBACK_ALSA) by restarting with current position preserved. Provides: `play(filePath, speed)`, `pause()`, `resume()`, `stop()`, `seek(seconds)`, `setSpeed(rate)`, `getPosition()`, `setAudioMode(jack|alsa)`, `setDisplay(n)`.

6. **Singer audio profile schema + routes** — Add `singer_audio_profiles` and `singer_song_keys` to Drizzle schema. Routes: `GET/PATCH /api/singers/:id/audio-profile`, `GET/PATCH /api/singers/:id/song-keys/:songId`. Auto-load + apply on queue advance.

7. **USB ambient mic Python service** — `scripts/ambient_monitor.py`. Auto-detects USB mic ALSA device (separate from Scarlett). RMS, noise floor, applause heuristic with configurable `APPLAUSE_THRESHOLD`, FFT feedback scan. All scores pass through Node.js API where KJ override applies before committing. Runs as `neon-kj-ambient.service`.

8. **Playback API routes** — `POST /api/playback/play`, pause, resume, stop, seek. `PATCH /api/playback/pitch` (OSC → Rubberband jalv, real-time mid-song). `PATCH /api/playback/tempo` (MPV IPC `set_property speed`). `GET /api/playback/status`. `GET /api/audio/room-energy`. `PATCH /api/playback/display` (switch MPV to different display at runtime). All state changes broadcast via WebSocket.

9. **Break music engine** — Second MPV instance on `/tmp/mpv-break.sock`. Shuffled playlist from `BREAK_MUSIC_PATH`. Auto-starts between karaoke songs. Follows same audio mode (JACK or ALSA) as karaoke MPV.

10. **KJ panel audio status & live controls** — Audio status badge: green "Audio ready", yellow "Audio restarting…", red "Audio degraded — mic offline", grey "No audio device". Live performance strip: pitch slider ±12 semitones (live mid-song), tempo slider 0.80×–1.20× (rate-limited), two mic channel strips with gain fader + RMS meter, EQ, reverb, compressor. Live room energy bar (raw RMS from ambient mic always visible). Feedback hint indicator (visual only). Ambient applause score shown post-song with Accept / Override controls.

## Relevant files
- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/lib/audio-watchdog.ts`
- `artifacts/api-server/src/lib/mpv-manager.ts`
- `artifacts/api-server/src/lib/audio-chain.ts`
- `lib/api-spec/openapi.yaml`
- `lib/db/src/schema/index.ts`
- `scripts/ambient_monitor.py`
- `/opt/neon-kj/config/jalv-ports.json`
- `/opt/neon-kj/config/jack-patch.json`
