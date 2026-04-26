"use client";

import * as React from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePlayerStore } from "@/lib/player/store";
import type { Song } from "@/lib/player/types";
import { toastError } from "@/lib/toast";
import { refreshAlbumArtsBatch } from "../actions";
import {
  dispatchSongLibraryInvalidated,
  markAllPagesStale,
  markLaterPagesStale,
  readSongsCache,
  SONG_LIBRARY_INVALIDATED_EVENT,
  upsertSongsPage,
} from "@/lib/songs/cache";
import { getSongPageRevision } from "@/lib/songs/revision";
import {
  SONGS_PAGE_SIZE,
  type LibrarySong,
  type SongCursor,
  type SongsPageResponse,
} from "@/lib/songs/types";

type LoadedPage = SongsPageResponse & {
  cursorIn: SongCursor | null;
  stale: boolean;
};

function AlbumArt({
  src,
  trackId,
  size,
  onError,
}: {
  src: string;
  trackId: string;
  size: number;
  onError: (id: string) => void;
}) {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded bg-muted flex-shrink-0"
      />
    );
  }
  return (
    <Image
      src={src}
      width={size}
      height={size}
      alt=""
      className="rounded object-cover flex-shrink-0"
      onError={() => {
        setFailed(true);
        onError(trackId);
      }}
    />
  );
}

