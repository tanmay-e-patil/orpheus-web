# Architecture Findings

## Context

Self-hosted VPS (Phoenix, AZ). Persistent Node process. No cold starts, no serverless constraints. Current structure inherits Vercel/serverless patterns that actively hurt maintainability on this infra.

---

## Findings

### 1. Business Logic Trapped in Next.js Server Actions (Critical)

**File:** [`app/(music-explorer)/discover/actions.ts`](../app/(music-explorer)/discover/actions.ts) — 19KB

Single file does everything: YouTube search, Deezer track matching, string similarity scoring, LrcLib fetching, DB writes, RabbitMQ publishing. Tightly coupled to Next.js Server Action primitives — can only be invoked from React Server Components.

**Consequences:**
- Adding a mobile client or CLI requires copy-pasting the same external API logic
- Matching/scoring algorithms can't be unit tested without the Next.js runtime
- Swapping LrcLib for another provider means surgery inside an action file
- No reuse between the `discover/` and `search/` workflows despite overlapping Deezer logic

**Fix:** Extract a `services/` layer. Actions become thin dispatch — call service, return result. All business logic lives in plain TypeScript modules with no framework dependency.

---

### 2. RabbitMQ Worker Not in Repo (Critical)

**File:** [`app/(music-explorer)/discover/actions.ts:458`](../app/(music-explorer)/discover/actions.ts#L458)

Producer publishes `{ jobId, action: "process-song-data", timestamp }` to `job_queue`. Consumer runs on the VPS but doesn't exist in this repository.

**Consequences:**
- Job payload schema is an invisible contract — producer and consumer can drift silently
- Worker can't be run locally, can't be tested, can't be reviewed in PRs
- Onboarding requires out-of-band knowledge of what the worker actually does
- No shared types between producer and consumer

**Fix:** Add `workers/` directory to repo. Extract shared job payload types to `services/queue/types.ts`. Worker imports from `services/` directly — same business logic, no duplication.

```ts
// services/queue/types.ts
export type JobPayload =
  | { action: "process-song"; trackId: string }
  | { action: "refresh-album-art"; trackIds: string[] }
```

---

### 3. Multi-Step Workflow State in localStorage (High)

**File:** [`lib/workflow-state.ts`](../lib/workflow-state.ts)

Six-stage discovery workflow (YouTube → Deezer → Lyrics → Review → Commit) stores its draft state in localStorage via `workflow-state.ts`.

**Consequences:**
- Workflow lost on browser clear or private window
- Can't resume on a different device
- No server authority — user can reach `/discover/review` with corrupted/missing state
- Adding workflow history, undo, or collaborative review is impossible without a rewrite

**Fix:** Persist draft to a `workflow_drafts` table (userId, stage, payload jsonb, updatedAt). Server actions read/write draft. localStorage can mirror for optimistic UX but server is source of truth.

---

### 4. No API Client Abstraction (High)

**Files:** inline in [`discover/actions.ts`](../app/(music-explorer)/discover/actions.ts), [`search/actions.ts`](../app/(music-explorer)/search/actions.ts)

Deezer, YouTube, LrcLib called with raw `fetch()` inline. Rate limiting is `sleep()`. No retry, no timeout config, no error normalization across callers.

**Consequences:**
- Adding a second track metadata source (MusicBrainz, Spotify) means duplicating the entire fetch pattern
- Rotating API keys requires hunting across multiple files
- Error handling inconsistent — one caller might swallow a 429, another throws
- Sleep-based rate limiting is the only option because there's nowhere else to put it

**Fix:** `lib/clients/` wrappers per external service. Each client owns: base URL, auth headers, timeout, retry with exponential backoff, 429 handling. Rate limiting moves into the client or the background worker — off the request path entirely.

---

### 5. DB Access Scattered (High)

**Files:** [`lib/db/queries/insert.ts`](../lib/db/queries/insert.ts) + inline calls in actions files

`insert.ts` exists but actions files bypass it and call Drizzle directly. No consistent query layer.

**Consequences:**
- Adding soft deletes, audit logging, or row-level security requires finding every callsite
- Multi-tenancy (per-user libraries) would require touching every query
- No single place to add query logging or slow-query detection

**Fix:** All DB access through `lib/db/queries/`. Split by domain: `songs.ts`, `videos.ts`, `workflows.ts`. No Drizzle calls outside this directory.

---

### 6. Dead Vercel Config in Repo (Low)

**Path:** `.vercel/`

Project is self-hosted on a VPS. `.vercel/` directory committed to repo. Misleads contributors, may interfere with accidental `vercel deploy` runs.

**Fix:** Delete `.vercel/`, add to `.gitignore`.

---

## Target Architecture

```
orpheus-web/
├── app/                          # Next.js: routing + thin actions only
│   ├── (music-explorer)/
│   │   ├── discover/
│   │   │   └── actions.ts        # calls services/, no logic
│   │   └── search/
│   │       └── actions.ts
│   ├── home/
│   │   └── actions.ts
│   └── api/
│
├── services/                     # All business logic (no framework deps)
│   ├── discovery/
│   │   ├── youtube.ts            # search, filter, score
│   │   ├── deezer.ts             # match, rank, album art
│   │   └── lyrics.ts             # fetch, dedup, rank
│   ├── library/
│   │   └── songs.ts              # getMoreSongs, refreshAlbumArt
│   └── queue/
│       ├── producer.ts           # singleton connection, typed publish()
│       └── types.ts              # shared JobPayload union type
│
├── workers/                      # Separate process, same repo
│   ├── index.ts                  # RabbitMQ consumer entry point
│   └── handlers/
│       ├── process-song.ts       # imports from services/
│       └── refresh-album-art.ts
│
└── lib/
    ├── db/
    │   ├── index.ts
    │   ├── schema.ts
    │   └── queries/              # ALL DB access centralized
    │       ├── songs.ts
    │       ├── videos.ts
    │       └── workflows.ts
    └── clients/                  # External API wrappers
        ├── deezer.ts             # retry, rate limit, error normalization
        ├── youtube.ts
        └── lrclib.ts
```

**Actions become thin dispatchers:**
```ts
// app/(music-explorer)/discover/actions.ts — after refactor
export async function findTrackMatches(videos: YouTubeVideo[]) {
  "use server"
  return discoveryService.matchTracks(videos)
}
```

---

## Priority Order

| Priority | Issue | Impact |
|----------|-------|--------|
| 1 | Extract `services/` from `discover/actions.ts` | Everything else depends on this |
| 2 | Add `workers/` to repo + shared `queue/types.ts` | Eliminates invisible producer/consumer contract |
| 3 | `lib/clients/` wrappers with retry/rate limit | Prerequisite for removing sleep-based rate limiting |
| 4 | Centralize all DB calls in `lib/db/queries/` | Prerequisite for audit logs, soft delete, multi-tenancy |
| 5 | Move workflow draft state to `workflow_drafts` DB table | Enables resume, mobile, history |
| 6 | Delete `.vercel/` | Hygiene |
