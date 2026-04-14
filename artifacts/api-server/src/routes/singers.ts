import { Router } from "express";
import { db } from "@workspace/db";
import { singers } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getActiveShow } from "../lib/rotation.js";

const router = Router();

router.post("/singers", async (req, res) => {
  try {
    const { name } = req.body as { name?: string };
    if (!name?.trim()) {
      return res.status(400).json({ error: "Singer name is required" });
    }

    const show = await getActiveShow();
    if (!show) {
      return res.status(400).json({ error: "No active show. Ask the KJ to start a show first." });
    }

    const rows = await db
      .insert(singers)
      .values({
        showId: show.id,
        name: name.trim(),
        virtualStageTimeMinutes: -10,
        songsSung: 0,
        joinedAt: new Date(),
      })
      .returning();
    const singer = rows[0];

    return res.status(201).json(singer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to register singer" });
  }
});

router.get("/singers", async (_req, res) => {
  try {
    const show = await getActiveShow();
    if (!show) return res.json([]);
    const result = await db.select().from(singers).where(eq(singers.showId, show.id));
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to list singers" });
  }
});

export default router;
