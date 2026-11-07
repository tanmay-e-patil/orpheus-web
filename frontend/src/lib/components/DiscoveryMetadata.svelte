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
  import Artwork from './Artwork.svelte';
  import { clock, duration } from '$lib/music';
  import type { Track, Video, SongEdits } from '$lib/types';
  let {
    track,
    edit,
    selected,
    busy,
    locked,
    notice = '',
    choices = $bindable(false),
    query = $bindable(''),
    candidates = [],
    onedit,
    onsave,
    onsearch,
    onselect,
  }: {
    track?: Track;
    edit?: SongEdits;
    selected?: Video;
    busy: boolean;
    locked: boolean;
    notice?: string;
    choices?: boolean;
    query?: string;
    candidates?: Track[];
    onedit: (key: keyof SongEdits, value: string) => void;
    onsave: (event: SubmitEvent) => void;
    onsearch: () => void;
    onselect: (track: Track) => void;
  } = $props();
</script>

<Card.Root class="review-panel" role="region" aria-labelledby="song-info-title">
  <Card.Header>
    <Card.Title><h2 id="song-info-title">Song info</h2></Card.Title>
    {#if track && !track.id.startsWith('youtube:')}<Card.Action
        ><Badge variant="outline">From Deezer</Badge></Card.Action
      >{/if}
  </Card.Header>
  <Card.Content>
    {#if notice}<Alert.Root role="status" class="mb-4"
        ><Alert.Description>{notice}</Alert.Description></Alert.Root
      >{/if}
    {#if edit}<form id="song-review-form" onsubmit={onsave}>
        <Field.Set disabled={locked} class="gap-0">
          <div class="review-identity">
            <Artwork src={edit.albumArt} />
            <div class="review-title-fields">
              <Field.Field
                ><Field.Label for="review-song-title">Song title</Field.Label
                ><Input
                  id="review-song-title"
                  value={edit.trackName}
                  required
                  oninput={(event) =>
                    onedit('trackName', event.currentTarget.value)}
                /></Field.Field
              ><Field.Field
                ><Field.Label for="review-artist">Artist</Field.Label><Input
                  id="review-artist"
                  value={edit.artistName}
                  required
                  placeholder="Artist name"
                  oninput={(event) =>
                    onedit('artistName', event.currentTarget.value)}
                /></Field.Field
              >
            </div>
          </div>
          <Field.Field
            ><Field.Label for="review-album">Album</Field.Label><Input
              id="review-album"
              value={edit.albumName}
              required
              oninput={(event) =>
                onedit('albumName', event.currentTarget.value)}
            /></Field.Field
          >
          <ReviewAccordion label="Artwork, release date & duration">
            <div class="review-extra-fields">
              <Field.Field
                ><Field.Label for="review-artwork-url">Artwork URL</Field.Label
                ><Input
                  id="review-artwork-url"
                  value={edit.albumArt}
                  oninput={(event) =>
                    onedit('albumArt', event.currentTarget.value)}
                /></Field.Field
              ><Field.Field
                ><Field.Label for="review-release-date"
                  >Release date</Field.Label
                ><Input
                  id="review-release-date"
                  aria-describedby="review-release-date-help"
                  value={edit.releaseDate}
                  placeholder="YYYY-MM-DD"
                  pattern={'[0-9]{4}-[0-9]{2}-[0-9]{2}'}
                  oninput={(event) =>
                    onedit('releaseDate', event.currentTarget.value)}
                /><Field.Description id="review-release-date-help"
                  >Use YYYY-MM-DD, or leave it empty if unknown.</Field.Description
                ></Field.Field
              >
              <p class="small muted">
                Audio duration: {duration(edit.trackDuration)}
              </p>
            </div>
          </ReviewAccordion>
        </Field.Set>
      </form>{:else if busy}<p class="muted">
        Looking up the title, artist, album, and artwork…
      </p>
      <div class="space-y-3" aria-hidden="true">
        <Skeleton class="h-20 w-20" /><Skeleton class="h-8 w-full" /><Skeleton
          class="h-8 w-full"
        />
      </div>{:else}<p class="muted">
        Find an audio source to put your song together.
      </p>{/if}
    {#if selected}<ReviewAccordion bind:open={choices} label="Change song info">
        <form
          class="inline-search"
          onsubmit={(event) => {
            event.preventDefault();
            onsearch();
          }}
        >
          <Input
            aria-label="Search song info"
            bind:value={query}
            required
          /><Button variant="outline" type="submit" disabled={locked}
            >Search</Button
          >
        </form>
        <ScrollArea class="review-options-scroll"
          ><div class="review-options">
            {#each candidates as option (option.id)}<Button
                variant={track?.id === option.id ? 'secondary' : 'outline'}
                class="review-option"
                disabled={locked}
                aria-pressed={track?.id === option.id}
                onclick={() => onselect(option)}
                ><Artwork src={option.albumImageUrl} /><span
                  ><strong>{option.name}</strong><span class="muted"
                    >{option.artist} · {option.album}</span
                  ><small
                    >{option.durationMs
                      ? clock(option.durationMs / 1000)
                      : 'Duration unknown'}{option.matchEvidence?.artistConflict
                      ? ' · Different artist'
                      : ''}{option.matchEvidence?.versionConflict
                      ? ' · Different version'
                      : ''}</small
                  ></span
                >{#if track?.id === option.id}<Check size={17} />{/if}</Button
              >{/each}
          </div></ScrollArea
        >
      </ReviewAccordion>{/if}
  </Card.Content>
</Card.Root>
