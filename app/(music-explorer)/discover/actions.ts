"use server";

import { env } from "@/lib/env";
import {
  YouTubeDiscoveryResult,
  TrackMatchResult,
  LyricsSearchResult,
  LyricsOption,
} from "@/types/workflow";
import { MusicTrack, YouTubeVideo } from "@/types/explorer";
import { upsertSongInfo } from "@/lib/db/queries/insert";
import { InsertSong } from "@/lib/db/schema";
import amqp from "amqplib";

function stringSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix = [];
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[str2.length][str1.length];
}

function cleanString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchDeezerTrackDate(trackId: string): Promise<string> {
  try {
    const res = await fetch(`https://api.deezer.com/track/${trackId}`);
    if (!res.ok) return "";
    const data = await res.json();
    return sanitizeDeezerDate(data.release_date);
  } catch {
    return "";
  }
}

function sanitizeDeezerDate(raw: string | null | undefined): string {
  const s = raw?.trim() ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    if (y === 0) return "";
    const month = m >= 1 && m <= 12 ? m : 1;
    const day = d >= 1 && d <= 31 ? d : 1;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (/^\d{4}$/.test(s) && Number(s) > 0) return `${s}-01-01`;
  return "";
}

// YouTube Discovery
export async function discoverYouTubeVideos(
  query: string
): Promise<YouTubeDiscoveryResult[]> {
  try {
    const apiKey = env.YOUTUBE_API_KEY;
    if (!apiKey) {
      throw new Error("YouTube API key is not configured");
    }

    const searchResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=25&q=${encodeURIComponent(
        query
      )}&type=video&key=${apiKey}`
    );

    if (!searchResponse.ok) {
      throw new Error("YouTube search failed");
    }

    const searchData = await searchResponse.json();

    const videoIds = searchData.items
      .map((item: any) => item.id.videoId)
      .join(",");

    const videoDetailsResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds}&key=${apiKey}`
    );

    if (!videoDetailsResponse.ok) {
      throw new Error("YouTube video details request failed");
    }

    const videoDetailsData = await videoDetailsResponse.json();

    const results: YouTubeDiscoveryResult[] = searchData.items.map(
      (item: any) => {
        const videoDetails = videoDetailsData.items.find(
          (detail: any) => detail.id === item.id.videoId
        );

        const title = item.snippet.title.toLowerCase();
        const channel = item.snippet.channelTitle.toLowerCase();

        let musicProbability = 0.5;

        const musicKeywords = [
          "official",
          "audio",
          "lyrics",
          "music",
          "song",
          "album",
          "single",
          "mv",
          "video",
        ];
        const titleWords = title.split(" ");
        const musicWordCount = titleWords.filter((word: string) =>
          musicKeywords.includes(word)
        ).length;
        musicProbability += musicWordCount * 0.1;

        if (
          channel.includes("official") ||
          channel.includes("music") ||
          channel.includes("records")
        ) {
          musicProbability += 0.2;
        }

        const duration = videoDetails?.contentDetails?.duration;
        if (duration) {
          const match = duration.match(/PT(\d+M)?(\d+S)?/);
          if (match) {
            const minutes = match[1] ? parseInt(match[1]) : 0;
            const seconds = match[2] ? parseInt(match[2]) : 0;
            const totalSeconds = minutes * 60 + seconds;

            if (totalSeconds >= 120 && totalSeconds <= 480) {
              musicProbability += 0.15;
            }
          }
        }

        musicProbability = Math.min(1, Math.max(0, musicProbability));
        const confidence = Math.round(musicProbability * 100);

        return {
          id: item.id.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails.medium.url,
          channelTitle: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
          duration: videoDetails?.contentDetails?.duration || null,
          viewCount: videoDetails?.statistics?.viewCount || null,
          confidence,
          musicProbability,
          selected: false,
        };
      }
    );

    return results.sort((a, b) => b.confidence - a.confidence);
  } catch (error) {
    console.error("Error discovering YouTube videos:", error);
    throw error;
  }
}

