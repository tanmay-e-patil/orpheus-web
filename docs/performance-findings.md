# Performance Findings

## Infrastructure Context

- **Next.js**: VPS in Phoenix, AZ (self-hosted, persistent Node process)
- **Database**: us-west-2 (~20-30ms roundtrip from Phoenix)
- **RabbitMQ**: Same VPS as Next.js (<1ms)
- **External APIs**: Deezer, YouTube Data API v3, lrclib.net (~50-200ms each)

No cold starts. No Vercel serverless overhead. Bottlenecks are external API latency and sequential call patterns.

---

## Findings

### 1. Artificial sleeps block response (Critical)

**Files:**
- [`app/home/actions.ts:24`](../app/home/actions.ts#L24) — 120ms sleep per track in `refreshAlbumArtsBatch`
- [`app/(music-explorer)/discover/actions.ts:258`](../app/(music-explorer)/discover/actions.ts#L258) — 120ms sleep per search query in `findTrackMatches`
- [`app/(music-explorer)/discover/actions.ts:274`](../app/(music-explorer)/discover/actions.ts#L274) — 80ms sleep per top-5 match in `findTrackMatches`

These sleeps exist to rate-limit Deezer API calls but run synchronously on the request path. For a single video with 4 search queries + 5 match fetches, minimum sleep overhead = `4 × 120ms + 5 × 80ms = 880ms` before any external network time.

**Fix:** Move `refreshAlbumArtsBatch` and `findTrackMatches` to background jobs (RabbitMQ already in use). Return optimistic response to client immediately.

---

### 2. Sequential external API calls in `fetchLyricsOptions` (High)

**File:** [`app/(music-explorer)/discover/actions.ts:346`](../app/(music-explorer)/discover/actions.ts#L346)

Three lrclib.net searches run sequentially:
```ts
for (const searchParams of searches) {
  const response = await fetch(`https://lrclib.net/api/search?...`)
  ...
}
```

Each lrclib call = ~100-200ms. Sequential = ~300-600ms total.

**Fix:** `Promise.all` the three searches. Results deduplicated after, so order doesn't matter.

---

### 3. `findTrackMatches` fully sequential per video (High)

**File:** [`app/(music-explorer)/discover/actions.ts:197`](../app/(music-explorer)/discover/actions.ts#L197)

Outer loop over videos is sequential. For N videos, cost = N × (4 Deezer searches + sleeps + 5 date fetches). No parallelism at any level.

**Fix:** `Promise.all` outer video loop. Each video's Deezer searches can also be parallelized (drop sleeps, handle 429s with retry instead).

---

### 4. `refreshAlbumArtsBatch` sequential with per-track DB writes (High)

**File:** [`app/home/actions.ts:23`](../app/home/actions.ts#L23)

For each track: sleep 120ms → fetch Deezer → update DB row. All sequential. For 10 tracks = 10 × (120ms + ~150ms Deezer + ~25ms DB) ≈ **2950ms minimum**.

**Fix:** Parallelize fetches (respect rate limit with concurrency limit, e.g. `p-limit(3)`). Batch DB updates into single query after all fetches complete.

---

### 5. RabbitMQ new connection per request (Medium)

**Files:**
- [`app/(music-explorer)/discover/actions.ts:458`](../app/(music-explorer)/discover/actions.ts#L458)
- [`app/(music-explorer)/search/actions.ts:145`](../app/(music-explorer)/search/actions.ts#L145)

New TCP connection + channel created and closed on every `saveSongAndVideo` call:
```ts
const connection = await amqp.connect(env.RABBITMQ_URL)
const channel = await connection.createChannel()
// ... send ...
await channel.close()
await connection.close()
```

Even on localhost, connection setup takes a few ms. More importantly, this pattern will fail under concurrency (connection churn).

**Fix:** Module-level singleton connection with reconnect logic.

---

### 6. `lrclib` API route disables caching (Medium)

**File:** [`app/api/lyrics/lrclib/route.ts:44`](../app/api/lyrics/lrclib/route.ts#L44)

```ts
cache: "no-store"
```

Lyrics for a given track are stable. Every request re-fetches from lrclib.net (~100-200ms).

**Fix:** Replace `cache: "no-store"` with `next: { revalidate: 86400 }` to cache for 24h. Add `Cache-Control` header on the route response for CDN/browser caching.

---

### 7. `getMoreSongs` fetches all columns (Low)

**File:** [`app/home/actions.ts:71`](../app/home/actions.ts#L71)

```ts
const baseQuery = db.select().from(songsTable)
```

Pulls `lyrics` and `syncedLyrics` columns (potentially large text) when rendering song list. These fields are not needed at list view.

**Fix:** `db.select({ trackId: ..., name: ..., artistName: ..., albumArt: ... })` — select only display fields.

---

### 8. No DB connection pool config (Low)

**File:** [`lib/db/index.ts:4`](../lib/db/index.ts#L4)

```ts
const client = postgres(process.env.DATABASE_URL!)
```

No `max` connections configured. Default postgres.js pool may open more connections than needed. DB is remote (us-west-2), so each connection has ~25ms establishment cost.

**Fix:** Add explicit pool config:
```ts
const client = postgres(process.env.DATABASE_URL!, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
})
```

---

## Priority Order

| Priority | Issue | Est. Gain |
|----------|-------|-----------|
| 1 | Remove sleeps, move batch work to background | 880ms–3000ms |
| 2 | Parallelize `fetchLyricsOptions` | 200–400ms |
| 3 | Parallelize `findTrackMatches` outer loop | scales with N videos |
| 4 | Cache lrclib responses | 100–200ms per repeat request |
| 5 | RabbitMQ singleton connection | ~5ms + stability |
| 6 | Select only needed columns in `getMoreSongs` | ~10–50ms |
| 7 | DB pool config | ~5ms cold connection |

---

## p99 200ms Feasibility

| Route | Achievable? | Limiting Factor |
|-------|-------------|-----------------|
| `POST /api/lyrics/save` | Yes | Single DB update, ~30ms |
| `POST /api/lyrics/lrclib` | With caching: yes. Cold: no | lrclib.net latency ~150ms |
| `getMoreSongs` | Yes after column select fix | DB roundtrip ~30ms |
| `findTrackMatches` | No — by design | Multiple external APIs |
| `refreshAlbumArtsBatch` | No — move to background | Deezer rate limiting |
