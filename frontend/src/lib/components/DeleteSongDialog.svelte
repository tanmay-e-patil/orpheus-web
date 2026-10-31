<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { api } from '$lib/api';
  import { errorMessage, notify } from '$lib/state';
  import { songDeleted } from '$lib/song-deletion';
  import type { Song } from '$lib/types';

  let { song, onclose }: { song: Song | null; onclose: () => void } = $props();
  let busy = $state(false);
  let error = $state('');
  let cancelButton: HTMLButtonElement | null = $state(null);
  $effect(() => {
    song?.trackId;
    error = '';
  });

  async function remove() {
    if (!song || busy) return;
    const trackId = song.trackId;
    busy = true;
    error = '';
    try {
      await api.deleteSong(trackId);
      await songDeleted(trackId);
      onclose();
      notify('Song deleted.');
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root
  open={!!song}
  onOpenChange={(open) => {
    if (!open && !busy) onclose();
  }}
>
  <Dialog.Content
    showCloseButton={!busy}
    onOpenAutoFocus={(event) => {
      event.preventDefault();
      cancelButton?.focus();
    }}
    onEscapeKeydown={(event) => {
      if (busy) event.preventDefault();
    }}
    onInteractOutside={(event) => {
      if (busy) event.preventDefault();
    }}
  >
    <Dialog.Header>
      <Dialog.Title>Delete this song?</Dialog.Title>
      <Dialog.Description>
        “{song?.name}” by {song?.artistName} will be removed from the shared library
        for everyone. Audio and lyrics files will be cleaned up in the background.
        This cannot be undone.
      </Dialog.Description>
    </Dialog.Header>
    {#if error}<p role="alert" class="error-message">{error}</p>{/if}
    <Dialog.Footer>
      <Button
        bind:ref={cancelButton}
        variant="outline"
        disabled={busy}
        onclick={onclose}>Cancel</Button
      >
      <Button variant="destructive" disabled={busy} onclick={remove}
        >{busy ? 'Deleting…' : 'Delete song'}</Button
      >
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
