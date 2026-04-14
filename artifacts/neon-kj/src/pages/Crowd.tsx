import { useState, useEffect } from "react";
import { useLiveQueue } from "@/hooks/use-websocket";
import { motion, AnimatePresence } from "framer-motion";
import { Mic2, Users, ChevronRight } from "lucide-react";

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="font-mono text-xl text-white/40 tabular-nums">
      {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

function EnergyDots({ score }: { score: number }) {
  return (
    <div className="flex gap-2 items-center justify-center">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="w-4 h-4 rounded-full transition-all duration-500"
          style={{
            background:
              i < score
                ? score >= 7
                  ? "#a855f7"
                  : score >= 4
                  ? "#eab308"
                  : "#ef4444"
                : "rgba(255,255,255,0.1)",
            boxShadow:
              i < score && score >= 7 ? "0 0 10px #a855f7" : "none",
          }}
        />
      ))}
    </div>
  );
}

function useQRCode() {
  const [qr, setQr] = useState<{ url: string; qrDataUrl: string } | null>(null);
  useEffect(() => {
    const base = import.meta.env.BASE_URL ?? "/";
    fetch(`${base}api/qrcode`)
      .then((r) => r.json())
      .then(setQr)
      .catch(console.error);
  }, []);
  return qr;
}

export default function Crowd() {
  const { queueState } = useLiveQueue();
  const qr = useQRCode();

  const nowPlaying = queueState?.nowPlaying ?? null;
  const nextUp = queueState?.queue?.[0] ?? null;
  const singerCount = (queueState?.queue?.length ?? 0) + (nowPlaying ? 1 : 0);
  const showActive = !!queueState?.showId;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col overflow-hidden relative select-none">
      {/* Ambient background */}
      <img
        src={`${import.meta.env.BASE_URL}images/neon-bg.png`}
        className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none"
        alt=""
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/30 to-black/90 pointer-events-none" />

      {/* ── Header ── */}
      <header className="relative z-10 flex items-center justify-between px-8 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <Mic2 className="w-6 h-6 text-purple-400" />
          <span className="font-black text-2xl tracking-tight">
            NEON{" "}
            <span
              className="text-purple-400"
              style={{ textShadow: "0 0 20px #a855f7" }}
            >
              KJ
            </span>
          </span>
        </div>
        {queueState?.showName && (
          <span className="text-white/30 text-base font-light truncate max-w-[50%] text-right">
            {queueState.showName}
          </span>
        )}
        <Clock />
      </header>

      {/* ── Stage area (flex-1 so it fills available space) ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 py-4 text-center">

        {/* No show */}
        {!showActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Mic2
              className="w-20 h-20 text-purple-400/30 mx-auto mb-6"
              style={{ filter: "drop-shadow(0 0 30px #a855f7)" }}
            />
            <h1 className="text-6xl font-black tracking-tight text-white/20 mb-3">
              Karaoke Night
            </h1>
            <p className="text-2xl text-white/30">
              The show hasn't started yet.
            </p>
          </motion.div>
        )}

        {/* Show active — nobody on stage */}
        {showActive && !nowPlaying && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div
              className="w-28 h-28 rounded-full mx-auto mb-8 flex items-center justify-center"
              style={{
                background: "rgba(168,85,247,0.15)",
                boxShadow: "0 0 60px rgba(168,85,247,0.3)",
              }}
            >
              <Mic2 className="w-14 h-14 text-purple-400" />
            </div>
            <h1
              className="text-6xl font-black tracking-tight mb-4"
              style={{ textShadow: "0 0 40px rgba(168,85,247,0.5)" }}
            >
              Get Ready!
            </h1>
            <p className="text-2xl text-white/40">
              First singer coming up soon
            </p>
          </motion.div>
        )}

        {/* Now Playing */}
        {showActive && nowPlaying && (
          <div className="w-full flex flex-col items-center gap-5">
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full bg-purple-400 animate-pulse"
                style={{ boxShadow: "0 0 12px #a855f7" }}
              />
              <span className="text-base font-bold tracking-[0.3em] uppercase text-purple-400/80">
                Now On Stage
              </span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={nowPlaying.singerId}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -40 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="w-full"
              >
                <h1
                  className="font-black leading-none mb-4"
                  style={{
                    fontSize: "clamp(3.5rem, 14vw, 8rem)",
                    textShadow: "0 0 60px rgba(168,85,247,0.6)",
                    background:
                      "linear-gradient(135deg, #ffffff 0%, #e879f9 50%, #a855f7 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {nowPlaying.singerName}
                </h1>

                <p
                  className="text-3xl font-bold text-white mb-1"
                  style={{ fontSize: "clamp(1.5rem, 5vw, 2.25rem)" }}
                >
                  {nowPlaying.songTitle}
                </p>
                <p
                  className="text-white/50 mb-6"
                  style={{ fontSize: "clamp(1.1rem, 3.5vw, 1.75rem)" }}
                >
                  by {nowPlaying.songArtist}
                </p>

                <EnergyDots score={nowPlaying.songEnergyScore ?? 5} />
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* ── Coming Up Next strip ── */}
      {showActive && (
        <div className="relative z-10 border-t border-white/10 bg-black/40 backdrop-blur-sm px-8 py-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold tracking-[0.25em] uppercase text-white/30 shrink-0">
              Coming Up Next
            </span>
            <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
            <AnimatePresence mode="wait">
              {nextUp ? (
                <motion.div
                  key={nextUp.entryId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="flex items-center gap-2 min-w-0"
                >
                  <span className="text-xl font-bold text-white truncate">
                    {nextUp.singerName}
                  </span>
                  <span className="text-white/30 shrink-0">—</span>
                  <span className="text-lg text-white/60 truncate">
                    {nextUp.songTitle}
                  </span>
                </motion.div>
              ) : (
                <motion.span
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-lg text-white/20 italic"
                >
                  Queue is empty — add a song!
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* ── QR Code section ── */}
      <div className="relative z-10 flex flex-col items-center px-8 pt-6 pb-8 gap-4">
        {/* Divider glow */}
        <div
          className="w-16 h-px mb-2"
          style={{ background: "linear-gradient(90deg, transparent, #a855f7, transparent)" }}
        />

        {/* QR Code */}
        {qr ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="relative"
          >
            {/* Glow ring behind QR */}
            <div
              className="absolute inset-0 rounded-2xl"
              style={{
                boxShadow: "0 0 60px rgba(168,85,247,0.5), 0 0 120px rgba(168,85,247,0.2)",
              }}
            />
            <div className="relative bg-white rounded-2xl p-4">
              <img
                src={qr.qrDataUrl}
                alt="Scan to join"
                className="block"
                style={{ width: "min(72vw, 340px)", height: "min(72vw, 340px)" }}
              />
            </div>
          </motion.div>
        ) : (
          <div
            className="rounded-2xl bg-white/5 border border-white/10 animate-pulse"
            style={{ width: "min(72vw, 340px)", height: "min(72vw, 340px)" }}
          />
        )}

        {/* CTA text */}
        <div className="text-center">
          <p
            className="font-black tracking-wider uppercase mb-1"
            style={{
              fontSize: "clamp(1.1rem, 5vw, 1.5rem)",
              textShadow: "0 0 20px rgba(168,85,247,0.8)",
              background: "linear-gradient(90deg, #e879f9, #a855f7)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Scan to Sing Tonight!
          </p>
          {qr && (
            <p className="text-white/30 text-sm font-mono tracking-tight break-all">
              {qr.url}
            </p>
          )}
        </div>

        {/* Singer count pill */}
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-5 py-2">
          <Users className="w-4 h-4 text-purple-400" />
          <span className="text-lg font-bold text-white">{singerCount}</span>
          <span className="text-white/40 text-sm">
            singer{singerCount !== 1 ? "s" : ""} tonight
          </span>
        </div>
      </div>
    </div>
  );
}
