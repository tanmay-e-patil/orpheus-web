<script lang="ts">
  import { Check, Play, Search, Music2 } from '@lucide/svelte';
  import * as Card from '$lib/components/ui/card';
  import * as Alert from '$lib/components/ui/alert';
  import { Badge } from '$lib/components/ui/badge';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import ReviewAccordion from './ReviewAccordion.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import VideoFrame from './VideoFrame.svelte';
  import { duration } from '$lib/music';
  import { videoLabel } from '$lib/discovery';
  import type { Video } from '$lib/types';
  let {
    selected,
    videos,
    locked,
    notice = '',
    syncedLyrics = '',
    plainLyrics = '',
    query = $bindable(''),
    choices = $bindable(false),
    previewing = $bindable(false),
    container = $bindable(),
    onsearch,
    onselect,
    onshift,
    onpreview,
  }: {
    selected?: Video;
    videos: Video[];
    locked: boolean;
    notice?: string;
    syncedLyrics?: string;
    plainLyrics?: string;
    query?: string;
    choices?: boolean;
    previewing?: boolean;
    container?: HTMLElement;
    onsearch: () => void;
    onselect: (video: Video) => void;
    onshift: (offset: number) => void;
    onpreview: () => void;
  } = $props();
</script>

<Card.Root
  class="review-panel review-audio"
  role="complementary"
  aria-labelledby="audio-title"
>
  <Card.Header>
    <Card.Title><h2 id="audio-title">Song preview</h2></Card.Title>
    <Card.Action><Badge variant="outline">YouTube</Badge></Card.Action>
  </Card.Header>
  <Card.Content>
    {#if notice}<Alert.Root role="status" class="mb-4"
        ><Alert.Description>{notice}</Alert.Description></Alert.Root
      >{/if}
    {#if selected}<div class="review-source-summary">
        {#if !previewing}{#if selected.thumbnail}<img
              src={selected.thumbnail}
              alt="Selected YouTube video thumbnail"
            />{:else}<Music2 size={30} />{/if}{/if}<strong
          >{videoLabel(selected.title)}</strong
        >
        <p class="small muted">
          {videoLabel(selected.channelTitle)} · {duration(selected.duration)}
        </p>
      </div>
      {#if !previewing}<div class="review-actions">
          <Button variant="outline" onclick={onpreview}
            ><Play size={15} />Preview song</Button
          >
        </div>{/if}
      <div bind:this={container}>
        {#if previewing}<div class="review-preview">
            {#key selected.id}<VideoFrame
                id={selected.id}
                lyrics={syncedLyrics}
                {plainLyrics}
              />{/key}
            {#if syncedLyrics}<p class="small muted">
                Play the video. Select a lyric line to jump there. If every line
                is early or late, shift the timing below.
              </p>
              <Tooltip.Provider
                ><div class="review-actions">
                  {#each [{ offset: -0.5, label: 'Earlier 0.5 s', description: 'Show every lyric half a second earlier.' }, { offset: 0.5, label: 'Later 0.5 s', description: 'Show every lyric half a second later.' }] as shift}
                    <Tooltip.Root>
                      <Tooltip.Trigger>
                        {#snippet child({ props })}
                          <Button
                            {...props}
                            type="button"
                            variant="outline"
                            disabled={locked}
                            onclick={() => onshift(shift.offset)}
                            >{shift.label}</Button
                          >
                        {/snippet}
                      </Tooltip.Trigger>
                      <Tooltip.Content>{shift.description}</Tooltip.Content>
                    </Tooltip.Root>
                  {/each}
                </div></Tooltip.Provider
              >{/if}
            <Button
              variant="ghost"
              onclick={() => {
                previewing = false;
              }}>Close preview</Button
            >
          </div>{/if}
      </div>{:else if locked}<Skeleton
        class="aspect-video w-full"
        aria-hidden="true"
      />{/if}
    <ReviewAccordion
      bind:open={choices}
      label={selected ? 'Change audio source' : 'Find an audio source'}
    >
      <form
        class="inline-search"
        onsubmit={(event) => {
          event.preventDefault();
          onsearch();
        }}
      >
        <Input
          aria-label="Search audio sources"
          bind:value={query}
          required
        /><Button variant="outline" type="submit" disabled={locked}
          ><Search size={15} />Search</Button
        >
      </form>
      <ScrollArea class="review-options-scroll"
        ><div class="review-options">
          {#each videos as video (video.id)}<div class="review-source-option">
              <Button
                variant={video.selected ? 'secondary' : 'outline'}
                class="review-option"
                disabled={locked}
                aria-pressed={video.selected || false}
                onclick={() => onselect(video)}
                ><span
                  ><strong>{videoLabel(video.title)}</strong><span class="muted"
                    >{videoLabel(video.channelTitle)} · {duration(
                      video.duration,
                    )}</span
                  ></span
                >{#if video.selected}<Check size={17} />{/if}</Button
              >
            </div>{/each}
        </div></ScrollArea
      >
    </ReviewAccordion>
  </Card.Content>
</Card.Root>
