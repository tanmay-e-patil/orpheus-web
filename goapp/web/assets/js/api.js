export class APIError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.code = code;
  }
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers,
  });
  let payload = null;
  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    payload = await response.json();
  }
  if (!response.ok) {
    const error = payload?.error || {};
    if (response.status === 401 && path !== "/api/auth/session") {
      window.dispatchEvent(new CustomEvent("orpheus:unauthorized"));
    }
    throw new APIError(error.message || response.statusText, response.status, error.code);
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
  login: (username, password) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  session: () => request("/api/auth/session"),
  songs: (cursor, limit = 50) => {
    const params = new URLSearchParams();
    if (cursor) {
      params.set("artistName", cursor.artistName);
      params.set("trackId", cursor.trackId);
    }
    if (limit) params.set("limit", String(limit));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request(`/api/songs${suffix}`);
  },
  refreshAlbumArt: (trackIds) =>
    request("/api/songs/album-art/refresh", {
      method: "POST",
      body: JSON.stringify({ trackIds }),
    }),
  saveLyrics: (trackId, plainLyrics, syncedLyrics) =>
    request("/api/lyrics/save", {
      method: "POST",
      body: JSON.stringify({ trackId, plainLyrics, syncedLyrics }),
    }),
  lrclibExact: (body, signal) =>
    request("/api/lyrics/lrclib", { method: "POST", body: JSON.stringify(body), signal }),
  discoverYouTube: (query, signal) =>
    request("/api/discover/youtube", {
      method: "POST",
      body: JSON.stringify({ query }),
      signal,
    }),
  matchDeezerTracks: (videos, signal) =>
    request("/api/discover/deezer/matches", {
      method: "POST",
      body: JSON.stringify({ videos: videos.map(toYouTubeVideoPayload) }),
      signal,
    }),
  customDeezerMatch: (video, customQuery) =>
    request("/api/discover/deezer/custom-match", {
      method: "POST",
      body: JSON.stringify({ video: toYouTubeVideoPayload(video), customQuery }),
    }),
  lyricsOptions: (track, signal) =>
    request("/api/discover/lyrics/options", {
      method: "POST",
      body: JSON.stringify({ track }),
      signal,
    }),
  customLyricsSearch: (track, customQuery) =>
    request("/api/discover/lyrics/custom-search", {
      method: "POST",
      body: JSON.stringify({ track, customQuery }),
    }),
  commit: (items) =>
    request("/api/discover/commit", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
};
