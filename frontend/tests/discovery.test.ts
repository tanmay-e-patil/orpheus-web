import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import Discovery from '../src/pages/Discovery.svelte';
import { api } from '../src/lib/api';
import {
  createInitialWorkflowState,
  saveWorkflowState,
  loadWorkflowState,
  getAllDrafts,
} from '../src/lib/core/store.js';
import { makeEdits } from '../src/lib/music';
import type { Workflow } from '../src/lib/types';
vi.mock('../src/lib/core/idb-song-cache.js', () => ({
  clearSongsCache: vi.fn().mockResolvedValue(undefined),
}));
afterEach(() => vi.restoreAllMocks());
function fixture() {
  const draft: Workflow = {
    ...createInitialWorkflowState('Sample'),
    currentStage: 'review',
    trackMatches: ['a', 'b'].map((id) => ({
      youtubeVideo: { id: `video-${id}`, title: id },
      trackMatches: [],
      selectedMatch: {
        id,
        name: `Song ${id}`,
        artist: 'Artist',
        album: 'Album',
      },
    })),
  };
  draft.editedTracks = makeEdits(draft);
  saveWorkflowState(draft);
  return draft;
}
it('saves on Review and retries only the failed song, preserving values', async () => {
  fixture();
  history.replaceState({}, '', '/discover/review');
  const commit = vi
    .spyOn(api, 'commit')
    .mockResolvedValueOnce({
      results: [
        { trackId: 'a', success: true },
        { trackId: 'b', success: false, error: 'Connection lost' },
      ],
    })
    .mockResolvedValueOnce({ results: [{ trackId: 'b', success: true }] });
  render(Discovery, { stage: 'review' });
  await fireEvent.click(
    screen.getByRole('button', { name: /Save to library/ }),
  );
  await screen.findByRole('button', { name: /Retry unsaved songs/ });
  expect(loadWorkflowState()!.saveResults![0].success).toBe(true);
  expect(location.pathname).toBe('/discover/review');
  expect(screen.getByDisplayValue('Song a')).toBeDisabled();
  await fireEvent.click(
    screen.getByRole('button', { name: /Retry unsaved songs/ }),
  );
  await screen.findByRole('link', { name: /Go to your library/ });
  expect(commit.mock.calls[1][0]).toEqual([
    expect.objectContaining({ song: expect.objectContaining({ id: 'b' }) }),
  ]);
  expect(loadWorkflowState()).toBeNull();
  await waitFor(() =>
    expect(location.pathname + location.search).toBe(
      '/home?sort=recentlyAdded',
    ),
  );
});
it('shows a network error without losing editable values', async () => {
  fixture();
  vi.spyOn(api, 'commit').mockRejectedValue(new Error('Offline'));
  render(Discovery, { stage: 'review' });
  await fireEvent.click(
    screen.getByRole('button', { name: /Save to library/ }),
  );
  await screen.findByRole('alert');
  expect(screen.getByRole('alert')).toHaveTextContent('Offline');
  expect(screen.getByDisplayValue('Song b')).toBeEnabled();
  expect(loadWorkflowState()!.editedTracks[1].trackName).toBe('Song b');
});
it('archives the active session before starting another search', async () => {
  const draft = fixture();
  render(Discovery, { stage: 'search' });
  await fireEvent.input(screen.getByRole('searchbox'), {
    target: { value: 'New song' },
  });
  await fireEvent.submit(screen.getByRole('searchbox').closest('form')!);
  await waitFor(() =>
    expect(loadWorkflowState()!.searchQuery).toBe('New song'),
  );
  expect(getAllDrafts()[draft.id].searchQuery).toBe('Sample');
});
it('undo restores a discarded draft', async () => {
  const draft = fixture();
  render(Discovery, { stage: 'search' });
  await fireEvent.click(
    screen.getByRole('button', { name: 'Discard session' }),
  );
  expect(loadWorkflowState()).toBeNull();
  await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(loadWorkflowState()!.id).toBe(draft.id);
});
it('prevents duplicate saves while a request is pending and leaves a newer draft intact', async () => {
  fixture();
  let resolve!: (value: {
    results: { trackId: string; success: boolean }[];
  }) => void;
  const commit = vi.spyOn(api, 'commit').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(Discovery, { stage: 'review' });
  const form = screen
    .getByRole('button', { name: /Save to library/ })
    .closest('form')!;
  await fireEvent.submit(form);
  await fireEvent.submit(form);
  expect(commit).toHaveBeenCalledOnce();
  const newer = createInitialWorkflowState('A different session');
  saveWorkflowState(newer);
  resolve({
    results: [
      { trackId: 'a', success: true },
      { trackId: 'b', success: true },
    ],
  });
  await screen.findByRole('link', { name: /Go to your library/ });
  expect(loadWorkflowState()!.id).toBe(newer.id);
});

