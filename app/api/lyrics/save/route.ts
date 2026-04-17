import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { songsTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const spotifyId: string = body.trackId ?? body.spotifyId;
    const plainLyrics: string = body.plainLyrics ?? "";
    const syncedLyrics: string = body.syncedLyrics ?? "";

    if (!spotifyId) {
      return NextResponse.json(
        { error: "trackId required" },
        { status: 400 }
      );
    }

    const isLyricsAvailable = Boolean(plainLyrics || syncedLyrics);

    await db
      .update(songsTable)
      .set({
        lyrics: plainLyrics,
        syncedLyrics,
        isLyricsAvailable,
        updatedAt: new Date(),
      })
      .where(eq(songsTable.trackId, spotifyId));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("/api/lyrics/save POST error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
