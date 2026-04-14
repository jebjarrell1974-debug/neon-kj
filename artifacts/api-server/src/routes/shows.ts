import { Router } from "express";
import { db } from "@workspace/db";
import { shows } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getActiveShow, computeQueue } from "../lib/rotation.js";
import { broadcast } from "../lib/websocket.js";

const router = Router();

router.post("/shows", async (req, res) => {
  try {
    const { name } = req.body as { name?: string };
    if (!name?.trim()) {
      return res.status(400).json({ error: "Show name is required" });
    }

    await db.update(shows).set({ isActive: false }).where(eq(shows.isActive, true));

    const rows = await db
      .insert(shows)
      .values({ name: name.trim(), startedAt: new Date(), isActive: true })
      .returning();
    const result = rows[0];

    broadcast("show_started", result);
    return res.status(201).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create show" });
  }
});

router.get("/shows/current", async (_req, res) => {
  try {
    const show = await getActiveShow();
    if (!show) {
      return res.json({ show: null, queue: [], nowPlaying: null, isPeakHours: false, lowEnergyAlert: false });
    }
    const state = await computeQueue(show.id);
    return res.json({ show, ...state });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to get current show" });
  }
});

router.post("/shows/end", async (_req, res) => {
  try {
    const show = await getActiveShow();
    if (!show) {
      return res.status(404).json({ error: "No active show" });
    }
    await db.update(shows).set({ isActive: false, endedAt: new Date() }).where(eq(shows.id, show.id));
    broadcast("show_ended", { showId: show.id });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to end show" });
  }
});

export default router;
