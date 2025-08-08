"use client";
import { useMemo } from "react";
import { usePlayerStore } from "@/lib/player/store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from "lucide-react";

function formatTime(sec: number) {
  if (!Number.isFinite(sec)) return "0:00";
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function PlayerBar() {
  const { queue, currentIndex, status, currentTime, duration } = usePlayerStore(
    (s) => s
  );
  const play = usePlayerStore((s) => s.play);
  const pause = usePlayerStore((s) => s.pause);
  const next = usePlayerStore((s) => s.next);
  const prev = usePlayerStore((s) => s.prev);
  const seek = usePlayerStore((s) => s.seek);

  const now = queue[currentIndex];
  const progress = useMemo(
    () => (duration > 0 ? (currentTime / duration) * 100 : 0),
    [currentTime, duration]
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-4">
      <Card className="mx-auto flex max-w-5xl items-center gap-4 p-3">
        <img
          src={now?.albumArt}
          alt="Album art"
          className="size-12 rounded object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{now?.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {now?.artistName}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => {
                const pct = Number(e.target.value);
                const newSec = (pct / 100) * (duration || 0);
                seek(newSec);
              }}
              className="w-full"
            />
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {formatTime(duration)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous"
            onClick={prev}
          >
            <SkipBackIcon className="size-5" />
          </Button>
          {status === "playing" ? (
            <Button
              variant="default"
              size="icon"
              aria-label="Pause"
              onClick={pause}
            >
              <PauseIcon className="size-6" />
            </Button>
          ) : (
            <Button
              variant="default"
              size="icon"
              aria-label="Play"
              onClick={play}
            >
              <PlayIcon className="size-6" />
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label="Next" onClick={next}>
            <SkipForwardIcon className="size-5" />
          </Button>
        </div>
        <div className="text-[10px] text-muted-foreground">
          Audio via YouTube •{" "}
          {now?.youtubeVideoId ? (
            <a
              href={`https://www.youtube.com/watch?v=${now.youtubeVideoId}`}
              target="_blank"
              rel="noreferrer noopener"
              className="underline"
            >
              Open on YouTube
            </a>
          ) : (
            "Open on YouTube"
          )}
        </div>
      </Card>
    </div>
  );
}
