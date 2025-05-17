"use client";

import { useState } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, Grid, List } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type SearchResultsProps = {
  type: "tracks" | "albums" | "artists";
  items: any[];
};

export function SearchResults({ type, items }: SearchResultsProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  if (items.length === 0) {
    return (
      <p className="text-center text-muted-foreground">No results found</p>
    );
  }

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

            const spotifyUrl = item.external_urls?.spotify;

            return (
              <Card key={item.id} className="overflow-hidden">
                <div className="aspect-square relative">
                  <Image
                    src={imageUrl || "/placeholder.svg"}
                    alt={name}
                    fill
                    className="object-cover"
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
                  {spotifyUrl && (
                    <a
                      href={spotifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm mt-2 text-green-600 hover:text-green-700"
                    >
                      Open in Spotify
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
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

            const spotifyUrl = item.external_urls?.spotify;

            // Additional details based on type
            const duration =
              type === "tracks" ? formatDuration(item.duration_ms) : null;
            const releaseDate = type === "albums" ? item.release_date : null;
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
            );
          })}
        </div>
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