// Track Matching via Deezer
export async function findTrackMatches(
  youtubeVideos: YouTubeVideo[]
): Promise<TrackMatchResult[]> {
  const matchResults: TrackMatchResult[] = [];

  for (const video of youtubeVideos) {
    try {
      const title = cleanString(video.title);

      const searchQueries = [
        title,
        title.replace(/official|video|audio|lyrics|hd|4k/g, "").trim(),
        title.split("-")[0].trim(),
        title.split("|")[0].trim(),
      ];

      let bestMatches: (MusicTrack & { matchScore: number })[] = [];

      for (const searchQuery of searchQueries) {
        if (!searchQuery) continue;

        const searchResponse = await fetch(
          `https://api.deezer.com/search?q=${encodeURIComponent(searchQuery)}&limit=10`
        );

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();

          const matches = (searchData.data ?? []).map((track: any) => {
            let score = 0;

            const titleSimilarity = stringSimilarity(
              cleanString(video.title),
              cleanString(`${track.title} ${track.artist.name}`)
            );
            score += titleSimilarity * 0.7;

            const artistInTitle = cleanString(video.title).includes(
              cleanString(track.artist.name)
            );
            if (artistInTitle) score += 0.2;

            if (video.duration && track.duration) {
              const videoDurationMs = parseDuration(video.duration) * 1000;
              const trackDurationMs = track.duration * 1000;
              const durationDiff = Math.abs(videoDurationMs - trackDurationMs);
              const durationScore = Math.max(0, 1 - durationDiff / 30000);
              score += durationScore * 0.1;
            }

            return {
              id: String(track.id),
              name: track.title,
              artist: track.artist.name,
              album: track.album.title,
              albumImageUrl: track.album.cover_xl || track.album.cover_big || track.album.cover_medium || track.album.cover || "",
              releaseDate: sanitizeDeezerDate(track.release_date),
              durationMs: track.duration ? track.duration * 1000 : undefined,
              matchScore: Math.round(score * 100),
            };
          });

          const goodMatches = matches.filter((m: any) => m.matchScore > 30);
          bestMatches = [...bestMatches, ...goodMatches];
        }

        await sleep(120);
      }

      const uniqueMatches = bestMatches.reduce((acc, current) => {
        const existing = acc.find((item) => item.id === current.id);
        if (!existing || current.matchScore > existing.matchScore) {
          return acc.filter((item) => item.id !== current.id).concat(current);
        }
        return acc;
      }, [] as typeof bestMatches);

      uniqueMatches.sort((a, b) => b.matchScore - a.matchScore);

      const top5 = uniqueMatches.slice(0, 5);
      for (const match of top5) {
        match.releaseDate = await fetchDeezerTrackDate(match.id);
        await sleep(80);
      }

      let confidence: "high" | "medium" | "low" | "none" = "none";
      if (top5.length > 0) {
        const topScore = top5[0].matchScore;
        if (topScore >= 70) confidence = "high";
        else if (topScore >= 50) confidence = "medium";
        else confidence = "low";
      }

      matchResults.push({
        youtubeVideo: video,
        trackMatches: top5,
        confidence,
        selectedMatch: top5[0] || undefined,
      });
    } catch (error) {
      console.error(`Error matching video ${video.id}:`, error);
      matchResults.push({
        youtubeVideo: video,
        trackMatches: [],
        confidence: "none",
      });
    }
  }

  return matchResults;
}

function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || "0");
  const minutes = parseInt(match[2] || "0");
  const seconds = parseInt(match[3] || "0");

  return hours * 3600 + minutes * 60 + seconds;
}

