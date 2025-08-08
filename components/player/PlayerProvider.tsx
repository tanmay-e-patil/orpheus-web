"use client";
import { useEffect, useRef } from "react";
import { usePlayerStore } from "@/lib/player/store";
import { toastError } from "@/lib/toast";
import type { PlayerController } from "@/lib/player/types";

export default function PlayerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const setController = usePlayerStore((s) => s.setController);
  const controller = usePlayerStore((s) => s.controller);
  const queue = usePlayerStore((s) => s.queue);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const status = usePlayerStore((s) => s.status);
  const setTime = usePlayerStore((s) => s.setTime);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const onEnded = usePlayerStore((s) => s.onEnded);

  const playerRef = useRef<YT.Player | null>(null);
  const iframeHostRef = useRef<HTMLDivElement | null>(null);
  const initPlayer = () => {
    if (playerRef.current) return;
    if (!iframeHostRef.current) return;
    if (!(window as any).YT || !(window as any).YT.Player) return;

    playerRef.current = new YT.Player(iframeHostRef.current, {
      height: "1",
      width: "1",
      playerVars: {
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        rel: 0,
      },
      events: {
        onReady: (e) => {
          setDuration(e.target.getDuration() || 0);
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED) onEnded();
        },
        onError: () => {
          toastError("YouTube playback error. Skipping…");
          onEnded();
        },
      },
    });

    const ctrl: PlayerController = {
      load: (videoId: string) => {
        playerRef.current?.loadVideoById(videoId);
      },
      play: () => playerRef.current?.playVideo(),
      pause: () => playerRef.current?.pauseVideo(),
      seekTo: (s: number) => playerRef.current?.seekTo(s, true),
      getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
      getDuration: () => playerRef.current?.getDuration() ?? 0,
    };
    setController(ctrl);
  };

  // Load YouTube IFrame API once
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).YT && (window as any).YT.Player) return;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);
    (window as any).onYouTubeIframeAPIReady = () => {
      initPlayer();
    };
  }, []);

  // Try initializing when container mounts or if API already present
  useEffect(() => {
    initPlayer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeHostRef.current]);

  // If a queue is set before controller exists, load when ready
  useEffect(() => {
    const now = queue[currentIndex];
    if (!controller || !now?.youtubeVideoId) return;
    // Only auto-load on loading/idle
    if (status === "loading" || status === "idle") {
      controller.load(now.youtubeVideoId);
      controller.play();
    }
  }, [controller, queue, currentIndex, status]);

  // Poll current time ~4Hz for lyrics sync
  useEffect(() => {
    let raf: number;
    let last = 0;
    const step = () => {
      const now = performance.now();
      if (now - last > 250) {
        last = now;
        const t = playerRef.current?.getCurrentTime() ?? 0;
        const d = playerRef.current?.getDuration() ?? 0;
        setTime(t);
        setDuration(d);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [setTime, setDuration]);

  return (
    <>
      {/* Hidden/offscreen iframe host for audio-only */}
      <div
        style={{
          position: "fixed",
          width: 1,
          height: 1,
          left: -9999,
          top: -9999,
        }}
        ref={iframeHostRef}
        aria-hidden
      />
      {children}
    </>
  );
}
