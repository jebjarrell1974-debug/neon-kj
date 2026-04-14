# NEON KJ — Singer PWA & Confirmation Flow

## What & Why
Turn the Singer View into a Progressive Web App (PWA) that singers install on their phones. Delivers the full countdown-to-stage experience: real-time position tracking, escalating notifications with required confirmations as the singer approaches, and a final "get to the stage NOW" alert. The app is served entirely from the Intel N100 mini PC on the local venue network — no cloud, no external servers.

## Architecture Constraints (N100-first)
- **PWA served from the N100's local Express server** — manifest, service worker, and all assets served at `/`. No cloud infrastructure. Singers connect over local WiFi to the N100's IP address.
- **Two-tier notification strategy**:
  - **Primary**: In-app real-time updates via WebSocket (app is open on phone) — instant, no OS permissions needed. This is the tier that rotation correctness depends on.
  - **Secondary**: Web Push API for when the app is backgrounded — requires iOS 16.4+ and "Add to Home Screen". iOS can throttle or drop push notifications if it decides the PWA is inactive or if storage has been cleared. Treat Web Push as a bonus channel, not a reliable delivery mechanism. Never use push delivery confirmation as an input to any timing or state logic.
- **Confirmation timeout is server-driven, not push-driven**: The countdown clock for a singer's confirmation window starts the moment the server crosses a stage threshold — not when/if a push notification is delivered. If push delivery is delayed or dropped by iOS, the timeout is already running. This is the correct design. Do not couple timeout logic to push delivery receipts.
- **Confirmations via WebSocket**: Singer receives WebSocket message + push notification at each stage threshold. Must tap confirm within timeout (default 60 seconds). No confirm → KJ panel warning, skip or re-queue option.
- **Countdown stages** (all configurable via env vars):
  - 3 singers away: "Get ready — you're coming up soon!" (informational only, no confirmation)
  - 2 singers away: "You're almost up! Start heading to the stage" → confirm: "Got it!"
  - 1 singer away: "You're NEXT — be at the stage NOW!" → confirm: "I'm at the stage!"
  - On deck: "IT'S YOUR TURN — [Song Title] — GO!" → confirm within 60s or KJ alerted
- **Session persistence**: Singer name + session ID in `localStorage` — closing/reopening browser reconnects without re-registering.
- **No app store** — PWA only. Android works natively. iOS requires Add to Home Screen (iOS 16.4+).

## Done looks like
- Singer scans QR code on the KJ panel display, opens the Singer View on their phone
- Prompted to add to home screen with platform-specific instructions shown on first visit
- After registering name and song request: live queue position + animated wait time countdown
- Escalating alerts with required tap confirmations as they approach the stage
- Vibration on alerts (devices that support it)
- Missed confirmation → red badge on that singer's row in KJ panel with Skip / Give More Time
- Push notifications fire with phone in pocket (iOS requires Add to Home Screen — and may still occasionally miss; this is accepted)
- "Now Playing" banner shows current performer's name and song
- Confirmation timeout always counts down correctly regardless of whether push notification arrived

## Out of scope
- AI announcements (Task 4)
- Crowd energy (Task 4)
- Guide vocal / scoring (future)

## Tasks
1. **PWA setup** — Add `manifest.json` at React app root: name "NEON KJ", dark theme color, neon microphone icon, display mode `standalone`. Add service worker (`sw.js`) registered from `main.tsx` — caches app shell for offline access so the singer view still loads if the N100 temporarily drops off the network.

2. **VAPID key generation & Web Push backend** — On server startup, generate VAPID keys if not present in SQLite. Endpoints: `POST /api/push/subscribe` (save push subscription), `POST /api/push/unsubscribe`. Use `web-push` npm package to send push notifications from the N100 server. Push is fire-and-forget — the server does not wait for delivery confirmation and does not retry on failure. Push failures are logged but never affect show state.

3. **Countdown & stage position logic** — Server: after every queue advance, recalculate each singer's position and estimated_wait_seconds. Emit WebSocket `position_update` to each singer's session. Singer View renders an animated circular countdown ring with remaining wait time.

4. **Confirmation workflow** — Server tracks confirmation status per singer per stage: `pending`, `confirmed`, `missed`. On threshold crossing: server immediately records the event timestamp and starts the timeout clock, emits `confirmation_required` WebSocket event, and separately fires a push notification (best-effort, result ignored). The timeout is driven entirely by the server's clock from the moment of threshold crossing — it is independent of push delivery. Singer taps confirm → `POST /api/queue/confirm` with token. Timeout expires → status = `missed`, broadcast `confirmation_missed` to KJ panel. The KJ panel shows the running countdown for pending confirmations so the host can see exactly how much time remains.

5. **Singer View countdown UI** — Animated wait time ring, position badge, stage alert modals with confirm buttons, "Now Playing" banner. Urgent and exciting when approaching stage — large text, animated neon pulses, device vibration on alerts. Alert modal stays visible and prominent until the singer confirms; it does not auto-dismiss.

6. **KJ panel confirmation indicators** — Confirmation status column in rotation queue: green ✓ (confirmed), yellow ⏱ with live countdown seconds remaining (pending), red ✗ (missed). Click pending singer: see how many seconds remain. Click missed singer → Skip / Give More Time options. "Give More Time" resets the timeout clock for that singer only.

7. **Add to Home Screen prompt** — Detect if not installed as PWA on first visit. Show friendly banner with iOS-specific (share → add to home screen) and Android-specific (browser menu → install app) instructions. Explicitly explain that push notifications (phone-in-pocket alerts) require this step, but that the app works fully without it as long as it stays open.

## Relevant files
- `lib/api-spec/openapi.yaml`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/lib/`
