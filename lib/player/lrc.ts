export type LrcLine = { timeMs: number; text: string };

const timeTag = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?]/;

export function parseLRC(raw: string): LrcLine[] {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const out: LrcLine[] = [];
  for (const line of lines) {
    const match = line.match(timeTag);
    if (!match) continue;
    const min = Number(match[1] || 0);
    const sec = Number(match[2] || 0);
    const ms = Number(match[3] || 0);
    const timeMs = min * 60_000 + sec * 1_000 + ms;
    const text = line.replace(timeTag, "").trim();
    if (text.length === 0) continue;
    out.push({ timeMs, text });
  }
  // sort and dedupe by time
  out.sort((a, b) => a.timeMs - b.timeMs);
  const dedup: LrcLine[] = [];
  let lastTime = -1;
  for (const l of out) {
    if (l.timeMs !== lastTime) {
      dedup.push(l);
      lastTime = l.timeMs;
    }
  }
  return dedup;
}

export function findActiveIndex(lines: LrcLine[], currentMs: number): number {
  if (lines.length === 0) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= currentMs) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
