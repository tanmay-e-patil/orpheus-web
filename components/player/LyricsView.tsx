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
    <aside className="ml-auto w-80 shrink-0 overflow-hidden rounded-md border bg-background p-3 md:sticky md:self-start z-0 flex flex-col">
      <div className="mb-3 flex flex-col items-left gap-3">
        <img
          src={current.albumArt}
          alt="Album"
          className="rounded object-cover"
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{current.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {current.artistName}
          </div>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto pr-2">
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
