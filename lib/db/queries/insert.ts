import { db } from "..";
import {
  InsertSong,
  InsertYtMusicVideo,
  songsTable,
  ytMusicVideoTable,
} from "../schema";

export async function insertSong(data: InsertSong) {
  await db.insert(songsTable).values(data);
}

export async function insertYtMusicVideo(data: InsertYtMusicVideo) {
  await db.insert(ytMusicVideoTable).values(data);
}

export async function upsertSongInfo(
  song: InsertSong,
  video: InsertYtMusicVideo
) {
  await db.transaction(async (tx) => {
    await tx.insert(ytMusicVideoTable).values(video).onConflictDoUpdate({
      target: ytMusicVideoTable.id,
      set: video,
    });
    await tx.insert(songsTable).values(song).onConflictDoUpdate({
      target: songsTable.spotifyId,
      set: song,
    });
  });
}
