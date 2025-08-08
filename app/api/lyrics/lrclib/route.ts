import { NextResponse } from "next/server";

// Parse ISO-8601 duration like PT3M45S -> seconds
function iso8601ToSeconds(iso: string | null | undefined): number | null {
  if (!iso) return null;
  // Basic parser for PT#H#M#S
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (!match) return null;
  const h = parseFloat(match[1] || "0");
  const m = parseFloat(match[2] || "0");
  const s = parseFloat(match[3] || "0");
  return Math.round(h * 3600 + m * 60 + s);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const trackName: string = body.trackName;
    const artistName: string = body.artistName;
    const albumName: string = body.albumName;
    const durationSecInput: number | undefined = body.durationSec;
    const isoDuration: string | undefined = body.isoDuration;

    const durationSec =
      typeof durationSecInput === "number"
        ? durationSecInput
        : iso8601ToSeconds(isoDuration ?? null);

    if (!trackName || !artistName || !albumName || !durationSec) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
      album_name: albumName,
      duration: String(durationSec),
    });

    const url = `https://lrclib.net/api/get?${params.toString()}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Orpheus-Web (https://github.com/tanmay-e-patil/orpheus-web)",
      },
      // Cache bust to improve fresh results for new tracks
      cache: "no-store",
    });

    if (res.status === 404) {
      return NextResponse.json({ notFound: true }, { status: 404 });
    }
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `LRCLIB error: ${res.status} ${text}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const payload = {
      trackName: data.trackName as string,
      artistName: data.artistName as string,
      albumName: data.albumName as string,
      duration: data.duration as number,
      plainLyrics: (data.plainLyrics as string) || "",
      syncedLyrics: (data.syncedLyrics as string) || "",
      instrumental: Boolean(data.instrumental),
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("/api/lyrics/lrclib POST error", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
