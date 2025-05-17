import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
export const songsTable = pgTable("songs", {
  spotifyId: text("id").notNull().primaryKey(),
  name: text("name").notNull(),
  artistName: text("artist_name").notNull().default("Unknown"),
  albumName: text("album_name").notNull().default("Unknown"),
  duration: text("duration").notNull(),
  youtubeVideoId: text("yt_video_id").notNull(),
  isAvailable: boolean("is_available").default(false),
  releaseDate: text("release_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type InsertSong = typeof songsTable.$inferInsert;
