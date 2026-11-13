import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import AppToaster from '../src/lib/components/AppToaster.svelte';
import { notify, dismissNotification } from '../src/lib/notifications';

afterEach(() => {
  dismissNotification();
  cleanup();
});

it('delivers notifications created before mount with their semantic tone', async () => {
  notify('Saved before mount', 'success');
  const { getByText } = render(AppToaster);
  await waitFor(() => {
    expect(
      getByText('Saved before mount').closest('[data-sonner-toast]'),
    ).toHaveAttribute('data-type', 'success');
  });
});

it('updates by id and preserves descriptions, actions and dismissal', async () => {
  const action = vi.fn();
  const { getByText, queryByText, getByRole } = render(AppToaster);
  const id = notify('Playback failed', 'error', {
    id: 'playback',
    duration: Infinity,
  });
  await waitFor(() => expect(getByText('Playback failed')).toBeInTheDocument());
  expect(
    notify('Retry playback', 'warning', {
      id,
      duration: Infinity,
      description: 'Check your connection.',
      action: { label: 'Retry', onClick: action },
    }),
  ).toBe(id);
  await waitFor(() => {
    expect(queryByText('Playback failed')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(1);
    expect(getByText('Check your connection.')).toBeInTheDocument();
  });
  await fireEvent.click(getByRole('button', { name: 'Retry' }));
  expect(action).toHaveBeenCalledOnce();
  await waitFor(() =>
    expect(queryByText('Retry playback')).not.toBeInTheDocument(),
  );
  notify('Dismiss me', 'info', { duration: Infinity });
  await waitFor(() => expect(getByText('Dismiss me')).toBeInTheDocument());
  await fireEvent.click(getByRole('button', { name: 'Dismiss notification' }));
  await waitFor(() =>
    expect(queryByText('Dismiss me')).not.toBeInTheDocument(),
  );
});

it('honors duration overrides and programmatic dismissal', async () => {
  const { getByText, queryByText } = render(AppToaster);
  notify('Short message', 'info', { duration: 300 });
  const id = notify('Persistent message', 'error', { duration: Infinity });
  await waitFor(() => {
    expect(getByText('Short message')).toBeInTheDocument();
    expect(getByText('Persistent message')).toBeInTheDocument();
  });
  await waitFor(() =>
    expect(queryByText('Short message')).not.toBeInTheDocument(),
  );
  expect(getByText('Persistent message')).toBeInTheDocument();
  dismissNotification(id);
  await waitFor(() =>
    expect(queryByText('Persistent message')).not.toBeInTheDocument(),
  );
});
