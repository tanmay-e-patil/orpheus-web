"use server";

import { db } from "@/lib/db";
import { songsTable } from "@/lib/db/schema";
import { eq, and, or, gt, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

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
