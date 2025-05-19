import { boolean, date, pgTable, text, timestamp } from "drizzle-orm/pg-core";
export const songsTable = pgTable("songs", {
  spotifyId: text("id").notNull().primaryKey(),
  name: text("name").notNull(),
  artistName: text("artist_name").notNull().default("Unknown"),
  albumName: text("album_name").notNull().default("Unknown"),
  albumArt: text("album_art").notNull(),
  duration: text("duration").notNull(),
  youtubeVideoId: text("yt_video_id")
    .notNull()
    .references(() => ytMusicVideoTable.id),
  isAvailable: boolean("is_available").default(false),
  releaseDate: date("release_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const ytMusicVideoTable = pgTable("yt_music_videos", {
  id: text("id").notNull().primaryKey(),
  title: text("title").notNull(),
  thumbnail: text("thumbnail").notNull(),
  channelTitle: text("channel_title").notNull(),
  publishedAt: text("published_at").notNull(),
  duration: text("duration"),
  viewCount: text("view_count"),
});

export type InsertSong = typeof songsTable.$inferInsert;
export type InsertYtMusicVideo = typeof ytMusicVideoTable.$inferInsert;
