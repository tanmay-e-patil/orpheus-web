import { boolean, date, pgTable, text, timestamp } from "drizzle-orm/pg-core";
export const songsTable = pgTable("songs", {
  spotifyId: text("id").notNull().primaryKey(),
  name: text("name").notNull(),
  artistName: text("artist_name").notNull().default("Unknown"),
  albumName: text("album_name").notNull().default("Unknown"),
  albumArt: text("album_art").notNull(),
  lyrics: text("lyrics").notNull().default(""),
  // Raw synced lyrics in LRC (or other timecoded) format
  syncedLyrics: text("synced_lyrics").notNull().default(""),
  isLyricsAvailable: boolean("is_lyrics_available").default(false),
  duration: text("duration").notNull(),
  youtubeVideoId: text("yt_video_id")
    .notNull()
    .references(() => ytMusicVideoTable.id),
  isAvailable: boolean("is_available").default(false),
  releaseDate: date("release_date").notNull(),
  releaseYear: text("release_year").default("Unknown"),
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

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  username: text("username").unique(),
  displayUsername: text("display_username"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(
    () => /* @__PURE__ */ new Date()
  ),
  updatedAt: timestamp("updated_at").$defaultFn(
    () => /* @__PURE__ */ new Date()
  ),
});
