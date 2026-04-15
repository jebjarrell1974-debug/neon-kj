import { db, client } from "@workspace/db";
import { queueEntries, singers, songs, performances, shows } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";

const PEAK_HOURS_START = parseInt(process.env["PEAK_HOURS_START"] ?? "22", 10);
const PEAK_HOURS_END = parseInt(process.env["PEAK_HOURS_END"] ?? "2", 10);
const ENERGY_PEAK_BOOST_MINUTES = 2;
const LOW_ENERGY_THRESHOLD = 4;
const LOW_ENERGY_LOOKBACK = 3;

// #6: Mutex — prevents two simultaneous advance calls from promoting two performers
let advanceMutex = false;

function isPeakHours(): boolean {
  const hour = new Date().getHours();
  if (PEAK_HOURS_START < PEAK_HOURS_END) {
    return hour >= PEAK_HOURS_START && hour < PEAK_HOURS_END;
  }
  return hour >= PEAK_HOURS_START || hour < PEAK_HOURS_END;
}

export interface QueueItem {
  entryId: number;
  singerId: number;
  singerName: string;
  songId: number;
  songTitle: string;
  songArtist: string;
  songDurationMinutes: number;
  songEnergyScore: number;
  songBpm: number | null;
  songGenre: string | null;
  virtualStageTimeMinutes: number;
  effectiveStageTimeMinutes: number;
  position: number;
  waitTimeMinutes: number;
  status: string;
  addedAt: Date;
}

export interface QueueState {
  queue: QueueItem[];
  nowPlaying: QueueItem | null;
  showId: number | null;
  showName: string | null;
  isPeakHours: boolean;
  lowEnergyAlert: boolean;
}

export async function getActiveShow() {
  const rows = await db.select().from(shows).where(eq(shows.isActive, true));
  return rows[0] ?? null;
}

export async function computeQueue(showId: number): Promise<QueueState> {
  const peakHours = isPeakHours();

  const showRows = await db.select().from(shows).where(eq(shows.id, showId));
  const show = showRows[0];
  if (!show) {
    return { queue: [], nowPlaying: null, showId, showName: null, isPeakHours: peakHours, lowEnergyAlert: false };
  }

  const entries = await db
    .select({
      entryId: queueEntries.id,
      status: queueEntries.status,
      position: queueEntries.position,
      addedAt: queueEntries.addedAt,
      singerId: singers.id,
      singerName: singers.name,
      virtualStageTimeMinutes: singers.virtualStageTimeMinutes,
      songId: songs.id,
      songTitle: songs.title,
      songArtist: songs.artist,
      songDurationMinutes: songs.durationMinutes,
      songEnergyScore: songs.energyScore,
      songBpm: songs.bpm,
      songGenre: songs.genre,
    })
    .from(queueEntries)
    .innerJoin(singers, eq(queueEntries.singerId, singers.id))
    .innerJoin(songs, eq(queueEntries.songId, songs.id))
    .where(
      and(
        eq(queueEntries.showId, showId),
        eq(queueEntries.status, "waiting")
      )
    );

  const performingRows = await db
    .select({
      entryId: queueEntries.id,
      status: queueEntries.status,
      position: queueEntries.position,
      addedAt: queueEntries.addedAt,
      singerId: singers.id,
      singerName: singers.name,
      virtualStageTimeMinutes: singers.virtualStageTimeMinutes,
      songId: songs.id,
      songTitle: songs.title,
      songArtist: songs.artist,
      songDurationMinutes: songs.durationMinutes,
      songEnergyScore: songs.energyScore,
      songBpm: songs.bpm,
      songGenre: songs.genre,
    })
    .from(queueEntries)
    .innerJoin(singers, eq(queueEntries.singerId, singers.id))
    .innerJoin(songs, eq(queueEntries.songId, songs.id))
    .where(
      and(
        eq(queueEntries.showId, showId),
        eq(queueEntries.status, "performing")
      )
    );
  const performing = performingRows[0];

  function effectiveTime(virtualTime: number, energyScore: number): number {
    if (peakHours && energyScore > 7) {
      return virtualTime - ENERGY_PEAK_BOOST_MINUTES;
    }
    return virtualTime;
  }

  const sorted = [...entries].sort((a, b) => {
    const aEff = effectiveTime(a.virtualStageTimeMinutes, a.songEnergyScore);
    const bEff = effectiveTime(b.virtualStageTimeMinutes, b.songEnergyScore);
    return aEff - bEff;
  });

  let cumulativeWait = 0;
  const queue: QueueItem[] = sorted.map((e, idx) => {
    const wait = cumulativeWait;
    cumulativeWait += e.songDurationMinutes;
    return {
      entryId: e.entryId,
      singerId: e.singerId,
      singerName: e.singerName,
      songId: e.songId,
      songTitle: e.songTitle,
      songArtist: e.songArtist,
      songDurationMinutes: e.songDurationMinutes,
      songEnergyScore: e.songEnergyScore,
      songBpm: e.songBpm,
      songGenre: e.songGenre,
      virtualStageTimeMinutes: e.virtualStageTimeMinutes,
      effectiveStageTimeMinutes: effectiveTime(e.virtualStageTimeMinutes, e.songEnergyScore),
      position: idx + 1,
      waitTimeMinutes: wait,
      status: e.status,
      addedAt: e.addedAt instanceof Date ? e.addedAt : new Date(e.addedAt as unknown as number),
    };
  });

  const nowPlaying: QueueItem | null = performing
    ? {
        entryId: performing.entryId,
        singerId: performing.singerId,
        singerName: performing.singerName,
        songId: performing.songId,
        songTitle: performing.songTitle,
        songArtist: performing.songArtist,
        songDurationMinutes: performing.songDurationMinutes,
        songEnergyScore: performing.songEnergyScore,
        songBpm: performing.songBpm,
        songGenre: performing.songGenre,
        virtualStageTimeMinutes: performing.virtualStageTimeMinutes,
        effectiveStageTimeMinutes: effectiveTime(performing.virtualStageTimeMinutes, performing.songEnergyScore),
        position: 0,
        waitTimeMinutes: 0,
        status: "performing",
        addedAt: performing.addedAt instanceof Date ? performing.addedAt : new Date(performing.addedAt as unknown as number),
      }
    : null;

  // #7: Fetch only the last N performances — no full table scan
  const recentPerfs = await db
    .select({ energyScore: performances.energyScore })
    .from(performances)
    .where(eq(performances.showId, showId))
    .orderBy(desc(performances.id))
    .limit(LOW_ENERGY_LOOKBACK);

  const lowEnergyAlert =
    recentPerfs.length === LOW_ENERGY_LOOKBACK &&
    recentPerfs.every((p) => (p.energyScore ?? 10) < LOW_ENERGY_THRESHOLD);

  return { queue, nowPlaying, showId, showName: show.name, isPeakHours: peakHours, lowEnergyAlert };
}

