const DB_NAME = "orpheus-song-cache";
const DB_VERSION = 1;
const SONG_STORE = "songs";
const PAGE_STORE = "pages";
const META_STORE = "meta";
const SONG_CACHE_SCHEMA_VERSION = "v1";

function scopeKey(userId) {
  return `${SONG_CACHE_SCHEMA_VERSION}:${userId}`;
}

function cursorKey(cursor) {
  return cursor ? `${cursor.artistName}::${cursor.trackId}` : "first";
}

function pageKey(scope, cursor) {
  return `${scope}:${cursorKey(cursor)}`;
}

function openDb() {
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

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function readSongsCache(userId) {
  if (!("indexedDB" in window)) return null;
  const db = await openDb();
  const scope = scopeKey(userId);
  const tx = db.transaction([SONG_STORE, PAGE_STORE], "readonly");
  const pages = await req(tx.objectStore(PAGE_STORE).index("byScope").getAll(IDBKeyRange.only(scope)));
  const songs = await req(tx.objectStore(SONG_STORE).index("byScope").getAll(IDBKeyRange.only(scope)));
  await txDone(tx);
  if (!pages.length) return null;
  const songsById = new Map(songs.map(({ scopeKey: _, ...song }) => [song.trackId, song]));
  const pagesByCursor = new Map(pages.map((page) => [page.cursorKey, page]));
  const orderedPages = [];
  const hydratedSongs = [];
  const seen = new Set();
  let current = pagesByCursor.get("first");
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
    current = current.nextCursor ? pagesByCursor.get(cursorKey(current.nextCursor)) : null;
  }
  const last = orderedPages[orderedPages.length - 1];
  return { pages: orderedPages, songs: hydratedSongs, nextCursor: last?.nextCursor || null, hasMore: Boolean(last?.hasMore) };
}

export async function upsertSongsPage(userId, cursorIn, page, options = {}) {
  if (!("indexedDB" in window)) return;
  const db = await openDb();
  const scope = scopeKey(userId);
  const tx = db.transaction([SONG_STORE, PAGE_STORE], "readwrite");
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
