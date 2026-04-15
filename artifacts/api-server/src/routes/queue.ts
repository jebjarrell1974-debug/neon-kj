import { Router } from "express";
import { db } from "@workspace/db";
import { queueEntries, singers, songs } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { getActiveShow, computeQueue, advanceQueue } from "../lib/rotation.js";
import { broadcast } from "../lib/websocket.js";

const router = Router();

async function broadcastQueueUpdate(showId: number) {
  const state = await computeQueue(showId);
  broadcast("queue_update", state);
  // #10: removed dead lastThreeScores: [] — alert state is driven by queueState.lowEnergyAlert
  if (state.lowEnergyAlert) {
    broadcast("low_energy_alert", {});
  }
}

router.post("/queue", async (req, res) => {
  try {
    const { singerId, songId } = req.body as { singerId?: number; songId?: number };
    if (!singerId || !songId) {
      return res.status(400).json({ error: "singerId and songId are required" });
    }

    const show = await getActiveShow();
    if (!show) return res.status(400).json({ error: "No active show" });

    const singerRows = await db.select().from(singers).where(eq(singers.id, singerId));
    if (!singerRows[0]) return res.status(404).json({ error: "Singer not found" });

    // #2: Reject singers registered under a different show (e.g. old localStorage ID)
    if (singerRows[0].showId !== show.id) {
      return res.status(403).json({ error: "Singer is not registered in the current show" });
    }

    const songRows = await db.select().from(songs).where(eq(songs.id, songId));
    if (!songRows[0]) return res.status(404).json({ error: "Song not found" });

    const existingRows = await db
      .select()
      .from(queueEntries)
      .where(
        and(
          eq(queueEntries.showId, show.id),
          eq(queueEntries.singerId, singerId),
          eq(queueEntries.status, "waiting")
        )
      );

    if (existingRows[0]) {
      return res.status(409).json({ error: "This singer already has a song in the queue" });
    }

    const entryRows = await db
      .insert(queueEntries)
      .values({
        showId: show.id,
        singerId,
        songId,
        status: "waiting",
        position: 0,
        addedAt: new Date(),
      })
      .returning();
    const entry = entryRows[0];

    await broadcastQueueUpdate(show.id);
    broadcast("singer_called", { singerId, stage: "soon" });

    return res.status(201).json(entry);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to add to queue" });
  }
});

router.get("/queue", async (_req, res) => {
  try {
    const show = await getActiveShow();
    if (!show) return res.json({ queue: [], nowPlaying: null, isPeakHours: false, lowEnergyAlert: false });
    const state = await computeQueue(show.id);
    return res.json(state);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to get queue" });
  }
});

router.post("/queue/advance", async (_req, res) => {
  try {
    const show = await getActiveShow();
    if (!show) return res.status(400).json({ error: "No active show" });

    const result = await advanceQueue(show.id);
    if (!result.advanced) {
      return res.status(429).json({ error: "Advance already in progress" });
    }

    const state = await computeQueue(show.id);

    broadcast("queue_update", state);
    if (state.nowPlaying) {
      broadcast("now_playing", state.nowPlaying);
      broadcast("singer_called", { singerId: state.nowPlaying.singerId, stage: "performing" });
    }
    if (state.lowEnergyAlert) {
      broadcast("low_energy_alert", {});
    }

    return res.json({ ...result, state });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to advance queue" });
  }
});

router.post("/queue/:id/skip", async (req, res) => {
  try {
    const id = parseInt(req.params["id"] ?? "0", 10);
    const show = await getActiveShow();
    if (!show) return res.status(400).json({ error: "No active show" });

    // #3: Only allow skipping entries that belong to the current show
    const rows = await db.select().from(queueEntries).where(
      and(eq(queueEntries.id, id), eq(queueEntries.showId, show.id))
    );
    if (!rows[0]) return res.status(404).json({ error: "Queue entry not found" });

    await db.update(queueEntries)
      .set({ status: "skipped" })
      .where(and(eq(queueEntries.id, id), eq(queueEntries.showId, show.id)));

    await broadcastQueueUpdate(show.id);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to skip" });
  }
});

router.delete("/queue/:id", async (req, res) => {
  try {
    const id = parseInt(req.params["id"] ?? "0", 10);
    const show = await getActiveShow();
    if (!show) return res.status(400).json({ error: "No active show" });

    // #3: Fetch first to verify ownership, then update
    const rows = await db.select().from(queueEntries).where(
      and(eq(queueEntries.id, id), eq(queueEntries.showId, show.id))
    );
    if (!rows[0]) return res.status(404).json({ error: "Queue entry not found" });

    await db.update(queueEntries)
      .set({ status: "skipped" })
      .where(and(eq(queueEntries.id, id), eq(queueEntries.showId, show.id)));

    await broadcastQueueUpdate(show.id);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to remove from queue" });
  }
});

router.patch("/queue/reorder", async (req, res) => {
  try {
    const { orderedIds } = req.body as { orderedIds?: number[] };
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ error: "orderedIds array is required" });
    }

    const show = await getActiveShow();
    if (!show) return res.status(400).json({ error: "No active show" });

    // #4: Validate all IDs belong to the current show with waiting status
    const validEntries = await db
      .select({ id: queueEntries.id })
      .from(queueEntries)
      .where(
        and(
          inArray(queueEntries.id, orderedIds),
          eq(queueEntries.showId, show.id),
          eq(queueEntries.status, "waiting")
        )
      );

    const validIds = new Set(validEntries.map(e => e.id));
    const invalidIds = orderedIds.filter(id => !validIds.has(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ error: "One or more entry IDs are invalid or not part of the current show" });
    }

    // #4: Wrap position updates in a transaction
    await db.transaction(async (tx) => {
      for (const [idx, entryId] of orderedIds.entries()) {
        await tx.update(queueEntries)
          .set({ position: idx })
          .where(and(eq(queueEntries.id, entryId), eq(queueEntries.showId, show.id)));
      }
    });

    await broadcastQueueUpdate(show.id);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to reorder queue" });
  }
});

// #11: Removed the no-op /queue/confirm stub

export default router;
