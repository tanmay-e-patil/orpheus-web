import { describe, it, expect } from 'vitest';
import {
  searchSongs,
  matchesSelection,
  adjustLrc,
  sourceWarning,
  makeEdits,
} from '../src/lib/music';
import {
  buildCommitItems,
  mergeCommitResults,
} from '../src/lib/core/workflow-save';
import {
  createInitialWorkflowState,
  saveWorkflowState,
  loadWorkflowState,
  saveNamedDraft,
  getAllDrafts,
} from '../src/lib/core/workflow-store.svelte';
import type { Song, Workflow } from '../src/lib/types';
function fixture(): Workflow {
  return {
    ...createInitialWorkflowState('Search'),
    trackMatches: [
      {
        youtubeVideo: { id: 'v1', title: 'One' },
        trackMatches: [],
        selectedMatch: {
          id: 'a',
          name: 'One',
          artist: 'Artist',
          album: 'Album',
        },
      },
      {
        youtubeVideo: { id: 'v2', title: 'Two' },
        trackMatches: [],
        selectedMatch: {
          id: 'b',
          name: 'Two',
          artist: 'Artist',
          album: 'Album',
        },
      },
    ],
  };
}
describe('library and workflow behavior', () => {
  it('searches every term across metadata and lyrics, preferring metadata matches', () => {
    const songs = [
      {
        trackId: 'a',
        name: 'Ocean',
        artistName: 'Artist',
        albumName: 'Album',
        isAvailable: true,
      },
      {
        trackId: 'b',
        name: 'Sky',
        artistName: 'Artist',
        albumName: 'Album',
        lyrics: 'Ocean blue',
        isAvailable: true,
      },
    ] as Song[];
    expect(searchSongs(songs, ' ocean ').map((s) => s.trackId)).toEqual([
      'a',
      'b',
    ]);
    expect(searchSongs(songs, 'ocean blue').map((s) => s.trackId)).toEqual([
      'b',
    ]);
  });
  it('invalidates cached matching when the query or selected audio changes', () => {
    const draft = fixture();
    draft.selectedVideos = [{ id: 'v1', title: 'One', selected: true }];
    draft.trackMatches = [draft.trackMatches[0]];
    expect(matchesSelection(draft)).toBe(false);
    draft.trackMatchSearchQuery = draft.searchQuery;
    expect(matchesSelection(draft)).toBe(true);
    draft.selectedVideos[0].id = 'different';
    expect(matchesSelection(draft)).toBe(false);
  });
  it('does not submit successful songs again and retains the right edits on retry', () => {
    const draft = fixture();
    draft.editedTracks = makeEdits(draft);
    draft.editedTracks[1].trackName = 'Edited two';
    const previous = [
      { trackId: 'a', success: true },
      { trackId: 'b', success: false },
    ];
    const items = buildCommitItems(draft, previous);
    expect(items.map((item) => item.song.id)).toEqual(['b']);
    expect(items[0].edits.trackName).toBe('Edited two');
    const results = mergeCommitResults(previous, items, [
      { trackId: 'b', success: true },
    ]);
    expect(buildCommitItems(draft, results)).toEqual([]);
  });
  it('treats missing save confirmations as failures', () => {
    const draft = fixture();
    const submitted = buildCommitItems(draft);
    const results = mergeCommitResults([], submitted, [
      { trackId: 'a', success: true },
    ]);
    expect(results[1].success).toBe(false);
    expect(buildCommitItems(draft, results)[0].song.id).toBe('b');
  });
  it('keeps existing draft keys and can restore an archived session', () => {
    const draft = fixture();
    saveWorkflowState(draft);
    saveNamedDraft(draft.id, draft);
    saveWorkflowState(createInitialWorkflowState('New search'));
    expect(loadWorkflowState()!.searchQuery).toBe('New search');
    saveWorkflowState(getAllDrafts()[draft.id]);
    expect(loadWorkflowState()!.id).toBe(draft.id);
    expect(localStorage.getItem('orpheus-workflow-draft')).toContain('Search');
  });
  it('adjusts timestamps without changing words, clamps negative times, and flags source mismatches', () => {
    expect(adjustLrc('[00:01.25]One\n[01:02.500]Two', -2)).toBe(
      '[00:00.00]One\n[01:00.50]Two',
    );
    expect(sourceWarning('PT3M', 'PT4M')).toContain('60 seconds');
    expect(sourceWarning('PT3M', 'PT3M5S')).toBe('');
  });
});
