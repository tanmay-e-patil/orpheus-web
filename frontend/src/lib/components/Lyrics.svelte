<script lang="ts">
  import { notify } from '$lib/notifications';
  import { api } from '$lib/api';
  import { errorMessage } from '$lib/state.svelte';
  import {
    player,
    updateSongLyrics,
    seek,
  } from '$lib/core/player-store.svelte';
  import LyricsDisplay from './LyricsDisplay.svelte';
  import { Button } from '$lib/components/ui/button';
  let { visible = true }: { visible?: boolean } = $props();
  let fetched = $state<{ plainLyrics?: string; syncedLyrics?: string } | null>(
    null,
  );
  let loading = $state(false),
    saving = $state(false);
  const song = $derived(player.song);
  const synced = $derived(fetched?.syncedLyrics || song?.syncedLyrics || '');
  $effect(() => {
    const current = song;
    const controller = new AbortController();
    fetched = null;
    loading = false;
    if (
      current &&
      (!current.lyrics || !current.syncedLyrics) &&
      current.albumName &&
      current.duration
    ) {
      loading = true;
      api
        .lrclibExact(
          {
            trackName: current.name,
            artistName: current.artistName,
            albumName: current.albumName,
            isoDuration: current.duration,
          },
          controller.signal,
        )
        .then((data) => {
          if (!controller.signal.aborted) fetched = data;
        })
        .catch(() => {})
        .finally(() => {
          if (!controller.signal.aborted) loading = false;
        });
    }
    return () => controller.abort();
  });
  async function save() {
    if (!song || !fetched) return;
    saving = true;
    try {
      await api.saveLyrics(
        song.trackId,
        fetched.plainLyrics || '',
        fetched.syncedLyrics || '',
      );
      updateSongLyrics(
        song.trackId,
        fetched.plainLyrics || '',
        fetched.syncedLyrics || '',
      );
      fetched = null;
      notify('Lyrics saved.', 'success');
    } catch (e) {
      notify(errorMessage(e), 'error');
    } finally {
      saving = false;
    }
  }
</script>

<LyricsDisplay
  {visible}
  resetKey={song?.trackId}
  syncedLyrics={synced}
  plainLyrics={song?.lyrics || fetched?.plainLyrics || ''}
  currentTime={player.currentTime}
  emptyMessage={loading
    ? 'Looking for the words…'
    : 'No lyrics for this song yet.'}
  onseek={seek}
>
  {#if fetched && (fetched.plainLyrics || fetched.syncedLyrics)}<div
      class="lyrics-found"
    >
      <span>Found on LRCLIB</span><Button
        variant="outline"
        size="sm"
        disabled={saving}
        onclick={save}>{saving ? 'Saving…' : 'Save lyrics'}</Button
      >
    </div>{/if}
</LyricsDisplay>