function sourceDraft() {
  const draft = createInitialWorkflowState('Song Artist');
  draft.selectedVideos = [
    {
      id: 'source',
      title: 'Artist - Song (Official Video)',
      channelTitle: 'Artist',
      duration: 'PT4M20S',
    },
  ];
  saveWorkflowState(draft);
  return draft;
}
const matchedTrack = {
  id: 'track',
  name: 'Song',
  artist: 'Artist',
  album: 'Album',
  durationMs: 258000,
};
function strongMatch() {
  return {
    youtubeVideo: { ...sourceDraft().selectedVideos[0], selected: true },
    trackMatches: [matchedTrack],
    selectedMatch: matchedTrack,
    confidence: 'high',
    autoAccept: true,
  };
}
const strongLyrics = {
  trackId: 'track',
  options: [
    { id: 1, trackName: 'Song', artistName: 'Artist', plainLyrics: 'Words' },
  ],
  selectedOption: {
    id: 1,
    trackName: 'Song',
    artistName: 'Artist',
    plainLyrics: 'Words',
  },
  autoAccept: true,
  status: 'found',
};
it('takes a strong match directly from source selection to review without saving', async () => {
  const match = strongMatch();
  const matching = vi
    .spyOn(api, 'matchDeezerTracks')
    .mockResolvedValue([match]);
  const lyrics = vi.spyOn(api, 'lyricsOptions').mockResolvedValue(strongLyrics);
  const commit = vi.spyOn(api, 'commit');
  const view = render(Discovery, { stage: 'youtube' });
  await fireEvent.click(
    screen.getByRole('button', { name: /Use this audio source/ }),
  );
  await waitFor(() => expect(loadWorkflowState()!.currentStage).toBe('review'));
  expect(matching).toHaveBeenCalledOnce();
  expect(lyrics).toHaveBeenCalledWith(
    expect.objectContaining({ durationMs: 260000 }),
    expect.any(AbortSignal),
  );
  expect(commit).not.toHaveBeenCalled();
  view.unmount();
  render(Discovery, { stage: 'review' });
  expect(screen.getByDisplayValue('Song')).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Change song info' }),
  ).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Change lyrics' })).toBeEnabled();
  expect(loadWorkflowState()!.editedTracks[0].lyrics).toBe('Words');
});
it('opens the song chooser for an ambiguous match without fetching lyrics', async () => {
  const match = strongMatch();
  vi.spyOn(api, 'matchDeezerTracks').mockResolvedValue([
    { ...match, selectedMatch: undefined, autoAccept: false },
  ]);
  const lyrics = vi.spyOn(api, 'lyricsOptions');
  render(Discovery, { stage: 'youtube' });
  await fireEvent.click(
    screen.getByRole('button', { name: /Use this audio source/ }),
  );
  await waitFor(() =>
    expect(loadWorkflowState()!.currentStage).toBe('spotify'),
  );
  expect(lyrics).not.toHaveBeenCalled();
});
it('opens the lyrics chooser for weak lyrics instead of accepting the first option', async () => {
  const match = strongMatch();
  vi.spyOn(api, 'matchDeezerTracks').mockResolvedValue([match]);
  vi.spyOn(api, 'lyricsOptions').mockResolvedValue({
    ...strongLyrics,
    autoAccept: false,
    selectedOption: undefined,
    status: 'partial',
  });
  render(Discovery, { stage: 'youtube' });
  await fireEvent.click(
    screen.getByRole('button', { name: /Use this audio source/ }),
  );
  await waitFor(() => expect(loadWorkflowState()!.currentStage).toBe('lyrics'));
  expect(
    loadWorkflowState()!.lyricsSearchResults[0].selectedOption,
  ).toBeUndefined();
});
it('continues to review when lyrics are unavailable', async () => {
  const match = strongMatch();
  vi.spyOn(api, 'matchDeezerTracks').mockResolvedValue([match]);
  vi.spyOn(api, 'lyricsOptions').mockResolvedValue({
    trackId: 'track',
    options: [],
    status: 'none',
    autoAccept: false,
  });
  render(Discovery, { stage: 'youtube' });
  await fireEvent.click(
    screen.getByRole('button', { name: /Use this audio source/ }),
  );
  await waitFor(() => expect(loadWorkflowState()!.currentStage).toBe('review'));
});
it('keeps the manual workflow available and persists the choice', async () => {
  sourceDraft();
  const matching = vi.spyOn(api, 'matchDeezerTracks');
  render(Discovery, { stage: 'youtube' });
  await fireEvent.click(
    screen.getByRole('checkbox', {
      name: /Find song info and lyrics automatically/,
    }),
  );
  await fireEvent.click(
    screen.getByRole('button', { name: /Use this audio source/ }),
  );
  expect(matching).not.toHaveBeenCalled();
  expect(loadWorkflowState()!.automaticMatching).toBe(false);
  await fireEvent.click(
    screen.getByRole('button', { name: /Choose song info/ }),
  );
  expect(loadWorkflowState()!.currentStage).toBe('spotify');
});
it('retries failed lyrics lookup without repeating successful matching', async () => {
  const match = strongMatch();
  const matching = vi
    .spyOn(api, 'matchDeezerTracks')
    .mockResolvedValue([match]);
  vi.spyOn(api, 'lyricsOptions')
    .mockRejectedValueOnce(new Error('Lyrics service unavailable'))
    .mockResolvedValueOnce(strongLyrics);
  render(Discovery, { stage: 'youtube' });
  await fireEvent.click(
    screen.getByRole('button', { name: /Use this audio source/ }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Lyrics service unavailable',
  );
  expect(loadWorkflowState()!.trackMatches[0].selectedMatch?.id).toBe('track');
  await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(loadWorkflowState()!.currentStage).toBe('review'));
  expect(matching).toHaveBeenCalledOnce();
});
it('continues after an explicit manual song choice without requiring strong automatic evidence', async () => {
  const match = strongMatch();
  const draft = loadWorkflowState()!;
  draft.selectedVideos[0].selected = true;
  draft.trackMatchSearchQuery = draft.searchQuery;
  draft.trackMatches = [
    { ...match, selectedMatch: undefined, autoAccept: false },
  ];
  saveWorkflowState(draft);
  vi.spyOn(api, 'lyricsOptions').mockResolvedValue(strongLyrics);
  render(Discovery, { stage: 'spotify' });
  await fireEvent.click(
    screen.getByRole('button', { name: /Song\s*Artist · Album/ }),
  );
  await fireEvent.click(screen.getByRole('button', { name: /^Continue$/ }));
  await waitFor(() => expect(loadWorkflowState()!.currentStage).toBe('review'));
});
it('ignores a late lookup after leaving discovery', async () => {
  const match = strongMatch();
  let resolve!: (value: (typeof match)[]) => void;
  vi.spyOn(api, 'matchDeezerTracks').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const lyrics = vi.spyOn(api, 'lyricsOptions');
  const view = render(Discovery, { stage: 'youtube' });
  await fireEvent.click(
    screen.getByRole('button', { name: /Use this audio source/ }),
  );
  view.unmount();
  resolve([match]);
  await Promise.resolve();
  expect(loadWorkflowState()!.trackMatches).toEqual([]);
  expect(lyrics).not.toHaveBeenCalled();
});

