// "use client";
import { Button } from "@/components/ui/button";
import { Metadata } from "next";
import { PlusCircledIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { db } from "@/lib/db";
import { songsTable } from "@/lib/db/schema";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// export const metadata: Metadata = {
//   title: "Music App",
//   description: "Example music app using the components.",
// };

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

export default async function MusicPage() {
  const songs = await db
    .select //{
    // spotifyId: songsTable.spotifyId,
    // title: songsTable.name,
    // artist: songsTable.artistName
    //}
    ()
    .from(songsTable)
    .orderBy(songsTable.artistName); //await getSongTable();
  return (
    <>
      <div className="w-full space-y-4 py-4 px-2">
        <div className="px-3 py-2 flex justify-between">
          <h2 className="mb-2 px-3 text-2xl font-semibold tracking-tight">
            All tracks
          </h2>
          <Link href="/search">
            <Button className="mb-2 px-4 font-semibold tracking-tight">
              <PlusCircledIcon />
              Add music
            </Button>
          </Link>
        </div>
        <Table className="bg-accent">
          {/* <TableCaption>A list of your recent invoices.</TableCaption> */}
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
            {songs.map((song, idx) => (
              <TableRow key={song.spotifyId} className="disabled">
                <TableCell className="font-medium">{idx + 1}</TableCell>
                <TableCell>
                  <div className="flex">{song.name}</div>
                </TableCell>
                <TableCell>{song.artistName}</TableCell>
                <TableCell>{song.albumName}</TableCell>
                <TableCell>{formatIsoDuration(song.duration)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
