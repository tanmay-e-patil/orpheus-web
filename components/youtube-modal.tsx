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
// import { X } from "lucide-react";

type YouTubeVideo = {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  publishedAt: string;
};

type YouTubeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  videos: YouTubeVideo[];
  trackName: string;
  artistName: string;
};

export function YouTubeModal({
  isOpen,
  onClose,
  videos,
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Music Videos for {trackName}
          </DialogTitle>
          <DialogDescription>By {artistName}</DialogDescription>
          {/* <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4"
            onClick={onClose}
          >
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {videos.map((video) => (
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
                  </div>
                  <div className="p-2">
                    <p className="text-sm font-medium line-clamp-2">
                      {video.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {video.channelTitle}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
