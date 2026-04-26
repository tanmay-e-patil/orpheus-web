import { and, asc, eq, gt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { songsTable } from "@/lib/db/schema";
import { getSongPageRevision } from "@/lib/songs/revision";
import {
  SONGS_PAGE_SIZE,
  type LibrarySong,
  type SongCursor,
  type SongsPageResponse,
} from "@/lib/songs/types";

export const songLibrarySelection = {
  trackId: songsTable.trackId,
  name: songsTable.name,
  artistName: songsTable.artistName,
  albumName: songsTable.albumName,
  albumArt: songsTable.albumArt,
  duration: songsTable.duration,
  youtubeVideoId: songsTable.youtubeVideoId,
};

export async function fetchSongsPage(
  cursor?: SongCursor,
  limit = SONGS_PAGE_SIZE
): Promise<SongsPageResponse> {
  const rows = await db
    .select(songLibrarySelection)
    .from(songsTable)
    .where(
      cursor
        ? or(
            gt(songsTable.artistName, cursor.artistName),
            and(
              eq(songsTable.artistName, cursor.artistName),
              gt(songsTable.trackId, cursor.trackId)
            )
          )
        : undefined
    )
    .orderBy(asc(songsTable.artistName), asc(songsTable.trackId))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const songs = rows.slice(0, limit);
  const lastSong = songs[songs.length - 1];

  return {
    songs,
    nextCursor: hasMore && lastSong
      ? { artistName: lastSong.artistName, trackId: lastSong.trackId }
      : null,
    hasMore,
    pageRevision: getSongPageRevision(songs),
  };
}
