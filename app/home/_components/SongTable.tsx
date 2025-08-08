"use client";
import * as React from "react";
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
import Image from "next/image";

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

  const filtered = songs;

  const onRowClick = (idx: number) => {
    const sel = songs[idx];
    if (!sel?.youtubeVideoId) {
      toastError("No playable source.");
      return;
    }
    setQueue(songs, idx);
  };

  return (
    <div className="bg-background">
      {/* Desktop/tablet table */}
      <Table className="hidden md:table">
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
          {filtered.map((song, idx) => {
            const isActive = song.spotifyId === activeId;
            return (
              <TableRow
                key={song.spotifyId}
                className={`cursor-pointer ${isActive ? "bg-primary/10" : ""}`}
                onClick={() => onRowClick(idx)}
              >
                <TableCell className="font-medium">{idx + 1}</TableCell>
                <TableCell className="truncate max-w-48 flex gap-2 items-center">
                  <Image src={song.albumArt} width={24} height={24} alt="" />
                  <span className="truncate">{song.name}</span>
                </TableCell>
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

      {/* Mobile list */}
      <ul className="md:hidden divide-y">
        {filtered.map((song, idx) => {
          const isActive = song.spotifyId === activeId;
          return (
            <li
              key={song.spotifyId}
              className={`flex items-center gap-3 py-3 cursor-pointer ${
                isActive ? "bg-primary/10" : ""
              }`}
              onClick={() => onRowClick(idx)}
            >
              <Image
                src={song.albumArt}
                width={48}
                height={48}
                alt=""
                className="rounded object-cover flex-shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-sm">{song.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {song.artistName}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {formatIsoDuration(song.duration)}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
