import { db } from "..";
import { InsertSong, songsTable } from "../schema";

export async function insertSong(data: InsertSong) {
  await db.insert(songsTable).values(data);
}
