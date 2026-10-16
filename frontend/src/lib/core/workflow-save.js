// Keep successful songs out of retries after a partially successful batch.
/**
 * @param {import('../types').Workflow} state
 * @param {import('../types').SaveResult[]} results
 */
export function buildCommitItems(state, results = []) {
  const saved = new Set(
    results.filter((result) => result.success).map((result) => result.trackId),
  );
  return state.trackMatches
    .filter((result) => result.selectedMatch)
    .flatMap((result, index) => {
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

/**
 * @param {import('../types').SaveResult[]} previous
 * @param {ReturnType<typeof buildCommitItems>} submitted
 * @param {import('../types').SaveResult[]} received
 */
export function mergeCommitResults(previous, submitted, received) {
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
