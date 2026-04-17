"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePlayerStore } from "@/lib/player/store";
import { useAlbumArt } from "@/lib/player/useAlbumArt";
import { findActiveIndex, parseLRC } from "@/lib/player/lrc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function LyricsView() {
  const current = usePlayerStore((s) => s.queue[s.currentIndex]);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const albumArt = useAlbumArt(current?.trackId ?? "", current?.albumArt ?? "");
  const [fetched, setFetched] = useState<{
    plainLyrics: string;
    syncedLyrics: string;
  } | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Prefer live fetched synced lyrics for preview before saving
  const lines = useMemo(() => {
    const src = fetched?.syncedLyrics?.trim()?.length
      ? fetched.syncedLyrics
      : current?.syncedLyrics || "";
    return parseLRC(src);
  }, [fetched?.syncedLyrics, current?.syncedLyrics]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeIndex = useMemo(
    () => findActiveIndex(lines, currentTime * 1000),
    [lines, currentTime]
  );

  useEffect(() => {
    if (activeIndex < 0) return;
    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-idx="${activeIndex}"]`
    );
    if (el && containerRef.current) {
      const prefersReduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      el.scrollIntoView({
        behavior: prefersReduced ? "auto" : "smooth",
        block: "center",
      });
    }
  }, [activeIndex]);

  // Try to fetch lyrics from LRCLIB when not available
  useEffect(() => {
    setFetched(null);
    if (!current) return;
    const shouldFetch =
      (!current.lyrics || !current.syncedLyrics) && !isFetching;
    if (!shouldFetch) return;
    const controller = new AbortController();
    const run = async () => {
      try {
        setIsFetching(true);
        const res = await fetch("/api/lyrics/lrclib", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackName: current.name,
            artistName: current.artistName,
            albumName: current.albumName,
            isoDuration: current.duration, // stored as ISO-8601
          }),
          signal: controller.signal,
        });
        if (res.status === 404) return; // not found, keep quiet
        if (!res.ok) {
          const t = await res.text();
          console.error("LRCLIB fetch failed", t);
          return;
        }
        const data = await res.json();
        setFetched({
          plainLyrics: data.plainLyrics || "",
          syncedLyrics: data.syncedLyrics || "",
        });
      } catch (e) {
        if ((e as any)?.name !== "AbortError") console.error(e);
      } finally {
        setIsFetching(false);
      }
    };
    run();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.spotifyId]);

  if (!current) return null;
  const hasFetchedSynced = Boolean(fetched?.syncedLyrics?.trim()?.length);
  const hasLocalSynced = Boolean(current.syncedLyrics?.trim()?.length);
  const showSynced = hasFetchedSynced || hasLocalSynced;

  return (
    <aside className="ml-auto w-80 shrink-0 rounded-md border bg-background p-3 md:sticky md:self-start z-0 flex flex-col max-h-[93vh] overflow-hidden">
      <div className="mb-3 flex flex-col items-left gap-3 sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-1 pb-2 z-10">
        <img
          src={albumArt.src || "/placeholder.svg"}
          alt="Album"
          className="rounded object-cover"
          onError={albumArt.onError}
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{current.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {current.artistName}
          </div>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto pr-2">
        {!showSynced ? (
          <div className="space-y-3">
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {current.lyrics ||
                (isFetching
                  ? "Looking up lyrics from LRCLIB…"
                  : fetched?.plainLyrics || "Lyrics not available.")}
            </p>
            {fetched && (fetched.syncedLyrics || fetched.plainLyrics) && (
              <Button
                size="sm"
                variant="secondary"
                disabled={isSaving}
                onClick={async () => {
                  try {
                    setIsSaving(true);
                    const res = await fetch("/api/lyrics/save", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        spotifyId: current.spotifyId,
                        plainLyrics: fetched.plainLyrics,
                        syncedLyrics: fetched.syncedLyrics,
                      }),
                    });
                    if (!res.ok) throw new Error(await res.text());
                    toast.success("Lyrics saved to library");
                    // Update local player store so UI reflects saved lyrics immediately
                    usePlayerStore.setState((s) => {
                      const q = [...s.queue];
                      const idx = s.currentIndex;
                      const cur = q[idx];
                      if (cur) {
                        q[idx] = {
                          ...cur,
                          lyrics: fetched.plainLyrics,
                          syncedLyrics: fetched.syncedLyrics,
                          isLyricsAvailable: true,
                        } as any;
                      }
                      return { queue: q } as any;
                    });
                  } catch (err) {
                    console.error(err);
                    toast.error("Failed to save lyrics");
                  } finally {
                    setIsSaving(false);
                  }
                }}
              >
                {isSaving ? "Saving…" : "Save lyrics to library"}
              </Button>
            )}
          </div>
        ) : (
          <>
            {hasFetchedSynced && !hasLocalSynced && (
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Preview from LRCLIB (unsaved)
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isSaving}
                  onClick={async () => {
                    try {
                      setIsSaving(true);
                      const res = await fetch("/api/lyrics/save", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          spotifyId: current.spotifyId,
                          plainLyrics: fetched?.plainLyrics || "",
                          syncedLyrics: fetched?.syncedLyrics || "",
                        }),
                      });
                      if (!res.ok) throw new Error(await res.text());
                      toast.success("Lyrics saved to library");
                      usePlayerStore.setState((s) => {
                        const q = [...s.queue];
                        const idx = s.currentIndex;
                        const cur = q[idx];
                        if (cur) {
                          q[idx] = {
                            ...cur,
                            lyrics: fetched?.plainLyrics || "",
                            syncedLyrics: fetched?.syncedLyrics || "",
                            isLyricsAvailable: true,
                          } as any;
                        }
                        return { queue: q } as any;
                      });
                    } catch (err) {
                      console.error(err);
                      toast.error("Failed to save lyrics");
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                >
                  {isSaving ? "Saving…" : "Save"}
                </Button>
              </div>
            )}
            <ul className="space-y-1 text-sm leading-6">
              {lines.map((l, i) => (
                <li
                  key={i}
                  data-idx={i}
                  className={
                    i === activeIndex
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground"
                  }
                >
                  {l.text}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
