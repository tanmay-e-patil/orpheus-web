"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePlayerStore } from "@/lib/player/store";
import { parseLRC, findActiveIndex } from "@/lib/player/lrc";
import { Button } from "@/components/ui/button";
import { Play, Pause, X } from "lucide-react";

interface SyncLyricsTestProps {
  syncedLyrics: string;
  youtubeVideoId: string;
  onClose: () => void;
}

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function SyncLyricsTest({
  syncedLyrics,
  youtubeVideoId,
  onClose,
}: SyncLyricsTestProps) {
  const controller = usePlayerStore((s) => s.controller);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const status = usePlayerStore((s) => s.status);
  const play = usePlayerStore((s) => s.play);
  const pause = usePlayerStore((s) => s.pause);
  const duration = usePlayerStore((s) => s.duration);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const lines = useMemo(() => parseLRC(syncedLyrics), [syncedLyrics]);
  const activeIndex = useMemo(
    () => findActiveIndex(lines, currentTime * 1000),
    [lines, currentTime]
  );

  // Load the YouTube video when this component mounts
  useEffect(() => {
    if (!controller) return;
    controller.load(youtubeVideoId);
    controller.play();
    usePlayerStore.setState({ status: "playing" });
  }, [controller, youtubeVideoId]);

  // Stop playback when component unmounts
  useEffect(() => {
    return () => {
      usePlayerStore.getState().controller?.pause();
    };
  }, []);

  // Scroll active line into view
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

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mt-3 rounded-lg border bg-muted/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Sync test — playing YouTube audio
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="w-3 h-3" />
        </Button>
      </div>

      {/* Scrolling lyrics */}
      <div
        ref={containerRef}
        className="max-h-36 overflow-y-auto space-y-0.5 rounded bg-background p-2"
      >
        {lines.length === 0 ? (
          <p className="text-xs text-muted-foreground">No synced lines parsed.</p>
        ) : (
          lines.map((l, i) => (
            <p
              key={i}
              data-idx={i}
              className={`text-sm transition-colors leading-5 ${
                i === activeIndex
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {l.text}
            </p>
          ))
        )}
      </div>

      {/* Playback controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={status === "playing" ? pause : play}
        >
          {status === "playing" ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </Button>
        <div className="flex-1 h-1 rounded-full bg-border relative">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground flex-shrink-0">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
