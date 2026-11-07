import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/svelte';
import Discovery from '../src/pages/Discovery.svelte';
import { api } from '../src/lib/api';
import {
  createInitialWorkflowState,
  loadWorkflowState,
  saveWorkflowState,
} from '../src/lib/core/store.js';
import {
  clearPlayer,
  getPlayerState,
  setQueue,
  setTime,
} from '../src/lib/core/player-store.js';
import { rankAudioSources } from '../src/lib/discovery';
import type { Video, Match } from '../src/lib/types';

const player = vi.hoisted(() => ({
  seekTo: vi.fn(),
  destroy: vi.fn(),
  getCurrentTime: vi.fn(() => 1),
  playVideo: vi.fn(),
  started: vi.fn(),
}));
vi.mock('../src/lib/youtube', () => ({
  loadYouTube: vi.fn().mockResolvedValue({
    Player: class {
      constructor(_target: HTMLElement, options: { videoId: string }) {
        player.started(options.videoId);
        Object.assign(this, player);
      }
    },
  }),
  youtubeErrorMessage: (code: number) => `Playback failed (${code})`,
}));
vi.mock('../src/lib/core/idb-song-cache.js', () => ({
  clearSongsCache: vi.fn().mockResolvedValue(undefined),
}));
afterEach(() => {
  cleanup();
  clearPlayer();
  vi.restoreAllMocks();
});
beforeEach(() => {
  vi.clearAllMocks();
  player.getCurrentTime.mockReturnValue(1);
});

const videos: Video[] = [
  {
    id: 'video',
    title: 'Artist - Song (Official Video)',
    channelTitle: 'Artist',
    duration: 'PT3M20S',
  },
  {
    id: 'audio',
    title: 'Artist - Song (Official Audio)',
    channelTitle: 'Artist',
    duration: 'PT3M20S',
  },
  {
    id: 'cover',
    title: 'Artist - Song Cover',
    channelTitle: 'Someone Else',
    duration: 'PT3M20S',
  },
];
const track = {
  id: 'track',
  name: 'Song',
  artist: 'Artist',
  album: 'Album',
  durationMs: 200000,
  albumImageUrl: 'https://example.test/album.jpg',
};
const lyrics = {
  trackId: 'track',
  options: [
    {
      id: 1,
      trackName: 'Song',
      artistName: 'Artist',
      plainLyrics: 'Words\nNext',
      syncedLyrics: '[00:01.00]Words\n[00:02.00]Next',
      confidence: 100,
    },
  ],
  autoAccept: true,
};
function setup() {
  const draft = {
    ...createInitialWorkflowState('Artist Song'),
    currentStage: 'review',
    reviewFirst: true,
  };
  saveWorkflowState(draft);
  const discover = vi.spyOn(api, 'discoverYouTube').mockResolvedValue(videos);
  const matching = vi
    .spyOn(api, 'matchDeezerTracks')
    .mockImplementation(async (sources): Promise<Match[]> => [
      {
        youtubeVideo: sources[0],
        trackMatches: [track],
        selectedMatch: track,
        autoAccept: true,
      },
    ]);
  const lyricSearch = vi
    .spyOn(api, 'lyricsOptions')
    .mockResolvedValue({ ...lyrics, selectedOption: lyrics.options[0] });
  const commit = vi
    .spyOn(api, 'commit')
    .mockResolvedValue({ results: [{ trackId: 'track', success: true }] });
  return { discover, matching, lyricSearch, commit };
}
async function ready() {
  await waitFor(() => expect(loadWorkflowState()?.reviewPrepared).toBe(true));
  await screen.findByDisplayValue('Song');
}

it('goes straight from search to review without asking for an audio source', async () => {
  render(Discovery, { stage: 'search' });
  await fireEvent.input(screen.getByRole('searchbox'), {
    target: { value: 'Artist Song' },
  });
  await fireEvent.click(screen.getByRole('button', { name: /Find my song/ }));
  expect(location.pathname).toBe('/discover/review');
  expect(loadWorkflowState()?.reviewFirst).toBe(true);
});

it('chooses audio, metadata, and lyrics automatically, then waits for explicit save', async () => {
  const { matching, commit } = setup();
  render(Discovery, { stage: 'review' });
  await ready();
  expect(matching).toHaveBeenCalledOnce();
  expect(matching.mock.calls[0][0][0].id).toBe('audio');
  expect(
    loadWorkflowState()!.selectedVideos.find((row) => row.selected)?.id,
  ).toBe('audio');
  expect(
    screen.queryByRole('list', { name: 'Add-song progress' }),
  ).not.toBeInTheDocument();
  expect(commit).not.toHaveBeenCalled();
  await fireEvent.submit(document.getElementById('song-review-form')!);
  await screen.findByRole('link', { name: /Go to your library/ });
  expect(commit).toHaveBeenCalledWith([
    expect.objectContaining({
      video: expect.objectContaining({ id: 'audio' }),
      edits: expect.objectContaining({ lyrics: 'Words\nNext' }),
    }),
  ]);
  expect(loadWorkflowState()).toBeNull();
});

