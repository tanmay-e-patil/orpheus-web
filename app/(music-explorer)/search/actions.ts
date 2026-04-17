"use server";

import { upsertSongInfo } from "@/lib/db/queries/insert";
import { InsertSong } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { MusicTrack, YouTubeVideo } from "@/types/explorer";
import { LyricsOption, LyricsSearchResult } from "@/types/workflow";
import amqp from "amqplib";

export async function searchMusic(query: string) {
  try {
    const q = encodeURIComponent(query);
    const [tracksRes, albumsRes, artistsRes] = await Promise.all([
      fetch(`https://api.deezer.com/search?q=${q}&limit=20`),
      fetch(`https://api.deezer.com/search/album?q=${q}&limit=20`),
      fetch(`https://api.deezer.com/search/artist?q=${q}&limit=20`),
    ]);

    const [tracks, albums, artists] = await Promise.all([
      tracksRes.json(),
      albumsRes.json(),
      artistsRes.json(),
    ]);

    return {
      tracks: { items: tracks.data ?? [] },
      albums: { items: albums.data ?? [] },
      artists: { items: artists.data ?? [] },
    };
  } catch (error) {
    console.error("Error searching Deezer:", error);
    throw error;
  }
}

export async function searchYouTubeVideo(
  trackName: string,
  artistName: string
) {
  try {
    const query = `${trackName} ${artistName}`;
    const apiKey = env.YOUTUBE_API_KEY;

    if (!apiKey) {
      throw new Error("YouTube API key is not configured");
    }

    const searchResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=${encodeURIComponent(
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

    return searchData.items.map((item: any) => {
      const videoDetails = videoDetailsData.items.find(
        (detail: any) => detail.id === item.id.videoId
      );

      return {
        id: item.id.videoId,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.medium.url,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        duration: videoDetails?.contentDetails?.duration || null,
        viewCount: videoDetails?.statistics?.viewCount || null,
      };
    });
  } catch (error) {
    console.error("Error searching YouTube:", error);
    throw error;
  }
}

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
