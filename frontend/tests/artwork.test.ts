import { fireEvent, render } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import Artwork from '../src/lib/components/Artwork.svelte';
import { artworkImage } from '../src/lib/artwork';

const cover =
  'https://cdn-images.dzcdn.net/images/cover/a43e104f2ff2872df2e1bf4207b6b5e6/1000x1000-000000-80-0-0.jpg';

it('offers density-aware thumbnails without changing the stored source', () => {
  const image = artworkImage(cover, 44);
  expect(image.src).toContain('/120x120-');
  expect(image.sizes).toBe('44px');
  expect(image.srcset).toContain('250x250-000000-80-0-0.jpg 250w');
  expect(image.srcset).toContain('1000x1000-000000-80-0-0.jpg 1000w');
  expect(cover).toContain('/1000x1000-');
});

it.each([
  undefined,
  'https://i.scdn.co/image/ab67616d0000b273a81dc97f7119864c7437cb85',
  '/assets/custom-cover.jpg',
  cover.replace('cdn-images.dzcdn.net', 'custom.example'),
])('preserves unsupported artwork sources: %s', (src) => {
  expect(artworkImage(src, 44)).toEqual({
    src,
    srcset: undefined,
    sizes: undefined,
  });
});

it('updates browser sizing hints when Now Playing expands', async () => {
  const { container, rerender } = render(Artwork, {
    src: cover,
    displayWidth: 56,
  });
  const image = container.querySelector('img')!;
  expect(image).toHaveAttribute('sizes', '56px');
  await rerender({ src: cover, displayWidth: 420 });
  expect(image).toHaveAttribute('sizes', '420px');
  expect(image.src).toContain('/500x500-');
});

it('tries the original cover before reporting a failed thumbnail', async () => {
  const onfailed = vi.fn();
  const { container, rerender } = render(Artwork, { src: cover, onfailed });
  const image = container.querySelector('img')!;
  await fireEvent.error(image);
  expect(image).toHaveAttribute('src', cover);
  expect(image).not.toHaveAttribute('srcset');
  expect(onfailed).not.toHaveBeenCalled();
  await fireEvent.error(image);
  expect(onfailed).toHaveBeenCalledOnce();
  expect(container.querySelector('img')).toBeNull();
  await rerender({ src: cover.replace('a43e104f', 'b43e104f'), onfailed });
  expect(container.querySelector('img')?.src).toContain('/120x120-');
});
