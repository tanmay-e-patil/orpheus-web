import type { SongsCursor } from '../api';
import type { Song } from '../types';

type CachedSong = Song & { scopeKey: string };
type CachedPage = {
  key: string;
  scopeKey: string;
  cursorKey: string;
  cursorIn: SongsCursor | null;
  nextCursor: SongsCursor | null;
  songIds: string[];
  hasMore: boolean;
  pageRevision?: unknown;
  fetchedAt: number;
  stale: boolean;
};
type SongsPage = {
  songs: Song[];
  nextCursor: SongsCursor | null;
  hasMore: boolean;
  pageRevision?: unknown;
};
type WriteOptions = { signal?: AbortSignal; stale?: boolean };

const DB_NAME = 'orpheus-song-cache';
const DB_VERSION = 1;
const SONG_STORE = 'songs';
const PAGE_STORE = 'pages';
const META_STORE = 'meta';
const SONG_CACHE_SCHEMA_VERSION = 'v1';

function scopeKey(userId: string) {
  return `${SONG_CACHE_SCHEMA_VERSION}:${userId}`;
}

function cursorKey(cursor: SongsCursor | null | undefined) {
  return cursor ? `${cursor.artistName}::${cursor.trackId}` : 'first';
}

function pageKey(scope: string, cursor: SongsCursor | null) {
  return `${scope}:${cursorKey(cursor)}`;
}

function metaKey(scope: string) {
  return `${scope}:meta`;
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SONG_STORE)) {
        const songs = db.createObjectStore(SONG_STORE, {
          keyPath: ['scopeKey', 'trackId'],
        });
        songs.createIndex('byScope', 'scopeKey', { unique: false });
      }
      if (!db.objectStoreNames.contains(PAGE_STORE)) {
        const pages = db.createObjectStore(PAGE_STORE, { keyPath: 'key' });
        pages.createIndex('byScope', 'scopeKey', { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
  });
}

function req<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function readSongsCache(userId: string) {
  if (!('indexedDB' in window)) return null;
  const db = await openDb();
  const scope = scopeKey(userId);
  const tx = db.transaction([SONG_STORE, PAGE_STORE], 'readonly');
  const pages = await req(
    tx
      .objectStore(PAGE_STORE)
      .index('byScope')
      .getAll(IDBKeyRange.only(scope)) as IDBRequest<CachedPage[]>,
  );
  const songs = await req(
    tx
      .objectStore(SONG_STORE)
      .index('byScope')
      .getAll(IDBKeyRange.only(scope)) as IDBRequest<CachedSong[]>,
  );
  await txDone(tx);
  if (!pages.length) return null;
  const songsById = new Map(
    songs.map(({ scopeKey: _, ...song }): [string, Song] => [
      song.trackId,
      song,
    ]),
  );
  const pagesByCursor = new Map(pages.map((page) => [page.cursorKey, page]));
  const orderedPages: CachedPage[] = [];
  const hydratedSongs: Song[] = [];
  const seen = new Set<string>();
  let current: CachedPage | undefined = pagesByCursor.get('first');
  while (current) {
    orderedPages.push(current);
    for (const songId of current.songIds) {
      if (seen.has(songId)) continue;
      const song = songsById.get(songId);
      if (song) {
        seen.add(songId);
        hydratedSongs.push(song);
      }
    }
    current = current.nextCursor
      ? pagesByCursor.get(cursorKey(current.nextCursor))
      : undefined;
  }
  const last = orderedPages[orderedPages.length - 1];
  return {
    pages: orderedPages,
    songs: hydratedSongs,
    nextCursor: last?.nextCursor || null,
    hasMore: Boolean(last?.hasMore),
  };
}

