import { auth } from "@/lib/auth";
import { fetchSongsPage } from "@/lib/songs/query";
import type { SongCursor } from "@/lib/songs/types";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

function parseCursor(searchParams: URLSearchParams): SongCursor | undefined {
  const artistName = searchParams.get("artistName");
  const trackId = searchParams.get("trackId");

  if (!artistName || !trackId) {
    return undefined;
  }

  return { artistName, trackId };
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = await fetchSongsPage(parseCursor(searchParams));
  return NextResponse.json(page);
}
