export function centerLyric(
  container: HTMLElement,
  index: number,
  behavior: ScrollBehavior,
) {
  const line = container.querySelector<HTMLElement>(
    `[data-lyric-index="${index}"]`,
  );
  if (!line || !container.clientHeight) return;
  const top =
    container.scrollTop +
    line.getBoundingClientRect().top -
    container.getBoundingClientRect().top -
    (container.clientHeight - line.getBoundingClientRect().height) / 2;
  container.scrollTo({ top: Math.max(0, top), behavior });
}