export async function readAllCachedSongs(userId: string): Promise<Song[]> {
  if (!('indexedDB' in window)) return [];
  const db = await openDb();
  const scope = scopeKey(userId);
  const tx = db.transaction([SONG_STORE, PAGE_STORE], 'readonly');
  const pages = await req(
    tx
      .objectStore(PAGE_STORE)
      .index('byScope')
      .getAll(IDBKeyRange.only(scope)) as IDBRequest<CachedPage[]>,
  );
  const songs = await req(
    tx
      .objectStore(SONG_STORE)
      .index('byScope')
      .getAll(IDBKeyRange.only(scope)) as IDBRequest<CachedSong[]>,
  );
  await txDone(tx);

  const songsById = new Map(
    songs.map(({ scopeKey: _, ...song }): [string, Song] => [
      song.trackId,
      song,
    ]),
  );
  const pagesByCursor = new Map(pages.map((page) => [page.cursorKey, page]));
  const ordered: Song[] = [];
  const seen = new Set<string>();
  let current: CachedPage | undefined = pagesByCursor.get('first');
  while (current) {
    for (const songId of current.songIds || []) {
      if (seen.has(songId)) continue;
      const song = songsById.get(songId);
      if (!song) continue;
      seen.add(songId);
      ordered.push(song);
    }
    current = current.nextCursor
      ? pagesByCursor.get(cursorKey(current.nextCursor))
      : undefined;
  }
  for (const [trackId, song] of songsById) {
    if (!seen.has(trackId)) ordered.push(song);
  }
  if (ordered.length || pages.length) return ordered;
  return [...songsById.values()].sort(compareSongs);
}

export async function readSongsCacheMeta(userId: string) {
  if (!('indexedDB' in window)) return null;
  const db = await openDb();
  const scope = scopeKey(userId);
  const tx = db.transaction([META_STORE], 'readonly');
  const meta = await req(tx.objectStore(META_STORE).get(metaKey(scope)));
  await txDone(tx);
  return meta || null;
}

export async function writeSongsCacheMeta(
  userId: string,
  meta: Record<string, unknown>,
  options: WriteOptions = {},
) {
  if (!('indexedDB' in window)) return;
  const db = await openDb();
  const scope = scopeKey(userId);
  if (options.signal?.aborted) return;
  const tx = db.transaction([META_STORE], 'readwrite');
  tx.objectStore(META_STORE).put({
    ...meta,
    key: metaKey(scope),
    scopeKey: scope,
    updatedAt: Date.now(),
  });
  await txDone(tx);
}

export async function clearSongsCache(userId: string) {
  if (!('indexedDB' in window)) return;
  const db = await openDb();
  const scope = scopeKey(userId);
  const tx = db.transaction([SONG_STORE, PAGE_STORE, META_STORE], 'readwrite');
  const songs = await req(
    tx
      .objectStore(SONG_STORE)
      .index('byScope')
      .getAllKeys(IDBKeyRange.only(scope)),
  );
  const pages = await req(
    tx
      .objectStore(PAGE_STORE)
      .index('byScope')
      .getAllKeys(IDBKeyRange.only(scope)),
  );
  songs.forEach((key) => tx.objectStore(SONG_STORE).delete(key));
  pages.forEach((key) => tx.objectStore(PAGE_STORE).delete(key));
  tx.objectStore(META_STORE).delete(metaKey(scope));
  await txDone(tx);
}

export async function upsertSongsPage(
  userId: string,
  cursorIn: SongsCursor | null,
  page: SongsPage,
  options: WriteOptions = {},
) {
  if (!('indexedDB' in window)) return;
  const db = await openDb();
  const scope = scopeKey(userId);
  if (options.signal?.aborted) return;
  const tx = db.transaction([SONG_STORE, PAGE_STORE], 'readwrite');
  const songStore = tx.objectStore(SONG_STORE);
  const pageStore = tx.objectStore(PAGE_STORE);
  for (const song of page.songs) {
    songStore.put({ ...song, scopeKey: scope });
  }
  pageStore.put({
    key: pageKey(scope, cursorIn),
    scopeKey: scope,
    cursorKey: cursorKey(cursorIn),
    cursorIn,
    nextCursor: page.nextCursor,
    songIds: page.songs.map((song) => song.trackId),
    hasMore: page.hasMore,
    pageRevision: page.pageRevision,
    fetchedAt: Date.now(),
    stale: options.stale || false,
  });
  await txDone(tx);
}

function compareSongs(a: Song, b: Song) {
  return (
    String(a.artistName || '').localeCompare(String(b.artistName || '')) ||
    String(a.name || '').localeCompare(String(b.name || '')) ||
    String(a.trackId || '').localeCompare(String(b.trackId || ''))
  );
}
