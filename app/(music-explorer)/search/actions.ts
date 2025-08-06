"use server";

import { upsertSongInfo } from "@/lib/db/queries/insert";
import { InsertSong } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { SpotifyTrack, YouTubeVideo } from "@/types/explorer";
import amqp from "amqplib";

export async function searchSpotify(query: string) {
  try {
    // Get Spotify access token
    const tokenResponse = await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`,
          ).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
        }),
      },
    );

    if (!tokenResponse.ok) {
      throw new Error("Failed to get Spotify access token");
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Search Spotify API
    const searchResponse = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(
        query,
      )}&type=track,album,artist&limit=20`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!searchResponse.ok) {
      throw new Error("Spotify search failed");
    }

    return searchResponse.json();
  } catch (error) {
    console.error("Error searching Spotify:", error);
    throw error;
  }
}

export async function searchYouTubeVideo(
  trackName: string,
  artistName: string,
) {
  try {
    const query = `${trackName} ${artistName}`;
    const apiKey = env.YOUTUBE_API_KEY;

    if (!apiKey) {
      throw new Error("YouTube API key is not configured");
    }

    // First, search for videos
    const searchResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=${encodeURIComponent(
        query,
      )}&type=video&key=${apiKey}`,
    );

    if (!searchResponse.ok) {
      throw new Error("YouTube search failed");
    }

    const searchData = await searchResponse.json();

    // Extract video IDs for the second request
    const videoIds = searchData.items
      .map((item: any) => item.id.videoId)
      .join(",");

    // Second request to get video details including duration
    const videoDetailsResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds}&key=${apiKey}`,
    );

    if (!videoDetailsResponse.ok) {
      throw new Error("YouTube video details request failed");
    }

    const videoDetailsData = await videoDetailsResponse.json();

    // Combine the data from both requests
    return searchData.items.map((item: any) => {
      const videoDetails = videoDetailsData.items.find(
        (detail: any) => detail.id === item.id.videoId,
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
  song: SpotifyTrack,
  video: YouTubeVideo,
) {
  const releaseDate = song.releaseDate.includes("-")
    ? song.releaseDate
    : `${song.releaseDate}-01-01`;
  const trackInfo: InsertSong = {
    spotifyId: song.id,
    name: song.name,
    albumName: song.album,
    artistName: song.artist,
    duration: video.duration || "00:00",
    youtubeVideoId: video.id,
    releaseDate: releaseDate,
    releaseYear: releaseDate.split("-")[0],
    albumArt: song.albumImageUrl,
    isAvailable: false,
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
