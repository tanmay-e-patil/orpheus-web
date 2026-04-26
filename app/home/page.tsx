import { db } from "@/lib/db";
import SongTable from "./_components/SongTable";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { songLibrarySelection } from "@/lib/songs/query";
import { songsTable } from "@/lib/db/schema";
import { asc } from "drizzle-orm";

// server component; formatting handled client-side

export default async function MusicPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/");
  }
  const songs = await db
    .select(songLibrarySelection)
    .from(songsTable)
    .orderBy(asc(songsTable.artistName), asc(songsTable.trackId))
    .limit(50);
  return (
    <div className="container mx-auto w-full px-4 sm:px-6 py-4">
      <SongTable initialSongs={songs} userId={session.user.id} />
    </div>
  );
}
