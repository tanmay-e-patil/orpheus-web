const timeTag = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?]/;

export function parseLRC(raw) {
  if (!raw) return [];
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(timeTag);
    if (!match) continue;
    const minutes = Number(match[1] || 0);
    const seconds = Number(match[2] || 0);
    let ms = 0;
    if (match[3] != null) {
      const frac = match[3];
      const n = Number(frac);
      if (Number.isFinite(n)) {
        if (frac.length === 1) ms = n * 100;
        else if (frac.length === 2) ms = n * 10;
        else ms = n;
      }
    }
    const text = line.replace(timeTag, "").trim();
    if (!text) continue;
    out.push({ timeMs: minutes * 60000 + seconds * 1000 + ms, text });
  }
  out.sort((a, b) => a.timeMs - b.timeMs);
  const deduped = [];
  let last = -1;
  for (const line of out) {
    if (line.timeMs !== last) {
      deduped.push(line);
      last = line.timeMs;
    }
  }
  return deduped;
}

export function findActiveIndex(lines, currentMs) {
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
