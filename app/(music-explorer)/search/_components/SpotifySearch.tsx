"use client";

import { SearchResults } from "@/components/search-results";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Music, Disc, User } from "lucide-react";
import { useState } from "react";
import { searchSpotify } from "../actions";

export default function SpotifySearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("tracks");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    try {
      const data = await searchSpotify(query);
      setResults(data);
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div>
      <div className="max-w-xl mx-auto mb-8">
        <div className="text-center mb-6 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
          <h3 className="font-semibold mb-2">
            🔥 Try the New Multi-Stage Workflow!
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Discover music through YouTube, enrich with Spotify metadata, add
            lyrics, and build your perfect library.
          </p>
          <Button asChild>
            <a href="/discover">Try New Workflow</a>
          </Button>
        </div>

        <form onSubmit={handleSearch}>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Search for songs, artists, or albums..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Searching..." : "Search"}
            </Button>
          </div>
        </form>
      </div>

      {results && (
        <div className="max-w-5xl mx-auto">
          <Tabs
            defaultValue="tracks"
            value={activeTab}
            onValueChange={setActiveTab}
          >
            <TabsList className="grid w-full grid-cols-3 mb-8">
              <TabsTrigger value="tracks" className="flex items-center gap-2">
                <Music className="h-4 w-4" />
                Tracks ({results.tracks?.items.length || 0})
              </TabsTrigger>
              <TabsTrigger value="albums" className="flex items-center gap-2">
                <Disc className="h-4 w-4" />
                Albums ({results.albums?.items.length || 0})
              </TabsTrigger>
              <TabsTrigger value="artists" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Artists ({results.artists?.items.length || 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tracks">
              <SearchResults
                type="tracks"
                items={results.tracks?.items || []}
              />
            </TabsContent>

            <TabsContent value="albums">
              <SearchResults
                type="albums"
                items={results.albums?.items || []}
              />
            </TabsContent>

            <TabsContent value="artists">
              <SearchResults
                type="artists"
                items={results.artists?.items || []}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