export async function advanceQueue(showId: number): Promise<{ advanced: boolean; newPerformer: QueueItem | null }> {
  // #6: Reject concurrent advance calls immediately
  if (advanceMutex) {
    return { advanced: false, newPerformer: null };
  }
  advanceMutex = true;

  try {
    // #1: Wrap all writes in a single transaction — prevents DB corruption on failure
    await db.transaction(async (tx) => {
      const performingRows = await tx
        .select({
          entryId: queueEntries.id,
          singerId: queueEntries.singerId,
          songId: queueEntries.songId,
        })
        .from(queueEntries)
        .where(
          and(
            eq(queueEntries.showId, showId),
            eq(queueEntries.status, "performing")
          )
        );
      const currentPerforming = performingRows[0];

      if (currentPerforming) {
        const songRows = await tx.select().from(songs).where(eq(songs.id, currentPerforming.songId));
        const song = songRows[0];
        if (song) {
          const singerRows = await tx.select().from(singers).where(eq(singers.id, currentPerforming.singerId));
          const singer = singerRows[0];
          if (singer) {
            await tx.update(singers)
              .set({
                virtualStageTimeMinutes: singer.virtualStageTimeMinutes + song.durationMinutes,
                songsSung: singer.songsSung + 1,
              })
              .where(eq(singers.id, currentPerforming.singerId));

            await tx.insert(performances).values({
              showId,
              singerId: currentPerforming.singerId,
              songId: currentPerforming.songId,
              performedAt: new Date(),
              waitTimeMinutes: 0,
              energyScore: song.energyScore,
            });
          }
        }

        await tx.update(queueEntries)
          .set({ status: "done", performedAt: new Date() })
          .where(eq(queueEntries.id, currentPerforming.entryId));
      }

      const waiting = await tx
        .select({
          entryId: queueEntries.id,
          singerId: queueEntries.singerId,
          songId: queueEntries.songId,
          virtualStageTimeMinutes: singers.virtualStageTimeMinutes,
          songEnergyScore: songs.energyScore,
        })
        .from(queueEntries)
        .innerJoin(singers, eq(queueEntries.singerId, singers.id))
        .innerJoin(songs, eq(queueEntries.songId, songs.id))
        .where(
          and(
            eq(queueEntries.showId, showId),
            eq(queueEntries.status, "waiting")
          )
        );

      if (waiting.length === 0) return;

      const peakHours = isPeakHours();
      const next = [...waiting].sort((a, b) => {
        const aEff = peakHours && a.songEnergyScore > 7
          ? a.virtualStageTimeMinutes - ENERGY_PEAK_BOOST_MINUTES
          : a.virtualStageTimeMinutes;
        const bEff = peakHours && b.songEnergyScore > 7
          ? b.virtualStageTimeMinutes - ENERGY_PEAK_BOOST_MINUTES
          : b.virtualStageTimeMinutes;
        return aEff - bEff;
      })[0];

      if (!next) return;

      await tx.update(queueEntries)
        .set({ status: "performing" })
        .where(eq(queueEntries.id, next.entryId));
    });

    return { advanced: true, newPerformer: null };
  } finally {
    advanceMutex = false;
  }
}

export async function initSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS shows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      started_at INTEGER,
      ended_at INTEGER,
      is_active INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS singers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      show_id INTEGER NOT NULL REFERENCES shows(id),
      name TEXT NOT NULL,
      virtual_stage_time_minutes REAL NOT NULL DEFAULT -10,
      songs_sung INTEGER NOT NULL DEFAULT 0,
      joined_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      bpm INTEGER,
      genre TEXT,
      duration_minutes REAL NOT NULL DEFAULT 3.5,
      energy_score INTEGER NOT NULL DEFAULT 5,
      file_path TEXT,
      file_type TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS queue_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      show_id INTEGER NOT NULL REFERENCES shows(id),
      singer_id INTEGER NOT NULL REFERENCES singers(id),
      song_id INTEGER NOT NULL REFERENCES songs(id),
      status TEXT NOT NULL DEFAULT 'waiting',
      position INTEGER NOT NULL DEFAULT 0,
      added_at INTEGER NOT NULL,
      performed_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS performances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      show_id INTEGER NOT NULL REFERENCES shows(id),
      singer_id INTEGER NOT NULL REFERENCES singers(id),
      song_id INTEGER NOT NULL REFERENCES songs(id),
      performed_at INTEGER NOT NULL,
      wait_time_minutes REAL,
      energy_score INTEGER
    )`,
  ];

  for (const sql of statements) {
    await client.execute(sql);
  }
  console.log("[DB] Schema initialized.");
}
