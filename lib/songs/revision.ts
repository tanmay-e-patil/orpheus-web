import type { LibrarySong } from "@/lib/songs/types";

export function getSongPageRevision(songs: LibrarySong[]): string {
  return songs
    .map((song) =>
      [
        song.trackId,
        song.artistName,
        song.name,
        song.albumName,
        song.albumArt,
        song.duration,
        song.youtubeVideoId,
      ].join("|")
    )
    .join("||");
}
