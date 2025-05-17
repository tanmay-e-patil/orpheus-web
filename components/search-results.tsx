import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";

type SearchResultsProps = {
  type: "tracks" | "albums" | "artists";
  items: any[];
};

export function SearchResults({ type, items }: SearchResultsProps) {
  if (items.length === 0) {
    return (
      <p className="text-center text-muted-foreground">No results found</p>
    );
  }

  return (
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
  );
}
