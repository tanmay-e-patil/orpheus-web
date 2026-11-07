import type { Match, Track, Video, SongEdits } from './types';

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
const stem = (word: string) =>
  word.length > 4 ? word.replace(/s$/, '') : word;
const variants = [
  'live',
  'cover',
  'remix',
  'karaoke',
  'instrumental',
  'sped up',
  'slowed',
];

// Provider relevance can resolve remembered lyrics to a different song title.
// Keep it primary; format preferences and token overlap only adjust nearby results.
export function rankAudioSources(videos: Video[], query: string): Video[] {
  const intent = words(query).map(stem);
  const score = (video: Video, searchIndex: number) => {
    const title = words(video.title).join(' ');
    const tokens = words(`${video.title} ${video.channelTitle || ''}`).map(
      stem,
    );
    const overlap =
      intent.filter((word) => tokens.includes(word)).length /
      Math.max(1, intent.length);
    let value = 100 - searchIndex * 8 + overlap * 20;
    if (intent.length && overlap === 0) value -= 100;
    if (/\baudio\b/.test(title)) value += 12;
    if (/\btopic\b/i.test(video.channelTitle || '')) value += 12;
    if (/\bofficial\b/.test(title)) value += 12;
    if (!video.duration) value -= 10;
    for (const variant of variants) {
      const present = ` ${title} `.includes(` ${variant} `);
      const requested = ` ${words(query).join(' ')} `.includes(` ${variant} `);
      if (present !== requested) value -= 60;
    }
    return value;
  };
  return videos
    .map((video, index) => ({ video, score: score(video, index) }))
    .sort((a, b) => b.score - a.score)
    .map(({ video }) => video);
}

export function suggestedTrack(match: Match): Track | undefined {
  return (
    match.selectedMatch ||
    match.trackMatches.find(
      (track) =>
        (track.matchScore || 0) >= 50 &&
        !track.matchEvidence?.titleConflict &&
        !track.matchEvidence?.artistConflict,
    )
  );
}

export function manualTrack(video: Video): Track {
  return {
    id: `youtube:${video.id}`,
    name: video.title,
    artist: '',
    album: 'Unknown',
  };
}

export function trackEdits(track: Track, video: Video): SongEdits {
  return {
    trackName: track.name,
    artistName: track.artist,
    albumName: track.album || 'Unknown',
    albumArt: track.albumImageUrl || '',
    releaseDate: track.releaseDate || '',
    trackDuration: video.duration || '',
    lyrics: '',
    syncedLyrics: '',
  };
}

// YouTube returns escaped labels; also support drafts saved before normalization.
// Decode text only, keeping provider strings out of HTML rendering.
export function videoLabel(value = ''): string {
  const named: Record<string, string> = {
    amp: '&',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
  };
  return value.replace(
    /&(amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/gi,
    (entity, name: string) => {
      if (!name.startsWith('#')) return named[name.toLowerCase()] || entity;
      const code =
        name[1].toLowerCase() === 'x'
          ? parseInt(name.slice(2), 16)
          : Number(name.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : entity;
    },
  );
}
