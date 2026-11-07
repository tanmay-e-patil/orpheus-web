<script lang="ts">
  import type { Snippet } from 'svelte';
  import * as Accordion from '$lib/components/ui/accordion';
  let {
    label,
    open = $bindable(false),
    children,
  }: {
    label: string;
    open?: boolean;
    children: Snippet;
  } = $props();
</script>

<Accordion.Root
  type="multiple"
  value={open ? ['correction'] : []}
  onValueChange={(values) => (open = values.includes('correction'))}
  class="review-accordion"
>
  <Accordion.Item value="correction">
    <Accordion.Trigger type="button">{label}</Accordion.Trigger>
    <Accordion.Content>{@render children()}</Accordion.Content>
  </Accordion.Item>
</Accordion.Root>
