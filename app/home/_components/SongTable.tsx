"use client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePlayerStore } from "@/lib/player/store";
import type { Song } from "@/lib/player/types";
import { toastError } from "@/lib/toast";

export function formatIsoDuration(isoDuration: string | null): string | null {
  if (!isoDuration) return null;
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const hours = match[1] ? Number.parseInt(match[1]) : 0;
  const minutes = match[2] ? Number.parseInt(match[2]) : 0;
  const seconds = match[3] ? Number.parseInt(match[3]) : 0;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  } else {
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
}

export default function SongTable({ songs }: { songs: Song[] }) {
  const setQueue = usePlayerStore((s) => s.setQueue);
  const activeId = usePlayerStore((s) => s.queue[s.currentIndex]?.spotifyId);

  const onRowClick = (idx: number) => {
    const sel = songs[idx];
    if (!sel?.youtubeVideoId) {
      toastError("No playable source.");
      return;
    }
    setQueue(songs, idx);
  };

  return (
    <Table className="bg-accent">
      <TableHeader>
        <TableRow>
          <TableHead>#</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Artist</TableHead>
          <TableHead>Album</TableHead>
          <TableHead>Duration</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {songs.map((song, idx) => {
          const isActive = song.spotifyId === activeId;
          return (
            <TableRow
              key={song.spotifyId}
              className={`cursor-pointer ${isActive ? "bg-primary/10" : ""}`}
              onClick={() => onRowClick(idx)}
            >
              <TableCell className="font-medium">{idx + 1}</TableCell>
              <TableCell className="truncate max-w-32">{song.name}</TableCell>
              <TableCell className="truncate max-w-32">
                {song.artistName}
              </TableCell>
              <TableCell className="truncate max-w-32">
                {song.albumName}
              </TableCell>
              <TableCell>{formatIsoDuration(song.duration)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
