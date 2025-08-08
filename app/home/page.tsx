// "use client";
import { Button } from "@/components/ui/button";
import { PlusCircledIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { db } from "@/lib/db";
import { songsTable } from "@/lib/db/schema";
import SongTable from "./_components/SongTable";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

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
    .orderBy(songsTable.artistName); //await getSongTable();
  return (
    <div className="container mx-auto w-full">
      <div className="space-y-4 py-4">
        <div className="py-2 flex justify-between">
          <h2 className="mb-2 text-2xl font-semibold tracking-tight">
            All tracks
          </h2>
          <Link href="/discover">
            <Button className="mb-2 px-4 font-semibold tracking-tight">
              <PlusCircledIcon />
              Add music
            </Button>
          </Link>
        </div>
        <SongTable songs={songs as any} />
      </div>
    </div>
  );
}