it('retries a failed custom metadata search instead of advancing with the previous selection', async () => {
  const match = strongMatch();
  const draft = loadWorkflowState()!;
  draft.selectedVideos[0].selected = true;
  draft.trackMatches = [match];
  draft.trackMatchSearchQuery = draft.searchQuery;
  saveWorkflowState(draft);
  const custom = vi
    .spyOn(api, 'customDeezerMatch')
    .mockRejectedValueOnce(new Error('Metadata unavailable'))
    .mockResolvedValueOnce(match);
  const lyrics = vi.spyOn(api, 'lyricsOptions');
  render(Discovery, { stage: 'spotify' });
  await fireEvent.click(
    screen.getByRole('button', { name: 'Search song info' }),
  );
  await screen.findByRole('alert');
  await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(custom).toHaveBeenCalledTimes(2));
  expect(lyrics).not.toHaveBeenCalled();
  expect(loadWorkflowState()!.currentStage).toBe('spotify');
});

it('updates review lyrics after a custom lookup while preserving metadata edits', async () => {
  const draft = fixture();
  draft.trackMatches = [draft.trackMatches[0]];
  draft.editedTracks = [
    { ...draft.editedTracks[0], trackName: 'My title', lyrics: 'Old words' },
  ];
  draft.trackMatches[0].youtubeVideo.duration = 'PT4M20S';
  draft.lyricsSearchResults = [{ trackId: 'a', options: [] }];
  saveWorkflowState(draft);
  const custom = vi.spyOn(api, 'customLyricsSearch').mockResolvedValue({
    ...strongLyrics,
    trackId: 'a',
  });
  render(Discovery, { stage: 'lyrics' });
  await fireEvent.click(screen.getByRole('button', { name: 'Search lyrics' }));
  await waitFor(() =>
    expect(loadWorkflowState()!.editedTracks[0].lyrics).toBe('Words'),
  );
  expect(loadWorkflowState()!.editedTracks[0].trackName).toBe('My title');
  expect(custom).toHaveBeenCalledWith(
    expect.objectContaining({ durationMs: 260000 }),
    expect.any(String),
  );
});