export function formatIsoDuration(isoDuration: string | null): string | null {
  if (!isoDuration) return null;
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const hours = match[1] ? Number.parseInt(match[1]) : 0;
  const minutes = match[2] ? Number.parseInt(match[2]) : 0;
  const seconds = match[3] ? Number.parseInt(match[3]) : 0;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function createPageFromSongs(
  songs: LibrarySong[],
  cursorIn: SongCursor | null,
  hasMore: boolean
): LoadedPage {
  const lastSong = songs[songs.length - 1];
  return {
    cursorIn,
    songs,
    hasMore,
    nextCursor:
      hasMore && lastSong
        ? { artistName: lastSong.artistName, trackId: lastSong.trackId }
        : null,
    pageRevision: getSongPageRevision(songs),
    stale: false,
  };
}

function mergePagesToSongs(pages: LoadedPage[]): LibrarySong[] {
  const merged: LibrarySong[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    for (const song of page.songs) {
      if (seen.has(song.trackId)) {
        continue;
      }
      seen.add(song.trackId);
      merged.push(song);
    }
  }

  return merged;
}

function replacePage(pages: LoadedPage[], page: LoadedPage): LoadedPage[] {
  const nextPages = [...pages];
  const targetKey = getCursorKey(page.cursorIn);
  const existingIndex = nextPages.findIndex(
    (candidate) => getCursorKey(candidate.cursorIn) === targetKey
  );

  if (existingIndex >= 0) {
    nextPages[existingIndex] = page;
    return nextPages;
  }

  nextPages.push(page);
  return nextPages;
}

function getCursorKey(cursor: SongCursor | null): string {
  return cursor ? `${cursor.artistName}::${cursor.trackId}` : "first";
}

function pagesFromCache(cache: Awaited<ReturnType<typeof readSongsCache>>): LoadedPage[] {
  if (!cache) {
    return [];
  }

  const songMap = new Map(cache.songs.map((song) => [song.trackId, song]));
  return cache.pages.map((page) => ({
    cursorIn: page.cursorIn,
    songs: page.songIds.map((songId) => songMap.get(songId)).filter(Boolean) as LibrarySong[],
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    pageRevision: page.pageRevision,
    stale: page.stale,
  }));
}

async function fetchSongsPage(cursor?: SongCursor | null): Promise<SongsPageResponse> {
  const params = new URLSearchParams();
  if (cursor) {
    params.set("artistName", cursor.artistName);
    params.set("trackId", cursor.trackId);
  }

  const url = params.size > 0 ? `/api/songs?${params.toString()}` : "/api/songs";
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Songs request failed: ${response.status}`);
  }

  return response.json();
}

function logSongsMetric(event: string, payload: Record<string, unknown>) {
  console.debug("[songs-cache]", event, payload);
}

export default function SongTable({
  initialSongs,
  userId,
}: {
  initialSongs: LibrarySong[];
  userId: string;
}) {
  const setQueue = usePlayerStore((s) => s.setQueue);
  const activeId = usePlayerStore((s) => s.queue[s.currentIndex]?.trackId);
  const initialPage = React.useMemo(
    () => createPageFromSongs(initialSongs, null, initialSongs.length === SONGS_PAGE_SIZE),
    [initialSongs]
  );

  const [pages, setPages] = React.useState<LoadedPage[]>([initialPage]);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [refreshedArt, setRefreshedArt] = React.useState<Record<string, string>>({});
  const songs = React.useMemo(() => mergePagesToSongs(pages), [pages]);
  const hasMore = pages[pages.length - 1]?.hasMore ?? false;

  const pagesRef = React.useRef(pages);
  React.useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  const pendingRefresh = React.useRef<Set<string>>(new Set());
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = React.useRef<IntersectionObserver | null>(null);
  const bottomBoundaryRef = React.useRef<HTMLDivElement | null>(null);

  const persistPage = React.useCallback(
    async (cursorIn: SongCursor | null, page: SongsPageResponse, stale = false) => {
      try {
        await upsertSongsPage(userId, cursorIn, page, { stale });
      } catch (error) {
        logSongsMetric("cache_write_failed", {
          userId,
          cursor: getCursorKey(cursorIn),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [userId]
  );

  const revalidateFirstPage = React.useCallback(async () => {
    const startedAt = performance.now();
    setIsRefreshing(true);
    try {
      const freshPage = await fetchSongsPage(null);
      const currentFirstPage = pagesRef.current[0];
      const changed = currentFirstPage?.pageRevision !== freshPage.pageRevision;

      logSongsMetric("page1_refresh", {
        changed,
        durationMs: Math.round(performance.now() - startedAt),
      });

      const hydratedPage: LoadedPage = {
        cursorIn: null,
        stale: false,
        ...freshPage,
      };

      setPages((prevPages) => {
        let nextPages = replacePage(prevPages, hydratedPage);
        if (changed) {
          nextPages = nextPages.map((page, index) =>
            index === 0 ? page : { ...page, stale: true }
          );
        }
        return nextPages;
      });

      await persistPage(null, freshPage);
      if (changed) {
        await markLaterPagesStale(userId);
      }
    } catch {
      toastError("Failed to refresh library");
    } finally {
      setIsRefreshing(false);
    }
  }, [persistPage, userId]);

  React.useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const startedAt = performance.now();
      try {
        const cache = await readSongsCache(userId);
        if (cancelled) {
          return;
        }

        if (cache) {
          logSongsMetric("cache_hit", {
            durationMs: Math.round(performance.now() - startedAt),
            pageCount: cache.pages.length,
            songCount: cache.songs.length,
          });
          setPages(pagesFromCache(cache));
        } else {
          logSongsMetric("cache_miss", {
            durationMs: Math.round(performance.now() - startedAt),
          });
          await persistPage(null, initialPage);
        }
      } catch (error) {
        logSongsMetric("cache_read_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        await persistPage(null, initialPage);
      } finally {
        if (!cancelled) {
          void revalidateFirstPage();
        }
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [initialPage, persistPage, revalidateFirstPage, userId]);

  React.useEffect(() => {
    const handleLibraryInvalidated = () => {
      setPages((prevPages) => prevPages.map((page) => ({ ...page, stale: true })));
      void revalidateFirstPage();
    };

    window.addEventListener(SONG_LIBRARY_INVALIDATED_EVENT, handleLibraryInvalidated);
    return () => {
      window.removeEventListener(SONG_LIBRARY_INVALIDATED_EVENT, handleLibraryInvalidated);
    };
  }, [revalidateFirstPage]);

  const handleArtError = React.useCallback(
    (trackId: string) => {
      pendingRefresh.current.add(trackId);
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
      }

      refreshTimer.current = setTimeout(async () => {
        const ids = [...pendingRefresh.current];
        pendingRefresh.current.clear();
        const result = await refreshAlbumArtsBatch(ids).catch(() => ({}));

        setRefreshedArt((prev) => ({ ...prev, ...result }));

        if (Object.keys(result).length > 0) {
          await markAllPagesStale(userId).catch(() => undefined);
          dispatchSongLibraryInvalidated();
        }
      }, 500);
    },
    [userId]
  );

  const loadMore = React.useCallback(async () => {
    if (loadingMore || !hasMore) {
      return;
    }

    const currentPages = pagesRef.current;
    const lastPage = currentPages[currentPages.length - 1];
    if (!lastPage) {
      return;
    }

    const cursorToFetch = lastPage.stale ? lastPage.cursorIn : lastPage.nextCursor;
    if (!cursorToFetch) {
      return;
    }

    setLoadingMore(true);
    const startedAt = performance.now();
    try {
      const freshPage = await fetchSongsPage(cursorToFetch);
      logSongsMetric("page_fetch", {
        cursor: getCursorKey(cursorToFetch),
        durationMs: Math.round(performance.now() - startedAt),
        replacedStalePage: lastPage.stale,
      });

      const hydratedPage: LoadedPage = {
        cursorIn: cursorToFetch,
        stale: false,
        ...freshPage,
      };

      setPages((prevPages) => replacePage(prevPages, hydratedPage));
      await persistPage(cursorToFetch, freshPage);
    } catch {
      toastError("Failed to load more songs");
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, persistPage]);

  React.useEffect(() => {
    if (!bottomBoundaryRef.current) return;

    observerRef.current = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry.isIntersecting) {
        void loadMore();
      }
    });

    observerRef.current.observe(bottomBoundaryRef.current);

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [loadMore]);

  const onRowClick = (idx: number) => {
    const sel = songs[idx] as Song | undefined;
    if (!sel?.youtubeVideoId) {
      toastError("No playable source.");
      return;
    }
    setQueue(songs as Song[], idx);
  };

  return (
    <div className="bg-background pb-20">
      <div className="mb-3 flex items-center justify-end text-xs text-muted-foreground min-h-5">
        {isRefreshing ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-3 animate-spin" />
            Refreshing library...
          </span>
        ) : null}
      </div>

      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Artist</TableHead>
            <TableHead>Album</TableHead>
            <TableHead>Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {songs.map((song, idx) => {
            const isActive = song.trackId === activeId;
            return (
              <TableRow
                key={song.trackId}
                className={`cursor-pointer ${isActive ? "bg-primary/10" : ""}`}
                onClick={() => onRowClick(idx)}
              >
                <TableCell className="font-medium">{idx + 1}</TableCell>
                <TableCell className="truncate max-w-48 flex gap-2 items-center">
                  <AlbumArt
                    src={refreshedArt[song.trackId] ?? song.albumArt}
                    trackId={song.trackId}
                    size={24}
                    onError={handleArtError}
                  />
                  <span className="truncate">{song.name}</span>
                </TableCell>
                <TableCell className="truncate max-w-32">{song.artistName}</TableCell>
                <TableCell className="truncate max-w-32">{song.albumName}</TableCell>
                <TableCell>{formatIsoDuration(song.duration)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <ul className="md:hidden divide-y">
        {songs.map((song, idx) => {
          const isActive = song.trackId === activeId;
          return (
            <li
              key={song.trackId}
              className={`flex items-center gap-3 py-3 cursor-pointer ${
                isActive ? "bg-primary/10" : ""
              }`}
              onClick={() => onRowClick(idx)}
            >
              <AlbumArt
                src={refreshedArt[song.trackId] ?? song.albumArt}
                trackId={song.trackId}
                size={48}
                onError={handleArtError}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-sm">{song.name}</div>
                <div className="truncate text-xs text-muted-foreground">{song.artistName}</div>
              </div>
              <div className="text-xs text-muted-foreground">{formatIsoDuration(song.duration)}</div>
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <div ref={bottomBoundaryRef} className="py-4 text-center text-sm text-muted-foreground">
          {loadingMore ? "Loading more..." : "Scroll for more"}
        </div>
      )}
    </div>
  );
}
