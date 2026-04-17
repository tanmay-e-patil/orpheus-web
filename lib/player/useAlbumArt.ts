"use client";
import * as React from "react";
import { refreshAlbumArtsBatch } from "@/app/home/actions";
import { usePlayerStore } from "./store";

export function useAlbumArt(trackId: string, src: string) {
  const updateSongAlbumArt = usePlayerStore((s) => s.updateSongAlbumArt);
  const [currentSrc, setCurrentSrc] = React.useState(src);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setCurrentSrc(src);
    setFailed(false);
  }, [src]);

  const onError = React.useCallback(async () => {
    const result = await refreshAlbumArtsBatch([trackId]).catch(() => ({}));
    const fresh = result[trackId];
    if (fresh) {
      setCurrentSrc(fresh);
      setFailed(false);
      updateSongAlbumArt(trackId, fresh);
    } else {
      setFailed(true);
    }
  }, [trackId, updateSongAlbumArt]);

  return { src: failed ? "" : currentSrc, onError };
}
