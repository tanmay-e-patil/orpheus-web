import type {
  Song,
  Video,
  Track,
  Match,
  LyricsResult,
  Session,
  SongDetail,
  SaveResult,
} from './types';
import type { CommitItem } from './core/workflow-save';
import type {
  PasskeyCreationResponse,
  PasskeyRequestResponse,
  PasskeyServerOptions,
} from './core/passkey';
import type { PlaybackStartReport } from './core/playback-start-timer';

export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export type SongsCursor = {
  artistName: string;
  trackId: string;
  playCount?: number | null;
  createdAt?: string;
};

// 401s from these endpoints are expected and mean "not signed in yet".
const anonymousPaths = [
  '/api/auth/session',
  '/api/auth/login',
  '/api/auth/passkey/login-finish',
];
const unauthorizedListeners = new Set<() => void>();

/** Called when an authenticated request is rejected because the session ended. */
export function onUnauthorized(listener: () => void) {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

async function request<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers,
  });
  let payload = null;
  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    payload = await response.json();
  }
  if (!response.ok) {
    const error = payload?.error || {};
    if (response.status === 401 && !anonymousPaths.includes(path)) {
      unauthorizedListeners.forEach((listener) => listener());
    }
    throw new APIError(
      error.message || response.statusText,
      response.status,
      error.code,
    );
  }
  return payload as T;
}

const post = <T>(path: string, body?: unknown, signal?: AbortSignal) =>
  request<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

const songPath = (trackId: string, suffix = '') =>
  `/api/songs/${encodeURIComponent(trackId)}${suffix}`;

function toYouTubeVideoPayload(video: Video) {
  return {
    id: video.id,
    title: video.title,
    thumbnail: video.thumbnail,
    channelTitle: video.channelTitle,
    publishedAt: video.publishedAt,
    duration: video.duration,
    viewCount: video.viewCount,
  };
}

export const api = {
  login: (email: string, password: string) =>
    post<unknown>('/api/auth/login', { email, password }),
  register: (username: string, email: string, password: string) =>
    post<unknown>('/api/auth/register', { username, email, password }),
  logout: () => post<unknown>('/api/auth/logout'),
  session: () => request<Session>('/api/auth/session'),
  nativeAuthDetails: (requestID: string) =>
    request<{ action: string; userId?: string; name?: string }>(
      `/api/auth/native/details?request=${encodeURIComponent(requestID)}`,
    ),
  nativeAuthAuthorize: (requestID: string) =>
    post<{ callbackURL: string }>('/api/auth/native/authorize', {
      request: requestID,
    }),
  passkeyStatus: () =>
    request<{ hasPasskey: boolean }>('/api/auth/passkey/status'),
  passkeyRegisterBegin: () =>
    post<PasskeyServerOptions>('/api/auth/passkey/register-begin'),
  passkeyRegisterFinish: (credential: PasskeyCreationResponse, name = '') =>
    post<unknown>(
      `/api/auth/passkey/register-finish?name=${encodeURIComponent(name)}`,
      credential,
    ),
  passkeyLoginBegin: () =>
    post<PasskeyServerOptions>('/api/auth/passkey/login-begin'),
  passkeyLoginFinish: (credential: PasskeyRequestResponse) =>
    post<unknown>('/api/auth/passkey/login-finish', credential),
  passkeyList: () =>
    request<{ passkeys: { id: string; name: string; createdAt: string }[] }>(
      '/api/auth/passkeys',
    ),
  passkeyDelete: (id: string) =>
    request<unknown>(`/api/auth/passkeys/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  songs: (
    cursor: SongsCursor | null,
    limit = 50,
    signal?: AbortSignal,
    sort = 'artist',
  ) => {
    const params = new URLSearchParams();
    if (cursor) {
      params.set('artistName', cursor.artistName);
      params.set('trackId', cursor.trackId);
      if (cursor.playCount != null)
        params.set('playCount', String(cursor.playCount));
      if (cursor.createdAt) params.set('createdAt', cursor.createdAt);
    }
    if (sort !== 'artist') params.set('sort', sort);
    if (limit) params.set('limit', String(limit));
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return request<{
      songs: Song[];
      nextCursor: SongsCursor | null;
      hasMore: boolean;
    }>(`/api/songs${suffix}`, { signal });
  },
  song: (trackId: string, signal?: AbortSignal) =>
    request<SongDetail>(songPath(trackId), { signal }),
  deleteSong: (trackId: string) =>
    request<{ trackId: string; deletionQueued: boolean } | null>(
      songPath(trackId),
      { method: 'DELETE' },
    ),
  reportPlaybackStart: (report: PlaybackStartReport) =>
    post<null>('/api/metrics/playback-start', report),
  recordSongPlay: (trackId: string) =>
    post<{ trackId: string; playCount: number }>(songPath(trackId, '/plays')),
  updateSongMetadata: (trackId: string, metadata: Record<string, string>) =>
    request<SongDetail>(songPath(trackId, '/metadata'), {
      method: 'PATCH',
      body: JSON.stringify(metadata),
    }),
  replaceAudioSource: (trackId: string, video: Video) =>
    post<SongDetail>(
      songPath(trackId, '/audio-source'),
      toYouTubeVideoPayload(video),
    ),
  regenerateSong: (trackId: string) =>
    post<SongDetail>(songPath(trackId, '/regenerate')),
  refreshAlbumArt: (trackIds: string[]) =>
    post<{ updated: Record<string, string> }>('/api/songs/album-art/refresh', {
      trackIds,
    }),
  saveLyrics: (trackId: string, plainLyrics: string, syncedLyrics: string) =>
    post<unknown>('/api/lyrics/save', { trackId, plainLyrics, syncedLyrics }),
  lrclibExact: (body: Record<string, string>, signal?: AbortSignal) =>
    post<{ plainLyrics?: string; syncedLyrics?: string }>(
      '/api/lyrics/lrclib',
      body,
      signal,
    ),
  discoverYouTube: (query: string, signal?: AbortSignal) =>
    post<Video[]>('/api/discover/youtube', { query }, signal),
  matchDeezerTracks: (
    videos: Video[],
    searchQuery: string,
    signal?: AbortSignal,
  ) =>
    post<Match[]>(
      '/api/discover/deezer/matches',
      { videos: videos.map(toYouTubeVideoPayload), searchQuery },
      signal,
    ),
  customDeezerMatch: (video: Video, customQuery: string) =>
    post<Match>('/api/discover/deezer/custom-match', {
      video: toYouTubeVideoPayload(video),
      customQuery,
    }),
  lyricsOptions: (track: Track, signal?: AbortSignal) =>
    post<LyricsResult>('/api/discover/lyrics/options', { track }, signal),
  customLyricsSearch: (
    track: Track,
    customQuery: string,
    signal?: AbortSignal,
  ) =>
    post<LyricsResult>(
      '/api/discover/lyrics/custom-search',
      { track, customQuery },
      signal,
    ),
  commit: (items: CommitItem[]) =>
    post<{ results: SaveResult[] }>('/api/discover/commit', {
      items: items.map((item) => ({
        ...item,
        video: toYouTubeVideoPayload(item.video),
      })),
    }),
};
