"use server";

import { env } from "@/lib/env";
import {
  YouTubeDiscoveryResult,
  SpotifyMatchResult,
  LyricsSearchResult,
  LyricsOption,
} from "@/types/workflow";
import { SpotifyTrack, YouTubeVideo } from "@/types/explorer";

// String similarity helper function
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

// Clean string for better matching
function cleanString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

    // Search for videos
    const searchResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=25&q=${encodeURIComponent(
        query
      )}&type=video&key=${apiKey}`
    );

    if (!searchResponse.ok) {
      throw new Error("YouTube search failed");
    }

    const searchData = await searchResponse.json();

    // Extract video IDs for detailed request
    const videoIds = searchData.items
      .map((item: any) => item.id.videoId)
      .join(",");

    // Get video details including duration
    const videoDetailsResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds}&key=${apiKey}`
    );

    if (!videoDetailsResponse.ok) {
      throw new Error("YouTube video details request failed");
    }

    const videoDetailsData = await videoDetailsResponse.json();

    // Combine and process results
    const results: YouTubeDiscoveryResult[] = searchData.items.map(
      (item: any) => {
        const videoDetails = videoDetailsData.items.find(
          (detail: any) => detail.id === item.id.videoId
        );

        const title = item.snippet.title.toLowerCase();
        const channel = item.snippet.channelTitle.toLowerCase();

        // Calculate music probability based on various factors
        let musicProbability = 0.5; // Base score

        // Music-related keywords in title
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

        // Channel indicators
        if (
          channel.includes("official") ||
          channel.includes("music") ||
          channel.includes("records")
        ) {
          musicProbability += 0.2;
        }

        // Duration indicators (music videos are typically 2-8 minutes)
        const duration = videoDetails?.contentDetails?.duration;
        if (duration) {
          const match = duration.match(/PT(\d+M)?(\d+S)?/);
          if (match) {
            const minutes = match[1] ? parseInt(match[1]) : 0;
            const seconds = match[2] ? parseInt(match[2]) : 0;
            const totalSeconds = minutes * 60 + seconds;

            if (totalSeconds >= 120 && totalSeconds <= 480) {
              // 2-8 minutes
              musicProbability += 0.15;
            }
          }
        }

        // Clamp between 0 and 1
        musicProbability = Math.min(1, Math.max(0, musicProbability));

        // Convert music probability to confidence score (0-100)
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

    // Sort by music probability and confidence
    return results.sort((a, b) => b.confidence - a.confidence);
  } catch (error) {
    console.error("Error discovering YouTube videos:", error);
    throw error;
  }
}

