"use client";
import { create } from "zustand";
import type { PlayerController, PlayerStatus, Song } from "./types";

export type PlayerState = {
  queue: Song[];
  currentIndex: number;
  status: PlayerStatus;
  currentTime: number;
  duration: number;
  controller: PlayerController | null;
  // UI state
  isLyricsOverlayOpen?: boolean;
  // actions
  setController: (ctrl: PlayerController) => void;
  setQueue: (songs: Song[], startIndex: number) => void;
  updateSongAlbumArt: (trackId: string, albumArt: string) => void;
  play: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setTime: (t: number) => void;
  setDuration: (d: number) => void;
  onEnded: () => void;
  openLyricsOverlay?: () => void;
  closeLyricsOverlay?: () => void;
  toggleLyricsOverlay?: () => void;
};

export const usePlayerStore = create<PlayerState>(
  (
    set: (
      partial:
        | Partial<PlayerState>
        | ((state: PlayerState) => Partial<PlayerState>)
    ) => void,
    get: () => PlayerState
  ) => ({
    queue: [],
    currentIndex: 0,
    status: "idle",
    currentTime: 0,
    duration: 0,
    controller: null,
    isLyricsOverlayOpen: false,

    setController: (ctrl) => set({ controller: ctrl }),

    updateSongAlbumArt: (trackId, albumArt) =>
      set((s) => ({
        queue: s.queue.map((song) =>
          song.trackId === trackId ? { ...song, albumArt } : song
        ),
      })),

    setQueue: (songs, startIndex) => {
      const ctrl = get().controller;
      set({ queue: songs, currentIndex: startIndex, status: "loading" });
      const videoId = songs[startIndex]?.youtubeVideoId;
      if (ctrl && videoId) {
        ctrl.load(videoId);
        ctrl.play();
        set({ status: "playing" });
      }
    },

    play: () => {
      const ctrl = get().controller;
      if (ctrl) {
        ctrl.play();
        set({ status: "playing" });
      }
    },

    pause: () => {
      const ctrl = get().controller;
      if (ctrl) {
        ctrl.pause();
        set({ status: "paused" });
      }
    },

    next: () => {
      const { currentIndex, queue, controller } = get();
      const nextIndex = currentIndex + 1;
      if (nextIndex >= queue.length) {
        set({ status: "ended" });
        return;
      }
      set({ currentIndex: nextIndex, status: "loading", currentTime: 0 });
      const videoId = queue[nextIndex]?.youtubeVideoId;
      if (controller && videoId) {
        controller.load(videoId);
        controller.play();
        set({ status: "playing" });
      }
    },

    prev: () => {
      const { currentIndex, queue, controller } = get();
      const prevIndex = Math.max(0, currentIndex - 1);
      set({ currentIndex: prevIndex, status: "loading", currentTime: 0 });
      const videoId = queue[prevIndex]?.youtubeVideoId;
      if (controller && videoId) {
        controller.load(videoId);
        controller.play();
        set({ status: "playing" });
      }
    },

    seek: (seconds: number) => {
      const ctrl = get().controller;
      if (ctrl) ctrl.seekTo(seconds);
      set({ currentTime: seconds });
    },

    setTime: (t: number) => set({ currentTime: t }),
    setDuration: (d: number) => set({ duration: d }),

    onEnded: () => {
      get().next();
    },

    openLyricsOverlay: () => set({ isLyricsOverlayOpen: true }),
    closeLyricsOverlay: () => set({ isLyricsOverlayOpen: false }),
    toggleLyricsOverlay: () =>
      set((s) => ({ isLyricsOverlayOpen: !s.isLyricsOverlayOpen })),
  })
);
