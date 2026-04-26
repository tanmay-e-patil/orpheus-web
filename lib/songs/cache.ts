"use client";

import type { LibrarySong, SongCursor, SongsPageResponse } from "@/lib/songs/types";

const DB_NAME = "orpheus-song-cache";
const DB_VERSION = 1;
const SONG_STORE = "songs";
const PAGE_STORE = "pages";
const META_STORE = "meta";

export const SONG_CACHE_SCHEMA_VERSION = "v1";
export const SONG_LIBRARY_INVALIDATED_EVENT = "song-library-invalidated";

type CachedSongRecord = LibrarySong & {
  scopeKey: string;
};

type CachedPageRecord = {
  key: string;
  scopeKey: string;
  cursorKey: string;
  cursorIn: SongCursor | null;
  nextCursor: SongCursor | null;
  songIds: string[];
  hasMore: boolean;
  pageRevision: string;
  fetchedAt: number;
  stale: boolean;
};

type CacheMetaRecord = {
  key: string;
  scopeKey: string;
  schemaVersion: string;
};

export type HydratedSongsCache = {
  pages: CachedPageRecord[];
  songs: LibrarySong[];
  nextCursor: SongCursor | null;
  hasMore: boolean;
};

function getScopeKey(userId: string): string {
  return `${SONG_CACHE_SCHEMA_VERSION}:${userId}`;
}

function getCursorKey(cursor: SongCursor | null | undefined): string {
  return cursor ? `${cursor.artistName}::${cursor.trackId}` : "first";
}