// Spotify Matching
export async function findSpotifyMatches(
  youtubeVideos: YouTubeVideo[]
): Promise<SpotifyMatchResult[]> {
  try {
    // Get Spotify access token
    const tokenResponse = await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`
          ).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
        }),
      }
    );

    if (!tokenResponse.ok) {
      throw new Error("Failed to get Spotify access token");
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    const matchResults: SpotifyMatchResult[] = [];

    for (const video of youtubeVideos) {
      try {
        // Extract potential track and artist from video title
        const title = cleanString(video.title);

        // Try different search strategies
        const searchQueries = [
          title, // Full title
          title.replace(/official|video|audio|lyrics|hd|4k/g, "").trim(), // Remove common video terms
          title.split("-")[0].trim(), // Before first dash
          title.split("|")[0].trim(), // Before first pipe
        ];

        let bestMatches: (SpotifyTrack & { matchScore: number })[] = [];

        for (const searchQuery of searchQueries) {
          if (!searchQuery) continue;

          const searchResponse = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(
              searchQuery
            )}&type=track&limit=10`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();

            const matches = searchData.tracks.items.map((track: any) => {
              // Calculate match score
              let score = 0;

              // Title similarity (70% weight)
              const titleSimilarity = stringSimilarity(
                cleanString(video.title),
                cleanString(`${track.name} ${track.artists[0].name}`)
              );
              score += titleSimilarity * 0.7;

              // Artist name in video title (20% weight)
              const artistInTitle = cleanString(video.title).includes(
                cleanString(track.artists[0].name)
              );
              if (artistInTitle) score += 0.2;

              // Duration proximity (10% weight) - if we have both durations
              if (video.duration && track.duration_ms) {
                const videoDurationMs = parseDuration(video.duration) * 1000;
                const durationDiff = Math.abs(
                  videoDurationMs - track.duration_ms
                );
                const durationScore = Math.max(0, 1 - durationDiff / 30000); // 30 second tolerance
                score += durationScore * 0.1;
              }

              return {
                id: track.id,
                name: track.name,
                artist: track.artists[0].name,
                album: track.album.name,
                albumImageUrl: track.album.images[0]?.url || "",
                releaseDate: track.album.release_date,
                matchScore: Math.round(score * 100),
              };
            });

            // Keep only high-scoring matches
            const goodMatches = matches.filter((m: any) => m.matchScore > 30);
            bestMatches = [...bestMatches, ...goodMatches];
          }
        }

        // Remove duplicates and sort by score
        const uniqueMatches = bestMatches.reduce((acc, current) => {
          const existing = acc.find((item) => item.id === current.id);
          if (!existing || current.matchScore > existing.matchScore) {
            return acc.filter((item) => item.id !== current.id).concat(current);
          }
          return acc;
        }, [] as typeof bestMatches);

        uniqueMatches.sort((a, b) => b.matchScore - a.matchScore);

        // Determine confidence level
        let confidence: "high" | "medium" | "low" | "none" = "none";
        if (uniqueMatches.length > 0) {
          const topScore = uniqueMatches[0].matchScore;
          if (topScore >= 70) confidence = "high";
          else if (topScore >= 50) confidence = "medium";
          else confidence = "low";
        }

        matchResults.push({
          youtubeVideo: video,
          spotifyMatches: uniqueMatches.slice(0, 5), // Top 5 matches
          confidence,
          selectedMatch: uniqueMatches[0] || undefined,
        });
      } catch (error) {
        console.error(`Error matching video ${video.id}:`, error);
        matchResults.push({
          youtubeVideo: video,
          spotifyMatches: [],
          confidence: "none",
        });
      }
    }

    return matchResults;
  } catch (error) {
    console.error("Error finding Spotify matches:", error);
    throw error;
  }
}

// Helper function to parse YouTube duration format (PT4M33S) to seconds
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
  track: SpotifyTrack
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
    // Multiple search strategies for better results
    const searches = [
      // Exact match
      {
        track_name: track.name,
        artist_name: track.artist,
        album_name: track.album,
      },
      // Without album
      { track_name: track.name, artist_name: track.artist },
      // Fuzzy match (remove special characters)
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

    // Deduplicate by ID and sort by confidence
    const uniqueResults = allResults.reduce((acc, current) => {
      const existing = acc.find((item) => item.id === current.id);
      if (!existing || current.confidence > existing.confidence) {
        return acc.filter((item) => item.id !== current.id).concat(current);
      }
      return acc;
    }, [] as LyricsOption[]);

    uniqueResults.sort((a, b) => b.confidence - a.confidence);

    searchResult.options = uniqueResults.slice(0, 10); // Top 10 options
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

// Calculate match confidence for lyrics
function calculateMatchConfidence(
  result: any,
  original: { track: string; artist: string; album?: string; duration?: number }
): number {
  let score = 0;

  // Track name similarity (40% weight)
  score +=
    stringSimilarity(result.trackName || result.name || "", original.track) *
    0.4;

  // Artist name similarity (30% weight)
  score +=
    stringSimilarity(
      result.artistName || result.artist || "",
      original.artist
    ) * 0.3;

  // Album match (15% weight)
  if (original.album && (result.albumName || result.album)) {
    score +=
      stringSimilarity(result.albumName || result.album || "", original.album) *
      0.15;
  }

  // Duration proximity (10% weight)
  if (original.duration && result.duration) {
    const durationDiff = Math.abs(original.duration - result.duration);
    const durationScore = Math.max(0, 1 - durationDiff / 30); // 30 second tolerance
    score += durationScore * 0.1;
  }

  // Sync availability bonus (5% weight)
  if (result.syncedLyrics) {
    score += 0.05;
  }

  return Math.round(score * 100);
}