it('keeps the review usable when lyrics are unavailable', async () => {
  const { lyricSearch } = setup();
  lyricSearch.mockRejectedValue(new Error('Service unavailable'));
  render(Discovery, { stage: 'review' });
  await ready();
  expect(screen.getByText(/Lyrics couldn’t be loaded/)).toBeVisible();
  expect(screen.getByRole('button', { name: /Save to library/ })).toBeEnabled();
  expect(
    screen.getByRole('button', { name: 'Retry lyrics lookup' }),
  ).toBeEnabled();
});

it('provides manual metadata with a stable id when the catalogue has no match', async () => {
  const { matching, commit } = setup();
  matching.mockImplementation(async (sources) => [
    { youtubeVideo: sources[0], trackMatches: [] },
  ]);
  render(Discovery, { stage: 'review' });
  await waitFor(() => expect(loadWorkflowState()?.reviewPrepared).toBe(true));
  expect(screen.getByText(/Song info wasn’t found/)).toBeVisible();
  await fireEvent.input(screen.getByLabelText('Song title'), {
    target: { value: 'My song' },
  });
  await fireEvent.input(screen.getByLabelText('Artist', { exact: true }), {
    target: { value: 'My artist' },
  });
  await fireEvent.submit(document.getElementById('song-review-form')!);
  await waitFor(() => expect(commit).toHaveBeenCalledOnce());
  expect(commit.mock.calls[0][0]).toEqual([
    expect.objectContaining({
      song: expect.objectContaining({ id: 'youtube:audio' }),
      edits: expect.objectContaining({
        trackName: 'My song',
        artistName: 'My artist',
      }),
    }),
  ]);
});

it('changing the source preserves metadata and lyric edits', async () => {
  setup();
  render(Discovery, { stage: 'review' });
  await ready();
  await fireEvent.input(screen.getByLabelText('Song title'), {
    target: { value: 'My title' },
  });
  await fireEvent.click(
    screen.getByRole('button', { name: 'Change audio source' }),
  );
  await fireEvent.click(
    screen.getByRole('button', { name: /Artist - Song \(Official Video\)/ }),
  );
  const draft = loadWorkflowState()!;
  expect(draft.trackMatches[0].youtubeVideo.id).toBe('video');
  expect(draft.editedTracks[0].trackName).toBe('My title');
  expect(draft.editedTracks[0].syncedLyrics).toContain('[00:01.00]Words');
  expect(screen.getByText(/Audio changed/)).toBeVisible();
});

it('previews the chosen source, seeks lyric lines, and shifts saved timing', async () => {
  setup();
  render(Discovery, { stage: 'review' });
  await ready();
  await fireEvent.click(screen.getByRole('button', { name: 'Preview song' }));
  await waitFor(() => expect(player.started).toHaveBeenCalledWith('audio'));
  await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(player.seekTo).toHaveBeenCalledWith(2, true);
  expect(player.playVideo).toHaveBeenCalled();
  await fireEvent.click(screen.getByRole('button', { name: 'Earlier 0.5 s' }));
  expect(loadWorkflowState()!.editedTracks[0].syncedLyrics).toContain(
    '[00:00.50]Words',
  );
});

it('honors cleared lyrics on save instead of restoring the original suggestion', async () => {
  const { commit } = setup();
  render(Discovery, { stage: 'review' });
  await ready();
  await fireEvent.click(
    screen.getByRole('button', { name: 'Change lyrics or add your own' }),
  );
  await fireEvent.click(screen.getByRole('button', { name: 'Remove lyrics' }));
  await fireEvent.submit(document.getElementById('song-review-form')!);
  await waitFor(() => expect(commit).toHaveBeenCalledOnce());
  const payload = commit.mock.calls[0][0] as {
    lyricsSearchResult?: unknown;
    edits: { lyrics: string; syncedLyrics: string };
  }[];
  expect(payload[0].lyricsSearchResult).toBeUndefined();
  expect(payload[0].edits.lyrics).toBe('');
  expect(payload[0].edits.syncedLyrics).toBe('');
});

