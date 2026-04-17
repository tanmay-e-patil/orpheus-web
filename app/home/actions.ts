"use server";

import { db } from "@/lib/db";
import { songsTable } from "@/lib/db/schema";
import { eq, and, or, gt, asc, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function refreshAlbumArtsBatch(
  trackIds: string[]
): Promise<Record<string, string>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const results: Record<string, string> = {};
  console.log(`[albumArt] refreshing ${trackIds.length} tracks`);

  const songs = await db
    .select({ trackId: songsTable.trackId, name: songsTable.name, artistName: songsTable.artistName })
    .from(songsTable)
    .where(inArray(songsTable.trackId, trackIds));

  for (const song of songs) {
    await new Promise((r) => setTimeout(r, 120));

    const q = encodeURIComponent(`track:"${song.name}" artist:"${song.artistName}"`);
    const res = await fetch(`https://api.deezer.com/search?q=${q}&limit=1`);
    if (!res.ok) {
      console.warn(`[albumArt] Deezer ${res.status} for trackId=${song.trackId} ("${song.name}" - "${song.artistName}")`);
      continue;
    }

    const data = await res.json();
    const track = data?.data?.[0];
    const albumArt: string =
      track?.album?.cover_xl ||
      track?.album?.cover_big ||
      track?.album?.cover_medium ||
      track?.album?.cover ||
      "";

    if (!albumArt) {
      console.warn(`[albumArt] no cover found for trackId=${song.trackId} ("${song.name}" - "${song.artistName}")`);
      continue;
    }

    results[song.trackId] = albumArt;
    await db
      .update(songsTable)
      .set({ albumArt })
      .where(eq(songsTable.trackId, song.trackId));
    console.log(`[albumArt] updated trackId=${song.trackId} ("${song.name}")`);
  }

  console.log(`[albumArt] done — ${Object.keys(results).length}/${trackIds.length} updated`);
  return results;
}

export async function getMoreSongs(
  cursor?: { artistName: string; trackId: string },
  limit = 50
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const baseQuery = db.select().from(songsTable);

  const filteredQuery = cursor
    ? baseQuery.where(
        or(
          gt(songsTable.artistName, cursor.artistName),
          and(
            eq(songsTable.artistName, cursor.artistName),
            gt(songsTable.trackId, cursor.trackId)
          )
        )
      )
    : baseQuery;

  return await filteredQuery
    .orderBy(asc(songsTable.artistName), asc(songsTable.trackId))
    .limit(limit);
}
