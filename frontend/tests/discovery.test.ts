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
  expect(screen.getByDisplayValue('Song a')).toBeDisabled();
  await fireEvent.click(
    screen.getByRole('button', { name: /Retry unsaved songs/ }),
  );
  await screen.findByRole('link', { name: /Go to your library/ });
  expect(commit.mock.calls[1][0]).toEqual([
    expect.objectContaining({ song: expect.objectContaining({ id: 'b' }) }),
  ]);
  expect(loadWorkflowState()).toBeNull();
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