it('restores a prepared draft without repeating lookups or losing edits', async () => {
  const { discover, matching } = setup();
  const view = render(Discovery, { stage: 'review' });
  await ready();
  await fireEvent.input(screen.getByLabelText('Song title'), {
    target: { value: 'Edited title' },
  });
  view.unmount();
  render(Discovery, { stage: 'review' });
  expect(screen.getByDisplayValue('Edited title')).toBeVisible();
  expect(discover).toHaveBeenCalledOnce();
  expect(matching).toHaveBeenCalledOnce();
});

it('ignores a late response after a new search replaces the active draft', async () => {
  const { discover, matching } = setup();
  let resolve!: (videos: Video[]) => void;
  discover.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(Discovery, { stage: 'review' });
  const newer = createInitialWorkflowState('Other song');
  saveWorkflowState(newer);
  resolve(videos);
  await Promise.resolve();
  await Promise.resolve();
  expect(loadWorkflowState()!.id).toBe(newer.id);
  expect(matching).not.toHaveBeenCalled();
});

it('preserves manual lyrics during a lookup retry', async () => {
  const { lyricSearch } = setup();
  render(Discovery, { stage: 'review' });
  await ready();
  await fireEvent.click(
    screen.getByRole('button', { name: 'Change lyrics or add your own' }),
  );
  await fireEvent.input(screen.getByLabelText('Lyrics', { exact: true }), {
    target: { value: 'My own words' },
  });
  await fireEvent.click(
    screen.getByRole('button', { name: 'Retry lyrics lookup' }),
  );
  await waitFor(() => expect(lyricSearch).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Retry lyrics lookup' }),
    ).toBeEnabled(),
  );
  expect(loadWorkflowState()!.editedTracks[0].lyrics).toBe('My own words');
});

it('ranks the requested recording above unrelated or unrequested cover videos', () => {
  expect(rankAudioSources(videos, 'Artist Song')[0].id).toBe('audio');
  expect(rankAudioSources(videos, 'Artist Song cover')[0].id).toBe('cover');
  expect(
    rankAudioSources(
      [{ id: 'wrong', title: 'Unrelated Official Audio' }, ...videos],
      'Artist Song',
    )[0].id,
  ).toBe('audio');
});

it('enables review and save while optional lyrics are still loading', async () => {
  const { lyricSearch, commit } = setup();
  let resolve!: (result: typeof lyrics) => void;
  lyricSearch.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(Discovery, { stage: 'review' });
  await ready();
  expect(screen.getByText(/You can save without waiting/)).toBeVisible();
  expect(screen.getByRole('button', { name: /Save to library/ })).toBeEnabled();
  await fireEvent.submit(document.getElementById('song-review-form')!);
  await screen.findByRole('link', { name: /Go to your library/ });
  expect(lyricSearch.mock.calls[0][1]?.aborted).toBe(true);
  resolve(lyrics);
  await Promise.resolve();
  await Promise.resolve();
  expect(commit).toHaveBeenCalledOnce();
  expect(loadWorkflowState()).toBeNull();
});

it('does not restore lyrics that were removed during a pending lookup', async () => {
  const { lyricSearch } = setup();
  let resolve!: (result: typeof lyrics) => void;
  lyricSearch.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(Discovery, { stage: 'review' });
  await ready();
  await fireEvent.click(
    screen.getByRole('button', { name: 'Change lyrics or add your own' }),
  );
  await fireEvent.click(screen.getByRole('button', { name: 'Remove lyrics' }));
  resolve(lyrics);
  await waitFor(() =>
    expect(
      screen.queryByText(/You can save without waiting/),
    ).not.toBeInTheDocument(),
  );
  expect(loadWorkflowState()!.editedTracks[0].lyrics).toBe('');
});

it('recovers from an empty audio search inside review', async () => {
  const { discover } = setup();
  discover.mockResolvedValueOnce([]).mockResolvedValueOnce(videos);
  render(Discovery, { stage: 'review' });
  await screen.findByText(/No audio sources found/);
  expect(
    screen.getByRole('button', { name: /Save to library/ }),
  ).toBeDisabled();
  await fireEvent.click(
    screen.getByRole('button', { name: 'Find an audio source' }),
  );
  await fireEvent.submit(
    screen
      .getByRole('textbox', { name: 'Search audio sources' })
      .closest('form')!,
  );
  await screen.findByDisplayValue('Song');
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /Save to library/ }),
    ).toBeEnabled(),
  );
});

