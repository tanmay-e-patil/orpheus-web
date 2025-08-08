"use client";
import { useMemo, useRef, useState } from "react";
import { usePlayerStore } from "@/lib/player/store";
import { Button } from "@/components/ui/button";
import {
  Pause as PauseIcon,
  Play as PlayIcon,
  SkipBack as SkipBackIcon,
  SkipForward as SkipForwardIcon,
  Heart,
  Volume2,
  VolumeX,
} from "lucide-react";

function formatTime(sec: number) {
  if (!Number.isFinite(sec)) return "0:00";
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function PlayerBar() {
  const { queue, currentIndex, status, currentTime, duration, controller } =
    usePlayerStore((s) => s);
  const play = usePlayerStore((s) => s.play);
  const pause = usePlayerStore((s) => s.pause);
  const next = usePlayerStore((s) => s.next);
  const prev = usePlayerStore((s) => s.prev);
  const seek = usePlayerStore((s) => s.seek);

  const now = queue[currentIndex];
  const progressPct = useMemo(
    () => (duration > 0 ? (currentTime / duration) * 100 : 0),
    [currentTime, duration]
  );

  // Volume UI state (stored locally; mapped to YouTube controller)
  const [volume, setVolume] = useState<number>(
    controller?.getVolume?.() ?? 100
  );
  const [isMuted, setIsMuted] = useState<boolean>(
    controller?.isMuted?.() ?? false
  );
  const [showVolume, setShowVolume] = useState<boolean>(false);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const volumeBarRef = useRef<HTMLDivElement>(null);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !Number.isFinite(duration) || duration <= 0)
      return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    const newTime = pct * duration;
    seek(newTime);
  };

  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!volumeBarRef.current) return;
    const rect = volumeBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    const v = Math.round(pct * 100);
    setVolume(v);
    controller?.setVolume?.(v);
    setIsMuted(v === 0 ? true : controller?.isMuted?.() ?? false);
  };

  const toggleMute = () => {
    controller?.toggleMute?.();
    const nextMuted = controller?.isMuted?.() ?? false;
    setIsMuted(nextMuted);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] bg-[#181818] border-t border-[#282828]">
      {/* Track info */}
      <div className="flex items-center space-x-3 w-1/3">
        {now && (
          <>
            <img
              src={now.albumArt || "/placeholder.svg"}
              alt="Now playing"
              className="w-10 h-10 object-cover"
            />
            <div className="flex-shrink min-w-0">
              <div className="text-sm font-medium truncate max-w-[120px] sm:max-w-[200px] text-gray-200">
                {now.name}
              </div>
              <div className="text-xs text-gray-400 truncate max-w-[120px] sm:max-w-[200px]">
                {now.artistName}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0 hidden sm:flex"
            >
              <Heart className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>

      {/* Center controls */}
      <div className="flex flex-col items-center w-1/3">
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={prev}
            disabled={!now}
          >
            <SkipBackIcon className="w-4 h-4 stroke-[1.5]" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={status === "playing" ? pause : play}
            disabled={!now}
          >
            {status === "playing" ? (
              <PauseIcon className="w-5 h-5 stroke-[1.5]" />
            ) : (
              <PlayIcon className="w-5 h-5 stroke-[1.5]" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={next}
            disabled={!now}
          >
            <SkipForwardIcon className="w-4 h-4 stroke-[1.5]" />
          </Button>
        </div>
        <div className="flex items-center w-full mt-1">
          <span className="text-xs tabular-nums text-gray-400">
            {formatTime(currentTime)}
          </span>
          <div
            ref={progressBarRef}
            className="flex-grow mx-2 h-1 bg-[#3E3E3E] rounded-full cursor-pointer relative"
            onClick={handleProgressClick}
          >
            <div
              className="absolute top-0 left-0 h-full bg-white rounded-full"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-gray-400">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Volume */}
      <div className="flex items-center justify-end space-x-2 w-1/3">
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              toggleMute();
              setShowVolume((v) => !v);
            }}
            disabled={!now}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-gray-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-gray-400" />
            )}
          </Button>
          {showVolume && (
            <div className="absolute bottom-full right-0 mb-2 p-2 bg-[#282828] rounded-md shadow-lg">
              <div
                ref={volumeBarRef}
                className="w-20 h-1 bg-[#3E3E3E] rounded-full cursor-pointer relative"
                onClick={handleVolumeClick}
              >
                <div
                  className="absolute top-0 left-0 h-full bg-white rounded-full"
                  style={{ width: `${volume}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
