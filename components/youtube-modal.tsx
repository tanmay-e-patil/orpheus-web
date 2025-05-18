"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eye, X } from "lucide-react";
import { SpotifyTrack } from "@/types/explorer";
import { ScrollArea } from "./ui/scroll-area";
import { saveSongAndVideo } from "@/app/(music-explorer)/search/actions";

type YouTubeVideo = {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
  duration: string | null;
  viewCount: string | null;
};

type YouTubeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  videos: YouTubeVideo[];
  selectedTrack: SpotifyTrack;
  trackName: string;
  artistName: string;
};

export function YouTubeModal({
  isOpen,
  onClose,
  videos,
  selectedTrack,
  trackName,
  artistName,
}: YouTubeModalProps) {
  const [selectedVideo, setSelectedVideo] = useState<string | null>(
    videos.length > 0 ? videos[0].id : null
  );

  // Reset selected video when videos change
  useEffect(() => {
    if (videos.length > 0) {
      setSelectedVideo(videos[0].id);
    } else {
      setSelectedVideo(null);
    }
  }, [videos]);

  async function handleLibraryInsert(video: YouTubeVideo): Promise<void> {
    await saveSongAndVideo(selectedTrack, video);
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Music Videos for {trackName}
          </DialogTitle>
          <DialogDescription>By {artistName}</DialogDescription>
          {/* <Button variant="ghost" size="icon" className="absolute right-4 top-4" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button> */}
        </DialogHeader>

        {videos.length === 0 ? (
          <div className="py-8 text-center">
            <p>No videos found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {selectedVideo && (
              <div className="aspect-video w-full">
                <iframe
                  width="100%"
                  height="100%"
                  src={`https://www.youtube.com/embed/${selectedVideo}`}
                  title="YouTube video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4">
              {videos.map((video) => {
                const formattedDuration = formatIsoDuration(video.duration);
                const formattedViews = formatViewCount(video.viewCount);

                return (
                  <div
                    key={video.id}
                    className={`cursor-pointer rounded-md overflow-hidden border ${
                      selectedVideo === video.id
                        ? "border-green-500 ring-2 ring-green-500"
                        : "border-border"
                    }`}
                    onClick={() => setSelectedVideo(video.id)}
                  >
                    <div className="aspect-video relative">
                      <img
                        src={video.thumbnail || "/placeholder.svg"}
                        alt={video.title}
                        className="w-full h-full object-cover"
                      />
                      {formattedDuration && (
                        <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1 py-0.5 rounded">
                          {formattedDuration}
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-sm font-medium line-clamp-2">
                        {video.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {video.channelTitle}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        {formattedViews && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {formattedViews}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Button
              onClick={() =>
                handleLibraryInsert(videos.find((v) => v.id === selectedVideo)!)
              }
            >
              Add to Library
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Helper function to format ISO 8601 duration (PT1H2M3S) to readable format (1:02:03)
function formatIsoDuration(isoDuration: string | null): string | null {
  if (!isoDuration) return null;

  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;

  const hours = match[1] ? Number.parseInt(match[1]) : 0;
  const minutes = match[2] ? Number.parseInt(match[2]) : 0;
  const seconds = match[3] ? Number.parseInt(match[3]) : 0;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  } else {
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
}

// Helper function to format view count
function formatViewCount(viewCount: string | null): string | null {
  if (!viewCount) return null;

  const count = Number.parseInt(viewCount);
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M views`;
  } else if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K views`;
  } else {
    return `${count} views`;
  }
}