it('uses one preview that follows playback and seeking with synced lyrics', async () => {
  setup();
  player.getCurrentTime.mockReturnValue(1);
  render(Discovery, { stage: 'review' });
  await ready();
  expect(
    screen.queryByRole('button', { name: 'Test synced lyrics' }),
  ).toBeNull();
  expect(screen.queryByRole('button', { name: 'Preview audio' })).toBeNull();
  await fireEvent.click(screen.getByRole('button', { name: 'Preview song' }));
  const first = await screen.findByRole('button', { name: 'Words' });
  const next = screen.getByRole('button', { name: 'Next' });
  await waitFor(() => expect(first).toHaveAttribute('aria-current', 'true'));
  const lyricPane = next.closest<HTMLElement>('.lyrics-content')!;
  const scrollTo = vi.fn();
  lyricPane.scrollTo = scrollTo;
  Object.defineProperty(lyricPane, 'clientHeight', { value: 180 });
  lyricPane.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
  next.getBoundingClientRect = () => ({ top: 380, height: 40 }) as DOMRect;
  player.getCurrentTime.mockReturnValue(2.2);
  await waitFor(() => expect(next).toHaveAttribute('aria-current', 'true'));
  expect(first).not.toHaveAttribute('aria-current');
  await waitFor(() =>
    expect(scrollTo).toHaveBeenCalledWith({ top: 210, behavior: 'smooth' }),
  );
  await fireEvent.click(first);
  expect(player.seekTo).toHaveBeenLastCalledWith(1, true);
  expect(player.playVideo).toHaveBeenCalled();
  expect(first).toHaveAttribute('aria-current', 'true');
  await fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
  expect(player.destroy).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Words' })).toBeNull();
});

const rememberedLyricSources: Video[] = [
  {
    id: 'lyrics',
    title: 'David Guetta - Titanium (Lyrics) ft. Sia',
    channelTitle: '7clouds',
    duration: 'PT4M5S',
  },
  {
    id: 'official',
    title: 'David Guetta - Titanium ft. Sia (Official Video)',
    channelTitle: 'David Guetta',
    duration: 'PT4M5S',
  },
  {
    id: 'lyrics2',
    title: 'David Guetta - Titanium (feat. Sia) | Lyrics',
    channelTitle: 'Sunset Sounds',
    duration: 'PT4M5S',
  },
  {
    id: 'lyrics3',
    title: 'David Guetta - Titanium (Lyrics) ft. Sia',
    duration: 'PT4M5S',
  },
  {
    id: 'acoustic',
    title: 'Sia acoustic performance of Titanium',
    duration: 'PT4M5S',
  },
  { id: 'live', title: 'Titanium LIVE David Guetta Sia', duration: 'PT4M5S' },
  {
    id: 'literal',
    title: 'Sia - Bulletproof (2026 Official Music Video)',
    channelTitle: 'sonic rhythm',
    duration: 'PT4M5S',
  },
];
it('preserves lyric-search relevance above a later literal-title upload', () => {
  expect(
    rankAudioSources(rememberedLyricSources, 'sia bulletproof')[0].id,
  ).toBe('official');
  expect(
    rankAudioSources(rememberedLyricSources, 'sia bulletproof')
      .slice(0, 3)
      .map((v) => v.id),
  ).not.toContain('literal');
});

it('prepares Titanium for a remembered Sia lyric without selecting the literal-title upload', async () => {
  const { discover, matching } = setup();
  saveWorkflowState({
    ...createInitialWorkflowState('sia bulletproof'),
    currentStage: 'review',
    reviewFirst: true,
  });
  discover.mockResolvedValue(rememberedLyricSources);
  const titanium = {
    ...track,
    id: 'titanium',
    name: 'Titanium (feat. Sia)',
    artist: 'David Guetta',
  };
  matching.mockImplementation(async (sources) => [
    {
      youtubeVideo: sources[0],
      trackMatches: [titanium],
      selectedMatch: titanium,
      autoAccept: true,
    },
  ]);
  render(Discovery, { stage: 'review' });
  await screen.findByDisplayValue('Titanium (feat. Sia)');
  expect(matching.mock.calls[0][0][0].id).toBe('official');
  expect(loadWorkflowState()!.trackMatches[0].youtubeVideo.id).toBe('official');
});

