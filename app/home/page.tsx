import { db } from "@/lib/db";
import { songsTable } from "@/lib/db/schema";
import SongTable from "./_components/SongTable";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import type { Song } from "@/lib/player/types";

// server component; formatting handled client-side

export default async function MusicPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/");
  }
  const songs = await db
    .select()
    .from(songsTable)
    .orderBy(asc(songsTable.artistName), asc(songsTable.trackId))
    .limit(50);
  return (
    <div className="container mx-auto w-full px-4 sm:px-6 py-4">
      <SongTable initialSongs={songs as unknown as Song[]} />
    </div>
  );
}
