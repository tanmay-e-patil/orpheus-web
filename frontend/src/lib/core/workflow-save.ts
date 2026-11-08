import type {
  LyricsResult,
  SaveResult,
  SongEdits,
  Track,
  Video,
  Workflow,
} from '../types';

export type CommitItem = {
  song: Track;
  video: Video;
  lyricsSearchResult?: LyricsResult;
  edits: SongEdits | Record<string, never>;
};

// Keep successful songs out of retries after a partially successful batch.
export function buildCommitItems(
  state: Workflow,
  results: SaveResult[] = [],
): CommitItem[] {
  const saved = new Set(
    results.filter((result) => result.success).map((result) => result.trackId),
  );
  return state.trackMatches
    .filter((result) => result.selectedMatch)
    .flatMap((result, index): CommitItem[] => {
      const song = result.selectedMatch;
      if (!song) return [];
      if (saved.has(song.id)) return [];
      return [
        {
          song,
          video: result.youtubeVideo,
          lyricsSearchResult: state.lyricsSearchResults.find(
            (candidate) => candidate.trackId === song.id,
          ),
          edits: state.editedTracks[index] || {},
        },
      ];
    });
}

export function mergeCommitResults(
  previous: SaveResult[],
  submitted: CommitItem[],
  received: SaveResult[],
) {
  const results = new Map(previous.map((result) => [result.trackId, result]));
  for (const item of submitted) {
    const result = received.find(
      (candidate) => candidate.trackId === item.song.id,
    );
    results.set(
      item.song.id,
      result || {
        trackId: item.song.id,
        success: false,
        error: 'No save confirmation received. Try again.',
      },
    );
  }
  return [...results.values()];
}
