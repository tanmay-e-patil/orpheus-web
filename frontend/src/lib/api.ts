import { API } from './core/api.js';
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
// The transport is shared with the existing audio engine and retains its 401 event handling.
export const api = API as unknown as {
  session(): Promise<Session>;
  login(email: string, password: string): Promise<unknown>;
  logout(): Promise<unknown>;
  nativeAuthDetails(
    requestID: string,
  ): Promise<{ action: string; userId?: string; name?: string }>;
  nativeAuthAuthorize(requestID: string): Promise<{ callbackURL: string }>;
  passkeyStatus(): Promise<{ hasPasskey: boolean }>;
  passkeyLoginBegin(): Promise<unknown>;
  passkeyLoginFinish(credential: unknown): Promise<unknown>;
  passkeyRegisterBegin(): Promise<unknown>;
  passkeyRegisterFinish(credential: unknown, name: string): Promise<unknown>;
  passkeyList(): Promise<{
    passkeys: { id: string; name: string; createdAt: string }[];
  }>;
  passkeyDelete(id: string): Promise<unknown>;
  songs(
    cursor: Record<string, unknown> | null,
    limit?: number,
    signal?: AbortSignal,
    sort?: string,
  ): Promise<{
    songs: Song[];
    nextCursor: Record<string, unknown> | null;
    hasMore: boolean;
  }>;
  deleteSong(
    id: string,
  ): Promise<{ trackId: string; deletionQueued: boolean } | null>;
  song(id: string, signal?: AbortSignal): Promise<SongDetail>;
  updateSongMetadata(
    id: string,
    metadata: Record<string, string>,
  ): Promise<SongDetail>;
  replaceAudioSource(id: string, video: Video): Promise<SongDetail>;
  regenerateSong(id: string): Promise<SongDetail>;
  saveLyrics(id: string, plain: string, synced: string): Promise<unknown>;
  lrclibExact(
    body: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<{ plainLyrics?: string; syncedLyrics?: string }>;
  discoverYouTube(query: string, signal?: AbortSignal): Promise<Video[]>;
  matchDeezerTracks(
    videos: Video[],
    query: string,
    signal?: AbortSignal,
  ): Promise<Match[]>;
  customDeezerMatch(video: Video, query: string): Promise<Match>;
  lyricsOptions(track: Track, signal?: AbortSignal): Promise<LyricsResult>;
  customLyricsSearch(track: Track, query: string): Promise<LyricsResult>;
  commit(items: unknown[]): Promise<{ results: SaveResult[] }>;
  refreshAlbumArt(ids: string[]): Promise<{ updated: Record<string, string> }>;
};
