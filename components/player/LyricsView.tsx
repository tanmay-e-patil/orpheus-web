"use client";
import { useEffect, useMemo, useRef } from "react";
import { usePlayerStore } from "@/lib/player/store";
import { findActiveIndex, parseLRC } from "@/lib/player/lrc";

export default function LyricsView() {
  const current = usePlayerStore((s) => s.queue[s.currentIndex]);
  const currentTime = usePlayerStore((s) => s.currentTime);

  const lines = useMemo(
    () => parseLRC(current?.syncedLyrics || ""),
    [current?.syncedLyrics]
  );
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

  if (!current) return null;
  const noSynced = !current.isLyricsAvailable || !current.syncedLyrics;

  return (
    <aside className="fixed right-4 top-4 bottom-24 z-30 w-80 overflow-hidden rounded-md border bg-background/80 p-3 backdrop-blur">
      <div className="mb-3 flex items-center gap-3">
        <img
          src={current.albumArt}
          alt="Album"
          className="size-12 rounded object-cover"
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{current.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {current.artistName}
          </div>
        </div>
      </div>
      <div
        ref={containerRef}
        className="h-[calc(100%-3.5rem)] overflow-y-auto pr-2"
      >
        {noSynced ? (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {current.lyrics || "Lyrics not available."}
          </p>
        ) : (
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
        )}
      </div>
    </aside>
  );
}