it('shows an explicit artist conflict for a different recording', () => {
  const match = strongMatch();
  const draft = loadWorkflowState()!;
  draft.selectedVideos[0].selected = true;
  draft.trackMatchSearchQuery = draft.searchQuery;
  draft.trackMatches = [
    {
      ...match,
      autoAccept: false,
      selectedMatch: undefined,
      trackMatches: [
        {
          ...matchedTrack,
          artist: 'Different artist',
          matchScore: 0,
          matchEvidence: {
            titleScore: 100,
            titleExact: true,
            titleConflict: false,
            artistScore: 0,
            artistConflict: true,
            durationScore: 100,
            durationConflict: false,
            versionConflict: false,
            reasons: ['Different artist'],
          },
        },
      ],
    },
  ];
  saveWorkflowState(draft);
  render(Discovery, { stage: 'spotify' });
  expect(
    screen.getByText('Different artist', { selector: 'small' }),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: /^Continue$/ })).toBeDisabled();
});

it('lets a lyrics failure continue to review without losing the selected metadata', async () => {
  const match = strongMatch();
  const matching = vi
    .spyOn(api, 'matchDeezerTracks')
    .mockResolvedValue([match]);
  const lyrics = vi
    .spyOn(api, 'lyricsOptions')
    .mockRejectedValue(new Error('Lyrics service is temporarily unavailable.'));
  const commit = vi.spyOn(api, 'commit');
  const view = render(Discovery, { stage: 'youtube' });
  await fireEvent.click(
    screen.getByRole('button', { name: /Use this audio source/ }),
  );
  await screen.findByRole('alert');
  await fireEvent.click(
    screen.getByRole('button', { name: 'Continue without lyrics' }),
  );
  expect(loadWorkflowState()!.currentStage).toBe('review');
  expect(loadWorkflowState()!.trackMatches[0].selectedMatch?.id).toBe('track');
  expect(matching).toHaveBeenCalledOnce();
  expect(lyrics).toHaveBeenCalledOnce();
  expect(commit).not.toHaveBeenCalled();
  view.unmount();
  render(Discovery, { stage: 'review' });
  expect(screen.getByDisplayValue('Song')).toBeVisible();
  expect(loadWorkflowState()!.editedTracks[0].lyrics).toBe('');
});

it('does not offer to skip lyrics when song matching itself failed', async () => {
  sourceDraft();
  vi.spyOn(api, 'matchDeezerTracks').mockRejectedValue(
    new Error('Metadata lookup failed'),
  );
  render(Discovery, { stage: 'youtube' });
  await fireEvent.click(
    screen.getByRole('button', { name: /Use this audio source/ }),
  );
  await screen.findByRole('alert');
  expect(
    screen.queryByRole('button', { name: 'Continue without lyrics' }),
  ).not.toBeInTheDocument();
});
