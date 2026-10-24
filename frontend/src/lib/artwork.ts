// Only resize the known Deezer CDN format. Other providers and custom URLs
// retain their original source, as do the full-resolution URLs stored in songs.
const deezerCover =
  /^(https:\/\/cdn-images\.dzcdn\.net\/images\/cover\/[a-f\d]{32}\/)\d+x\d+(-[^/?]+\.jpg)(\?[^#]*)?$/i;
const widths = [120, 250, 500, 1000] as const;

export function artworkImage(src: string | undefined, displayWidth: number) {
  const match = src?.match(deezerCover);
  if (!match) return { src, srcset: undefined, sizes: undefined };

  const width = Math.max(1, Math.ceil(displayWidth));
  const url = (pixels: number) =>
    `${match[1]}${pixels}x${pixels}${match[2]}${match[3] || ''}`;
  const fallbackWidth = widths.find((pixels) => pixels >= width) || 1000;
  return {
    src: url(fallbackWidth),
    srcset: widths.map((pixels) => `${url(pixels)} ${pixels}w`).join(', '),
    sizes: `${width}px`,
  };
}
