import { Passkey } from './passkey.js';

export class APIError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
  }
}

async function request(path, options = {}) {
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
    if (
      response.status === 401 &&
      ![
        '/api/auth/session',
        '/api/auth/login',
        '/api/auth/passkey/login-finish',
      ].includes(path)
    ) {
      window.dispatchEvent(new CustomEvent('orpheus:unauthorized'));
    }
    throw new APIError(
      error.message || response.statusText,
      response.status,
      error.code,
    );
  }
  return payload;
}

function toYouTubeVideoPayload(video) {
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

export const API = {
  login: (email, password) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (username, email, password) =>
    request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  session: () => request('/api/auth/session'),
  nativeAuthDetails: (requestID) =>
    request(
      `/api/auth/native/details?request=${encodeURIComponent(requestID)}`,
    ),
  nativeAuthAuthorize: (requestID) =>
    request('/api/auth/native/authorize', {
      method: 'POST',
      body: JSON.stringify({ request: requestID }),
    }),
  passkeyStatus: () => request('/api/auth/passkey/status'),
  passkeyRegisterBegin: () =>
    request('/api/auth/passkey/register-begin', { method: 'POST' }),
  passkeyRegisterFinish: (credential, name = '') =>
    request(
      `/api/auth/passkey/register-finish?name=${encodeURIComponent(name)}`,
      {
        method: 'POST',
        body: JSON.stringify(credential),
      },
    ),
  passkeyLoginBegin: () =>
    request('/api/auth/passkey/login-begin', { method: 'POST' }),
  passkeyLoginFinish: (credential) =>
    request('/api/auth/passkey/login-finish', {
      method: 'POST',
      body: JSON.stringify(credential),
    }),
  passkeyList: () => request('/api/auth/passkeys'),
  passkeyDelete: (id) =>
    request(`/api/auth/passkeys/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  songs: (cursor, limit = 50, signal, sort = 'artist') => {
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
    return request(`/api/songs${suffix}`, { signal });
  },
  song: (trackId, signal) =>
    request(`/api/songs/${encodeURIComponent(trackId)}`, { signal }),
  recordSongPlay: (trackId) =>
    request(`/api/songs/${encodeURIComponent(trackId)}/plays`, {
      method: 'POST',
    }),
  updateSongMetadata: (trackId, metadata) =>
    request(`/api/songs/${encodeURIComponent(trackId)}/metadata`, {
      method: 'PATCH',
      body: JSON.stringify(metadata),
    }),
  replaceAudioSource: (trackId, video) =>
    request(`/api/songs/${encodeURIComponent(trackId)}/audio-source`, {
      method: 'POST',
      body: JSON.stringify(toYouTubeVideoPayload(video)),
    }),
  regenerateSong: (trackId) =>
    request(`/api/songs/${encodeURIComponent(trackId)}/regenerate`, {
      method: 'POST',
    }),
  refreshAlbumArt: (trackIds) =>
    request('/api/songs/album-art/refresh', {
      method: 'POST',
      body: JSON.stringify({ trackIds }),
    }),
  saveLyrics: (trackId, plainLyrics, syncedLyrics) =>
    request('/api/lyrics/save', {
      method: 'POST',
      body: JSON.stringify({ trackId, plainLyrics, syncedLyrics }),
    }),
  lrclibExact: (body, signal) =>
    request('/api/lyrics/lrclib', {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    }),
  discoverYouTube: (query, signal) =>
    request('/api/discover/youtube', {
      method: 'POST',
      body: JSON.stringify({ query }),
      signal,
    }),
  matchDeezerTracks: (videos, searchQuery, signal) =>
    request('/api/discover/deezer/matches', {
      method: 'POST',
      body: JSON.stringify({
        videos: videos.map(toYouTubeVideoPayload),
        searchQuery,
      }),
      signal,
    }),
  customDeezerMatch: (video, customQuery) =>
    request('/api/discover/deezer/custom-match', {
      method: 'POST',
      body: JSON.stringify({
        video: toYouTubeVideoPayload(video),
        customQuery,
      }),
    }),
  lyricsOptions: (track, signal) =>
    request('/api/discover/lyrics/options', {
      method: 'POST',
      body: JSON.stringify({ track }),
      signal,
    }),
  customLyricsSearch: (track, customQuery) =>
    request('/api/discover/lyrics/custom-search', {
      method: 'POST',
      body: JSON.stringify({ track, customQuery }),
    }),
  commit: (items) =>
    request('/api/discover/commit', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
};