// Lyrics Search
export async function fetchLyricsOptions(
  track: MusicTrack
): Promise<LyricsSearchResult> {
  const searchResult: LyricsSearchResult = {
    trackId: track.id,
    query: {
      track: track.name,
      artist: track.artist,
      album: track.album,
    },
    options: [],
    status: "none",
  };

  try {
    const searches = [
      {
        track_name: track.name,
        artist_name: track.artist,
        album_name: track.album,
      },
      { track_name: track.name, artist_name: track.artist },
      {
        track_name: cleanString(track.name),
        artist_name: cleanString(track.artist),
      },
    ];

    const allResults: LyricsOption[] = [];

    for (const searchParams of searches) {
      try {
        const queryString = new URLSearchParams(
          Object.entries(searchParams).filter(([_, v]) => v)
        ).toString();

        const response = await fetch(
          `https://lrclib.net/api/search?${queryString}`
        );

        if (response.ok) {
          const results = await response.json();

          const options: LyricsOption[] = results.map((result: any) => ({
            id: result.id,
            trackName: result.trackName || result.name,
            artistName: result.artistName || result.artist,
            albumName: result.albumName || result.album,
            duration: result.duration,
            plainLyrics: result.plainLyrics,
            syncedLyrics: result.syncedLyrics,
            source: "lrclib" as const,
            confidence: calculateMatchConfidence(result, {
              track: track.name,
              artist: track.artist,
              album: track.album,
            }),
            hasSync: Boolean(result.syncedLyrics),
          }));

          allResults.push(...options);
        }
      } catch (error) {
        console.error("LrcLib search error:", error);
      }
    }

    const uniqueResults = allResults.reduce((acc, current) => {
      const existing = acc.find((item) => item.id === current.id);
      if (!existing || current.confidence > existing.confidence) {
        return acc.filter((item) => item.id !== current.id).concat(current);
      }
      return acc;
    }, [] as LyricsOption[]);

    uniqueResults.sort((a, b) => b.confidence - a.confidence);

    searchResult.options = uniqueResults.slice(0, 10);
    searchResult.selectedOption = uniqueResults[0];

    if (uniqueResults.length > 0) {
      const topScore = uniqueResults[0].confidence;
      searchResult.status = topScore >= 60 ? "found" : "partial";
    }
  } catch (error) {
    console.error("Error fetching lyrics options:", error);
  }

  return searchResult;
}

