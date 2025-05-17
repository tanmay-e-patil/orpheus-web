"use client";

import { useState } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Grid, List, Youtube } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { searchYouTubeVideo } from "@/app/(music-explorer)/search/actions";
import { YouTubeModal } from "./youtube-modal";
import { InsertSong } from "@/lib/db/schema";
import { SpotifyTrack, YouTubeVideo } from "@/types/explorer";

type SearchResultsProps = {
  type: "tracks" | "albums" | "artists";
  items: any[];
};

export function SearchResults({ type, items }: SearchResultsProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [youtubeModalOpen, setYoutubeModalOpen] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<SpotifyTrack | null>(null);
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeVideo[]>([]);
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const [songInfo, setSongInfo] = useState<InsertSong | null>(null);

  if (items.length === 0) {
    return (
      <p className="text-center text-muted-foreground">No results found</p>
    );
  }

  const handleFindMusicVideo = async (
    trackName: string,
    artistName: string,
    albumName: string,
    albumImageUrl: string,
    releaseDate: string,
    trackId: string
  ) => {
    setIsLoading(trackId);
    try {
      setSelectedTrack({
        name: trackName,
        artist: artistName,
        album: albumName,
        albumImageUrl: albumImageUrl,
        releaseDate: releaseDate,
        id: trackId,
      });
      const videos = await searchYouTubeVideo(trackName, artistName);
      setYoutubeVideos(videos);
      setYoutubeModalOpen(true);
    } catch (error) {
      console.error("Error finding music video:", error);
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) =>
            value && setViewMode(value as "grid" | "list")
          }
        >
          <ToggleGroupItem value="grid" aria-label="Grid view">
            <Grid className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view">
            <List className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => {
            // Get the appropriate image based on the result type
            const images = type === "tracks" ? item.album?.images : item.images;
            const imageUrl =
              images && images.length > 0
                ? images[1]?.url || images[0]?.url
                : "/placeholder.svg?height=300&width=300";

            // Get the appropriate name and details
            const name = item.name;
            const artist =
              type === "tracks"
                ? item.artists.map((a: any) => a.name).join(", ")
                : type === "albums"
                ? item.artists.map((a: any) => a.name).join(", ")
                : null;

            const albumName = type === "tracks" ? item.album.name : null;
            const releaseDate =
              type === "tracks" ? item.album.release_date : null;
            const spotifyUrl = item.external_urls?.spotify;

            return (
              <Card key={item.id} className="overflow-hidden">
                <div className="aspect-square relative">
                  <Image
                    src={imageUrl || "/placeholder.svg"}
                    alt={name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <CardContent className="p-4">
                  <h3 className="font-semibold text-lg truncate">{name}</h3>
                  {artist && (
                    <p className="text-muted-foreground truncate">{artist}</p>
                  )}
                  {type === "tracks" && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {item.album.name}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    {spotifyUrl && (
                      <a
                        href={spotifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-green-600 hover:text-green-700"
                      >
                        Open in Spotify
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {type === "tracks" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() =>
                          handleFindMusicVideo(
                            name,
                            artist,
                            albumName,
                            imageUrl,
                            releaseDate,
                            item.id
                          )
                        }
                        disabled={isLoading === item.id}
                      >
                        {isLoading === item.id ? (
                          "Loading..."
                        ) : (
                          <>
                            <Youtube className="h-3 w-3" />
                            Music Video
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            // Get the appropriate image based on the result type
            const images = type === "tracks" ? item.album?.images : item.images;
            const imageUrl =
              images && images.length > 0
                ? images[images.length - 1]?.url || images[0]?.url
                : "/placeholder.svg?height=64&width=64";

            // Get the appropriate name and details
            const name = item.name;
            const artist =
              type === "tracks"
                ? item.artists.map((a: any) => a.name).join(", ")
                : type === "albums"
                ? item.artists.map((a: any) => a.name).join(", ")
                : null;

            const albumName = type === "tracks" ? item.album.name : null;

            const spotifyUrl = item.external_urls?.spotify;

            // Additional details based on type
            const duration =
              type === "tracks" ? formatDuration(item.duration_ms) : null;
            const releaseDate =
              type === "albums" ? item.release_date : item.album.release_date;
            const popularity = item.popularity
              ? `${item.popularity}% popularity`
              : null;

            return (
              <div
                key={item.id}
                className="flex items-center gap-4 p-3 rounded-md hover:bg-muted/50 transition-colors"
              >
                <div className="relative h-16 w-16 flex-shrink-0">
                  <Image
                    src={imageUrl || "/placeholder.svg"}
                    alt={name}
                    fill
                    className="object-cover rounded-md"
                    unoptimized
                  />
                </div>
                <div className="flex-grow min-w-0">
                  <h3 className="font-medium truncate">{name}</h3>
                  {artist && (
                    <p className="text-sm text-muted-foreground truncate">
                      {artist}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    {type === "tracks" && item.album?.name && (
                      <span className="truncate">{item.album.name}</span>
                    )}
                    {duration && <span>{duration}</span>}
                    {releaseDate && <span>{releaseDate}</span>}
                    {popularity && <span>{popularity}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {type === "tracks" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() =>
                        handleFindMusicVideo(
                          name,
                          artist,
                          albumName,
                          imageUrl,
                          releaseDate,
                          item.id
                        )
                      }
                      disabled={isLoading === item.id}
                    >
                      {isLoading === item.id ? (
                        "Loading..."
                      ) : (
                        <>
                          <Youtube className="h-3 w-3" />
                          <span className="hidden sm:inline">Music Video</span>
                        </>
                      )}
                    </Button>
                  )}
                  {spotifyUrl && (
                    <a
                      href={spotifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 text-green-600 hover:text-green-700"
                    >
                      <ExternalLink className="h-5 w-5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedTrack && (
        <YouTubeModal
          isOpen={youtubeModalOpen}
          onClose={() => setYoutubeModalOpen(false)}
          videos={youtubeVideos}
          selectedTrack={selectedTrack}
          trackName={selectedTrack.name}
          artistName={selectedTrack.artist}
        />
      )}
    </div>
  );
}

// Helper function to format duration from milliseconds to MM:SS
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
