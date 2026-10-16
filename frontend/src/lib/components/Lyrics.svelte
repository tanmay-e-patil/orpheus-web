<script lang="ts">
  import { api } from '$lib/api';
  import { playback, notify, errorMessage } from '$lib/state';
  import { parseLRC, findActiveIndex } from '$lib/core/lrc.js';
  import { updateSongLyrics, seek } from '$lib/core/player-store.js';
  import { Button } from '$lib/components/ui/button';
  let fetched = $state<{ plainLyrics?: string; syncedLyrics?: string } | null>(
    null,
  );
  let loading = $state(false),
    saving = $state(false);
  const song = $derived($playback.song);
  const synced = $derived(fetched?.syncedLyrics || song?.syncedLyrics || '');
  const lines = $derived(parseLRC(synced));
  const active = $derived(findActiveIndex(lines, $playback.currentTime * 1000));
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
      notify('Lyrics saved to your library.');
    } catch (e) {
      notify(errorMessage(e), 'error');
    } finally {
      saving = false;
    }
  }
</script>

<div class="lyrics-content">
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
  {#if lines.length}<div class="synced-lines">
      {#each lines as line, index}<button
          class:active={active === index}
          onclick={() => seek(line.timeMs / 1000)}>{line.text || '♪'}</button
        >{/each}
    </div>
  {:else}<pre class="plain-lyrics">{song?.lyrics ||
        fetched?.plainLyrics ||
        (loading
          ? 'Looking for the words…'
          : 'No lyrics for this song yet.')}</pre>{/if}
</div>
