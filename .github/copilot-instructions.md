# Orpheus Web - Copilot Instructions

## Project Overview

Orpheus is a music library management system built with Next.js 15 (App Router), integrating Spotify and YouTube APIs for music discovery and streaming. The app uses Drizzle ORM with PostgreSQL, Better Auth for authentication, and a microservices architecture with RabbitMQ for background processing.

## Architecture & Key Patterns

### Route Groups & Authentication Flow

- Uses Next.js route groups: `(auth)` for login/signup and `(music-explorer)` for authenticated features
- Auth pattern: Server-side session checks in page components with `redirect("/")` for unauthenticated users
- Middleware at `/middleware.ts` provides optimistic redirects but **real auth checks happen in each route**
- Better Auth handles email/password + username authentication with Drizzle adapter

### Database Architecture

- **Primary entities**: `songsTable` (Spotify tracks) and `ytMusicVideoTable` (YouTube videos)
- **Key relationship**: Songs reference YouTube videos via `youtubeVideoId` foreign key
- **Critical pattern**: Use `upsertSongInfo()` transaction for atomic song+video creation
- Drizzle migrations output to `supabase/migrations/` (not standard Drizzle location)

### API Integration Patterns

- **Spotify**: Client credentials flow in server actions (`actions.ts`) with Base64 encoded auth
- **YouTube**: API key-based search for music videos matching Spotify tracks
- **Background processing**: RabbitMQ queues handle async YouTube metadata enrichment
- Server actions in `actions.ts` files handle both API calls and database operations

### Component Organization

- Route-specific components in `_components/` folders (Next.js convention)
- Global components in `/components/` with shadcn/ui in `/components/ui/`
- Client components marked with `"use client"` only when needed (form handling, state)

## Development Workflows

### Environment Setup

```bash
bun dev          # Development server (project uses Bun, not npm)
bun run build    # Production build
```

### Database Operations

```bash
# Generate migrations after schema changes
bunx drizzle-kit generate

# Apply migrations (uses Supabase-style migration folder)
bunx drizzle-kit migrate
```

### Key Environment Variables

Required in `.env.local`: `DATABASE_URL`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `YOUTUBE_API_KEY`, `RABBITMQ_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`

## Code Conventions

### Type Safety

- All environment variables validated through `@t3-oss/env-nextjs` in `/lib/env.ts`
- Database types auto-generated: `InsertSong`, `InsertYtMusicVideo` from Drizzle schema
- API response types defined in `/types/explorer.ts` for external service integration

### Error Handling

- Server actions use try/catch with console.error for debugging
- Client components handle loading states and display user feedback via Sonner toasts
- Database operations wrapped in transactions for consistency

### UI Patterns

- Shadcn/ui components with "new-york" style variant
- Consistent loading states with `isLoading` boolean in client components
- Form submissions prevent default and validate before server action calls

### File Naming

- Server actions: `actions.ts` in route directories
- Route-specific components: `_components/ComponentName.tsx`
- Database queries organized in `/lib/db/queries/` by operation type

## Integration Points

### External Services

- **Spotify Web API**: Track/album/artist search with access token management
- **YouTube Data API**: Video search and metadata retrieval
- **RabbitMQ**: Async job processing for metadata enrichment workflows

### Authentication Flow

1. Login via Better Auth email/password
2. Session stored in HTTP-only cookies
3. Server-side session validation in each protected route
4. Redirects handle both authenticated and unauthenticated states

### Data Flow

1. User searches Spotify tracks via client component
2. Server action fetches Spotify data + YouTube matches
3. `upsertSongInfo()` transaction saves both entities atomically
4. Background jobs (via RabbitMQ) enrich metadata asynchronously
