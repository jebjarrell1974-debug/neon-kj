import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shows = sqliteTable("shows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  startedAt: integer("started_at", { mode: "timestamp" }),
  endedAt: integer("ended_at", { mode: "timestamp" }),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
});

export const singers = sqliteTable("singers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  showId: integer("show_id").references(() => shows.id).notNull(),
  name: text("name").notNull(),
  virtualStageTimeMinutes: real("virtual_stage_time_minutes").notNull().default(-10),
  songsSung: integer("songs_sung").notNull().default(0),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
});

export const songs = sqliteTable("songs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  bpm: integer("bpm"),
  genre: text("genre"),
  durationMinutes: real("duration_minutes").notNull().default(3.5),
  energyScore: integer("energy_score").notNull().default(5),
  filePath: text("file_path"),
  fileType: text("file_type"),
});

export const queueEntries = sqliteTable("queue_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  showId: integer("show_id").references(() => shows.id).notNull(),
  singerId: integer("singer_id").references(() => singers.id).notNull(),
  songId: integer("song_id").references(() => songs.id).notNull(),
  status: text("status", { enum: ["waiting", "performing", "done", "skipped"] })
    .notNull()
    .default("waiting"),
  position: integer("position").notNull().default(0),
  addedAt: integer("added_at", { mode: "timestamp" }).notNull(),
  performedAt: integer("performed_at", { mode: "timestamp" }),
});

export const performances = sqliteTable("performances", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  showId: integer("show_id").references(() => shows.id).notNull(),
  singerId: integer("singer_id").references(() => singers.id).notNull(),
  songId: integer("song_id").references(() => songs.id).notNull(),
  performedAt: integer("performed_at", { mode: "timestamp" }).notNull(),
  waitTimeMinutes: real("wait_time_minutes"),
  energyScore: integer("energy_score"),
});

export const insertShowSchema = createInsertSchema(shows).omit({ id: true });
export const insertSingerSchema = createInsertSchema(singers).omit({ id: true });
export const insertSongSchema = createInsertSchema(songs).omit({ id: true });
export const insertQueueEntrySchema = createInsertSchema(queueEntries).omit({ id: true });
export const insertPerformanceSchema = createInsertSchema(performances).omit({ id: true });

export type Show = typeof shows.$inferSelect;
export type Singer = typeof singers.$inferSelect;
export type Song = typeof songs.$inferSelect;
export type QueueEntry = typeof queueEntries.$inferSelect;
export type Performance = typeof performances.$inferSelect;

export type InsertShow = z.infer<typeof insertShowSchema>;
export type InsertSinger = z.infer<typeof insertSingerSchema>;
export type InsertSong = z.infer<typeof insertSongSchema>;
export type InsertQueueEntry = z.infer<typeof insertQueueEntrySchema>;
export type InsertPerformance = z.infer<typeof insertPerformanceSchema>;