// Save selected song + video to DB and enqueue background job
export async function saveSongAndVideo(
  song: MusicTrack,
  video: YouTubeVideo,
  lyricsSearchResult: LyricsSearchResult
) {
  const releaseDate = song.releaseDate.includes("-")
    ? song.releaseDate
    : `${song.releaseDate}-01-01`;

  let plainLyrics = "";
  let syncedLyrics = "";
  let isLyricsAvailable = false;
  if (lyricsSearchResult?.selectedOption) {
    const opt = lyricsSearchResult.selectedOption;
    plainLyrics = opt.plainLyrics || "";
    syncedLyrics = opt.syncedLyrics || "";
    isLyricsAvailable = !!(plainLyrics || syncedLyrics);
  }

  const trackInfo: InsertSong = {
    trackId: song.id,
    name: song.name,
    albumName: song.album,
    artistName: song.artist,
    duration: video.duration || "00:00",
    youtubeVideoId: video.id,
    releaseDate: releaseDate,
    releaseYear: releaseDate.split("-")[0],
    albumArt: song.albumImageUrl,
    isAvailable: false,
    lyrics: plainLyrics,
    syncedLyrics: syncedLyrics,
    isLyricsAvailable,
  };

  try {
    await upsertSongInfo(trackInfo, video);
  } catch (error) {
    console.error("Error storing in db", error);
    throw error;
  }

  const queue = "job_queue";
  const jobPayload = {
    jobId: song.id,
    action: "process-song-data",
    timestamp: new Date().toISOString(),
  };

  try {
    const connection = await amqp.connect(env.RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue(queue, { durable: true });

    channel.sendToQueue(queue, Buffer.from(JSON.stringify(jobPayload)), {
      persistent: true,
    });

    console.log(" [x] Sent job:", jobPayload);
    await channel.close();
    await connection.close();
  } catch (error) {
    console.error("RabbitMQ Error:", error);
    throw error;
  }
}

// Single-video Deezer search with custom query
export async function searchTrackWithCustomQuery(
  video: YouTubeVideo,
  customQuery: string
): Promise<TrackMatchResult> {
  try {
    const searchResponse = await fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(customQuery)}&limit=10`
    );

    if (!searchResponse.ok) {
      return { youtubeVideo: video, trackMatches: [], confidence: "none" };
    }

    const searchData = await searchResponse.json();
    const matches = (searchData.data ?? []).map((track: any) => {
      let score = 0;
      const titleSimilarity = stringSimilarity(
        cleanString(video.title),
        cleanString(`${track.title} ${track.artist.name}`)
      );
      score += titleSimilarity * 0.7;
      if (cleanString(video.title).includes(cleanString(track.artist.name)))
        score += 0.2;
      if (video.duration && track.duration) {
        const videoDurationMs = parseDuration(video.duration) * 1000;
        const durationDiff = Math.abs(videoDurationMs - track.duration * 1000);
        score += Math.max(0, 1 - durationDiff / 30000) * 0.1;
      }
      return {
        id: String(track.id),
        name: track.title,
        artist: track.artist.name,
        album: track.album.title,
        albumImageUrl:
          track.album.cover_xl ||
          track.album.cover_big ||
          track.album.cover_medium ||
          track.album.cover ||
          "",
        releaseDate: sanitizeDeezerDate(track.release_date),
        durationMs: track.duration ? track.duration * 1000 : undefined,
        matchScore: Math.round(score * 100),
      };
    });

    matches.sort((a: any, b: any) => b.matchScore - a.matchScore);

    const top5 = matches.slice(0, 5);
    for (const match of top5) {
      match.releaseDate = await fetchDeezerTrackDate(match.id);
      await sleep(80);
    }

    let confidence: "high" | "medium" | "low" | "none" = "none";
    if (top5.length > 0) {
      const topScore = top5[0].matchScore;
      if (topScore >= 70) confidence = "high";
      else if (topScore >= 50) confidence = "medium";
      else confidence = "low";
    }

    return {
      youtubeVideo: video,
      trackMatches: top5,
      confidence,
      selectedMatch: top5[0] || undefined,
    };
  } catch (error) {
    console.error("Error in custom track search:", error);
    return { youtubeVideo: video, trackMatches: [], confidence: "none" };
  }
}

// Single-track lyrics search with custom query
export async function searchLyricsWithCustomQuery(
  track: MusicTrack,
  customQuery: string
): Promise<LyricsSearchResult> {
  const searchResult: LyricsSearchResult = {
    trackId: track.id,
    query: { track: track.name, artist: track.artist, album: track.album },
    options: [],
    status: "none",
  };

  try {
    const response = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(customQuery)}`
    );

    if (!response.ok) return searchResult;

    const results = await response.json();
    const options: LyricsOption[] = results.map((result: any) => ({
      id: result.id,
      trackName: result.trackName || result.name,
      artistName: result.artistName || result.artist,
      albumName: result.albumName || result.album,
      duration: result.duration,
      plainLyrics: result.plainLyrics,
      syncedLyrics: result.syncedLyrics,
      source: "lrclib" as const,
      confidence: calculateMatchConfidence(result, {
        track: track.name,
        artist: track.artist,
        album: track.album,
      }),
      hasSync: Boolean(result.syncedLyrics),
    }));

    options.sort((a, b) => b.confidence - a.confidence);
    searchResult.options = options.slice(0, 10);
    searchResult.selectedOption = options[0];
    if (options.length > 0) {
      searchResult.status = options[0].confidence >= 60 ? "found" : "partial";
    }
  } catch (error) {
    console.error("Error in custom lyrics search:", error);
  }

  return searchResult;
}

function calculateMatchConfidence(
  result: any,
  original: { track: string; artist: string; album?: string; duration?: number }
): number {
  let score = 0;

  score +=
    stringSimilarity(result.trackName || result.name || "", original.track) *
    0.4;

  score +=
    stringSimilarity(
      result.artistName || result.artist || "",
      original.artist
    ) * 0.3;

  if (original.album && (result.albumName || result.album)) {
    score +=
      stringSimilarity(result.albumName || result.album || "", original.album) *
      0.15;
  }

  if (original.duration && result.duration) {
    const durationDiff = Math.abs(original.duration - result.duration);
    const durationScore = Math.max(0, 1 - durationDiff / 30);
    score += durationScore * 0.1;
  }

  if (result.syncedLyrics) {
    score += 0.05;
  }

  return Math.round(score * 100);
}
