import { Router } from "express";
import { db } from "@workspace/db";
import { songs } from "@workspace/db";
import { eq, like, or } from "drizzle-orm";

const router = Router();

router.get("/songs", async (req, res) => {
  try {
    const q = (req.query["q"] as string | undefined)?.trim();
    if (!q || q.length < 1) {
      const results = await db.select().from(songs).limit(50);
      return res.json(results);
    }

    const pattern = `%${q}%`;
    const results = await db
      .select()
      .from(songs)
      .where(
        or(
          like(songs.title, pattern),
          like(songs.artist, pattern)
        )
      )
      .limit(50);

    return res.json(results);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Search failed" });
  }
});

router.get("/songs/:id", async (req, res) => {
  try {
    const id = parseInt(req.params["id"] ?? "0", 10);
    const rows = await db.select().from(songs).where(eq(songs.id, id));
    const song = rows[0];
    if (!song) return res.status(404).json({ error: "Song not found" });
    return res.json(song);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to get song" });
  }
});

router.patch("/songs/:id", async (req, res) => {
  try {
    const id = parseInt(req.params["id"] ?? "0", 10);
    const { bpm, energyScore } = req.body as { bpm?: number; energyScore?: number };

    const updates: Record<string, number> = {};
    if (bpm !== undefined) updates["bpm"] = bpm;
    if (energyScore !== undefined) updates["energyScore"] = energyScore;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const rows = await db.update(songs).set(updates).where(eq(songs.id, id)).returning();
    const updated = rows[0];
    if (!updated) return res.status(404).json({ error: "Song not found" });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update song" });
  }
});

export default router;
