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
