<script lang="ts">
  import { Check } from '@lucide/svelte';
  import * as Card from '$lib/components/ui/card';
  import * as Alert from '$lib/components/ui/alert';
  import { Badge } from '$lib/components/ui/badge';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import ReviewAccordion from './ReviewAccordion.svelte';
  import * as Field from '$lib/components/ui/field';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { Textarea } from '$lib/components/ui/textarea';
  import type { SongEdits, LyricsResult, LyricsOption } from '$lib/types';
  let {
    edit,
    result,
    busy,
    lyricsBusy,
    locked,
    notice = '',
    choices = $bindable(false),
    query = $bindable(''),
    onedit,
    onsearch,
    onretry,
    onselect,
  }: {
    edit?: SongEdits;
    result?: LyricsResult;
    busy: boolean;
    lyricsBusy: boolean;
    locked: boolean;
    notice?: string;
    choices?: boolean;
    query?: string;
    onedit: (key: keyof SongEdits, value: string) => void;
    onsearch: () => void;
    onretry: () => void;
    onselect: (option?: LyricsOption) => void;
  } = $props();
</script>

<Card.Root class="review-panel" role="region" aria-labelledby="lyrics-title">
  <Card.Header>
    <Card.Title
      ><h2 id="lyrics-title">
        Lyrics <span class="small muted">Optional</span>
      </h2></Card.Title
    >
    {#if edit?.syncedLyrics}<Card.Action
        ><Badge variant="secondary">Synced lyrics</Badge></Card.Action
      >{/if}
  </Card.Header>
  <Card.Content>
    {#if lyricsBusy}<p class="small muted" role="status">Finding lyrics…</p>
      {#if !edit?.lyrics && !edit?.syncedLyrics}<div
          class="space-y-2 mb-4"
          aria-hidden="true"
        >
          <Skeleton class="h-4 w-full" /><Skeleton class="h-4 w-4/5" /><Skeleton
            class="h-4 w-3/5"
          />
        </div>{/if}{/if}
    {#if notice}<Alert.Root role="status" class="mb-4"
        ><Alert.Description>{notice}</Alert.Description></Alert.Root
      >{/if}
    {#if edit?.lyrics || edit?.syncedLyrics}<pre
        class="review-lyrics-excerpt">{(edit.lyrics || edit.syncedLyrics)
          .split('\n')
          .slice(0, 5)
          .join('\n')}</pre>{:else}<p class="muted">
        {busy
          ? 'We’ll look for lyrics once the song is matched.'
          : 'No lyrics selected.'}
      </p>{/if}
    <div class="review-actions">
      <Button
        variant="ghost"
        disabled={locked || lyricsBusy || !edit}
        onclick={() => onretry()}>Retry lyrics lookup</Button
      >
    </div>
    <ReviewAccordion bind:open={choices} label="Change lyrics or add your own">
      <form
        class="inline-search"
        onsubmit={(event) => {
          event.preventDefault();
          onsearch();
        }}
      >
        <Input aria-label="Search lyrics" bind:value={query} required /><Button
          variant="outline"
          type="submit"
          disabled={locked || lyricsBusy || !edit}>Search</Button
        >
      </form>
      <ScrollArea class="review-options-scroll"
        ><div class="review-options">
          {#each result?.options || [] as option (option.id)}<Button
              variant={result?.selectedOption?.id === option.id
                ? 'secondary'
                : 'outline'}
              class="review-option"
              disabled={locked}
              aria-pressed={result?.selectedOption?.id === option.id}
              onclick={() => onselect(option)}
              ><span
                ><strong>{option.trackName} · {option.artistName}</strong><span
                  class="muted"
                  >{option.albumName} · {option.syncedLyrics
                    ? 'Synced lyrics'
                    : 'Plain lyrics'}</span
                ><small
                  >{(option.plainLyrics || option.syncedLyrics || '')
                    .split('\n')
                    .slice(0, 2)
                    .join(' / ')}</small
                ></span
              >{#if result?.selectedOption?.id === option.id}<Check
                  size={17}
                />{/if}</Button
            >{/each}
        </div></ScrollArea
      >
      {#if edit}<Field.Field
          ><Field.Label for="review-plain-lyrics">Lyrics</Field.Label><Textarea
            id="review-plain-lyrics"
            value={edit.lyrics}
            disabled={locked}
            oninput={(event) => onedit('lyrics', event.currentTarget.value)}
          /></Field.Field
        ><Field.Field
          ><Field.Label for="review-synced-lyrics"
            >Synced lyrics (LRC)</Field.Label
          ><Textarea
            id="review-synced-lyrics"
            value={edit.syncedLyrics}
            disabled={locked}
            oninput={(event) =>
              onedit('syncedLyrics', event.currentTarget.value)}
          /></Field.Field
        >
        <Button variant="ghost" disabled={locked} onclick={() => onselect()}
          >Remove lyrics</Button
        >{/if}
    </ReviewAccordion>
  </Card.Content>
</Card.Root>
