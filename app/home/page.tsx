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
    <div className="container mx-auto w-full px-4 sm:px-6 py-4">
      <SongTable songs={songs as any} />
    </div>
  );
}