it('replaces the source thumbnail with the player and decodes the source label', async () => {
  const { discover } = setup();
  discover.mockResolvedValue([
    {
      ...videos[1],
      title: 'Artist &amp; Guest - Song (Official Audio)',
      thumbnail: 'https://example.test/thumbnail.jpg',
    },
  ]);
  render(Discovery, { stage: 'review' });
  await ready();
  expect(screen.getByAltText('Selected YouTube video thumbnail')).toBeVisible();
  expect(
    screen.getByText('Artist & Guest - Song (Official Audio)', {
      selector: '.review-source-summary strong',
    }),
  ).toBeVisible();
  await fireEvent.click(screen.getByRole('button', { name: 'Preview song' }));
  await waitFor(() => expect(player.started).toHaveBeenCalledWith('audio'));
  expect(screen.queryByAltText('Selected YouTube video thumbnail')).toBeNull();
  expect(document.querySelectorAll('.video-frame')).toHaveLength(1);
  await fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
  expect(screen.getByAltText('Selected YouTube video thumbnail')).toBeVisible();
  expect(document.querySelector('.video-frame')).toBeNull();
});

it('opens advanced fields without saving and retains edits across disclosure changes', async () => {
  const { commit } = setup();
  render(Discovery, { stage: 'review' });
  await ready();
  const toggle = screen.getByRole('button', {
    name: 'Artwork, release date & duration',
  });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await fireEvent.input(screen.getByLabelText('Release date'), {
    target: { value: '2020-01-02' },
  });
  await fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Release date' })).toBeNull(),
  );
  await fireEvent.click(toggle);
  expect(screen.getByLabelText('Release date')).toHaveValue('2020-01-02');
  expect(commit).not.toHaveBeenCalled();
  await fireEvent.submit(document.getElementById('song-review-form')!);
  await waitFor(() => expect(commit).toHaveBeenCalledOnce());
  expect(commit.mock.calls[0][0]).toEqual([
    expect.objectContaining({
      edits: expect.objectContaining({ releaseDate: '2020-01-02' }),
    }),
  ]);
});

it('keeps manually edited lyrics when their correction section is closed and reopened', async () => {
  setup();
  render(Discovery, { stage: 'review' });
  await ready();
  const toggle = screen.getByRole('button', {
    name: 'Change lyrics or add your own',
  });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await fireEvent.click(toggle);
  await fireEvent.input(screen.getByLabelText('Lyrics', { exact: true }), {
    target: { value: 'My corrected lyrics' },
  });
  await fireEvent.click(toggle);
  await fireEvent.click(toggle);
  expect(screen.getByLabelText('Lyrics', { exact: true })).toHaveValue(
    'My corrected lyrics',
  );
});

it('uses the preview clock and seeking without seeking the library player', async () => {
  setup();
  setQueue(
    [
      {
        trackId: 'library-song',
        name: 'Library song',
        artistName: 'Artist',
        albumName: 'Album',
        duration: 'PT3M',
        isAvailable: true,
      },
    ],
    0,
  );
  setTime(50);
  render(Discovery, { stage: 'review' });
  await ready();
  await fireEvent.click(screen.getByRole('button', { name: 'Preview song' }));
  const first = await screen.findByRole('button', { name: 'Words' });
  await waitFor(() => expect(first).toHaveAttribute('aria-current', 'true'));
  await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(player.seekTo).toHaveBeenCalledWith(2, true);
  expect(getPlayerState().currentTime).toBe(50);
});

it('keeps multiple review accordions open independently', async () => {
  setup();
  render(Discovery, { stage: 'review' });
  await ready();
  const metadata = screen.getByRole('button', { name: 'Change song info' });
  const audio = screen.getByRole('button', { name: 'Change audio source' });
  await fireEvent.click(metadata);
  await fireEvent.click(audio);
  expect(metadata).toHaveAttribute('aria-expanded', 'true');
  expect(audio).toHaveAttribute('aria-expanded', 'true');
  expect(
    screen.getByRole('textbox', { name: 'Search song info' }),
  ).toBeVisible();
  expect(
    screen.getByRole('textbox', { name: 'Search audio sources' }),
  ).toBeVisible();
});

it('shows saving feedback and confirms success only after the commit completes', async () => {
  const { commit } = setup();
  let finish!: (value: {
    results: { trackId: string; success: boolean }[];
  }) => void;
  commit.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(Discovery, { stage: 'review' });
  await ready();
  expect(
    screen.queryByText('Saved to your library', { selector: 'strong' }),
  ).toBeNull();
  await fireEvent.submit(document.getElementById('song-review-form')!);
  const saving = await screen.findByRole('button', { name: 'Saving…' });
  expect(saving).toBeDisabled();
  expect(saving).toHaveAttribute('aria-busy', 'true');
  expect(commit).toHaveBeenCalledOnce();
  finish({ results: [{ trackId: 'track', success: true }] });
  await screen.findByRole('link', { name: 'Go to your library' });
  expect(
    screen.getByText('Saved to your library', { selector: 'strong' }),
  ).toBeVisible();
});