function getPageKey(scopeKey: string, cursor: SongCursor | null | undefined): string {
  return `${scopeKey}:${getCursorKey(cursor)}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(SONG_STORE)) {
        const songs = db.createObjectStore(SONG_STORE, { keyPath: ["scopeKey", "trackId"] });
        songs.createIndex("byScope", "scopeKey", { unique: false });
      }

      if (!db.objectStoreNames.contains(PAGE_STORE)) {
        const pages = db.createObjectStore(PAGE_STORE, { keyPath: "key" });
        pages.createIndex("byScope", "scopeKey", { unique: false });
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
  });
}

function runTransaction<T>(
  db: IDBDatabase,
  storeNames: string[],
  mode: IDBTransactionMode,
  operation: (tx: IDBTransaction) => Promise<T> | T
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);

    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);

    Promise.resolve(operation(tx))
      .then((result) => {
        tx.oncomplete = () => resolve(result);
      })
      .catch((error) => {
        reject(error);
        tx.abort();
      });
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function ensureScopeVersion(db: IDBDatabase, scopeKey: string): Promise<void> {
  await runTransaction(db, [META_STORE, SONG_STORE, PAGE_STORE], "readwrite", async (tx) => {
    const metaStore = tx.objectStore(META_STORE);
    const metaKey = `meta:${scopeKey}`;
    const existing = await requestToPromise<CacheMetaRecord | undefined>(metaStore.get(metaKey));

    if (existing?.schemaVersion === SONG_CACHE_SCHEMA_VERSION) {
      return;
    }

    const songStore = tx.objectStore(SONG_STORE);
    const pageStore = tx.objectStore(PAGE_STORE);
    const pageIndex = pageStore.index("byScope");
    const songIndex = songStore.index("byScope");

    const [pages, songs] = await Promise.all([
      requestToPromise<CachedPageRecord[]>(pageIndex.getAll(IDBKeyRange.only(scopeKey))),
      requestToPromise<CachedSongRecord[]>(songIndex.getAll(IDBKeyRange.only(scopeKey))),
    ]);

    for (const page of pages) {
      pageStore.delete(page.key);
    }

    for (const song of songs) {
      songStore.delete([song.scopeKey, song.trackId]);
    }

    metaStore.put({
      key: metaKey,
      scopeKey,
      schemaVersion: SONG_CACHE_SCHEMA_VERSION,
    } satisfies CacheMetaRecord);
  });
}

function assemblePages(pages: CachedPageRecord[], songsById: Map<string, LibrarySong>): HydratedSongsCache {
  const pagesByCursor = new Map(pages.map((page) => [page.cursorKey, page]));
  const orderedPages: CachedPageRecord[] = [];
  const hydratedSongs: LibrarySong[] = [];
  const seen = new Set<string>();

  let current = pagesByCursor.get("first");
  while (current) {
    orderedPages.push(current);
    for (const songId of current.songIds) {
      if (seen.has(songId)) {
        continue;
      }
      const song = songsById.get(songId);
      if (song) {
        seen.add(songId);
        hydratedSongs.push(song);
      }
    }

    current = current.nextCursor
      ? pagesByCursor.get(getCursorKey(current.nextCursor))
      : undefined;
  }

  const lastPage = orderedPages[orderedPages.length - 1];
  return {
    pages: orderedPages,
    songs: hydratedSongs,
    nextCursor: lastPage?.nextCursor ?? null,
    hasMore: lastPage?.hasMore ?? false,
  };
}

export async function readSongsCache(userId: string): Promise<HydratedSongsCache | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return null;
  }

  const db = await openDb();
  const scopeKey = getScopeKey(userId);
  await ensureScopeVersion(db, scopeKey);

  return runTransaction(db, [SONG_STORE, PAGE_STORE], "readonly", async (tx) => {
    const pageStore = tx.objectStore(PAGE_STORE);
    const songStore = tx.objectStore(SONG_STORE);
    const [pages, songs] = await Promise.all([
      requestToPromise<CachedPageRecord[]>(pageStore.index("byScope").getAll(IDBKeyRange.only(scopeKey))),
      requestToPromise<CachedSongRecord[]>(songStore.index("byScope").getAll(IDBKeyRange.only(scopeKey))),
    ]);

    if (pages.length === 0) {
      return null;
    }

    const songsById = new Map(songs.map((song) => [song.trackId, stripScope(song)]));
    return assemblePages(pages, songsById);
  });
}

function stripScope(song: CachedSongRecord): LibrarySong {
  const { scopeKey: _scopeKey, ...rest } = song;
  return rest;
}

export async function upsertSongsPage(
  userId: string,
  cursorIn: SongCursor | null,
  page: SongsPageResponse,
  options?: { stale?: boolean }
): Promise<void> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return;
  }

  const db = await openDb();
  const scopeKey = getScopeKey(userId);
  await ensureScopeVersion(db, scopeKey);

  await runTransaction(db, [SONG_STORE, PAGE_STORE], "readwrite", (tx) => {
    const songStore = tx.objectStore(SONG_STORE);
    const pageStore = tx.objectStore(PAGE_STORE);

    for (const song of page.songs) {
      songStore.put({ ...song, scopeKey } satisfies CachedSongRecord);
    }

    pageStore.put({
      key: getPageKey(scopeKey, cursorIn),
      scopeKey,
      cursorKey: getCursorKey(cursorIn),
      cursorIn,
      nextCursor: page.nextCursor,
      songIds: page.songs.map((song) => song.trackId),
      hasMore: page.hasMore,
      pageRevision: page.pageRevision,
      fetchedAt: Date.now(),
      stale: options?.stale ?? false,
    } satisfies CachedPageRecord);
  });
}

export async function getCachedPage(
  userId: string,
  cursorIn: SongCursor | null
): Promise<CachedPageRecord | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return null;
  }

  const db = await openDb();
  const scopeKey = getScopeKey(userId);
  await ensureScopeVersion(db, scopeKey);

  return runTransaction(db, [PAGE_STORE], "readonly", (tx) =>
    requestToPromise<CachedPageRecord | null>(
      tx.objectStore(PAGE_STORE).get(getPageKey(scopeKey, cursorIn))
    )
  );
}

export async function markLaterPagesStale(userId: string): Promise<void> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return;
  }

  const db = await openDb();
  const scopeKey = getScopeKey(userId);
  await ensureScopeVersion(db, scopeKey);

  await runTransaction(db, [PAGE_STORE], "readwrite", async (tx) => {
    const store = tx.objectStore(PAGE_STORE);
    const pages = await requestToPromise<CachedPageRecord[]>(
      store.index("byScope").getAll(IDBKeyRange.only(scopeKey))
    );

    for (const page of pages) {
      if (page.cursorKey === "first") {
        continue;
      }
      store.put({ ...page, stale: true } satisfies CachedPageRecord);
    }
  });
}

export async function markAllPagesStale(userId: string): Promise<void> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return;
  }

  const db = await openDb();
  const scopeKey = getScopeKey(userId);
  await ensureScopeVersion(db, scopeKey);

  await runTransaction(db, [PAGE_STORE], "readwrite", async (tx) => {
    const store = tx.objectStore(PAGE_STORE);
    const pages = await requestToPromise<CachedPageRecord[]>(
      store.index("byScope").getAll(IDBKeyRange.only(scopeKey))
    );

    for (const page of pages) {
      store.put({ ...page, stale: true } satisfies CachedPageRecord);
    }
  });
}

export async function markAllPagesStaleForAllUsers(): Promise<void> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return;
  }

  const db = await openDb();
  await runTransaction(db, [PAGE_STORE], "readwrite", async (tx) => {
    const store = tx.objectStore(PAGE_STORE);
    const pages = await requestToPromise<CachedPageRecord[]>(store.getAll());

    for (const page of pages) {
      store.put({ ...page, stale: true } satisfies CachedPageRecord);
    }
  });
}

export function dispatchSongLibraryInvalidated() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(SONG_LIBRARY_INVALIDATED_EVENT));
}
