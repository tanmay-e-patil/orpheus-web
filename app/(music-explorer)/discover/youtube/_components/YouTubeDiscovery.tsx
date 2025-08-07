"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Play,
  Clock,
  Eye,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Check,
} from "lucide-react";
import { discoverYouTubeVideos } from "../../actions";
import { YouTubeDiscoveryResult } from "@/types/workflow";
import {
  loadWorkflowState,
  saveWorkflowState,
  createInitialWorkflowState,
  updateWorkflowStage,
} from "@/lib/workflow-state";
import WorkflowProgress from "../../_components/WorkflowProgress";

export default function YouTubeDiscovery() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [videos, setVideos] = useState<YouTubeDiscoveryResult[]>([]);
  const [selectedVideos, setSelectedVideos] = useState<
    YouTubeDiscoveryResult[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [playingVideo, setPlayingVideo] =
    useState<YouTubeDiscoveryResult | null>(null);

  useEffect(() => {
    // Load existing workflow state
    const existingState = loadWorkflowState();
    if (existingState && existingState.currentStage === "youtube") {
      setSearchQuery(existingState.searchQuery);
      setVideos(existingState.selectedVideos);
      setSelectedVideos(existingState.selectedVideos.filter((v) => v.selected));
      setHasSearched(true);
    } else if (initialQuery) {
      // Auto-search if we have a query parameter
      handleSearch(initialQuery);
    }
  }, [initialQuery]);

  const handleSearch = async (query: string = searchQuery) => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const results = await discoverYouTubeVideos(query);
      setVideos(results);
      setHasSearched(true);

      // Create or update workflow state
      let workflowState = loadWorkflowState();
      if (!workflowState) {
        workflowState = createInitialWorkflowState(query);
      }

      workflowState.selectedVideos = results;
      workflowState.currentStage = "youtube";
      workflowState.searchQuery = query;

      saveWorkflowState(workflowState);
    } catch (error) {
      console.error("Search failed:", error);
      // Handle error - could show toast notification
    } finally {
      setLoading(false);
    }
  };

  const toggleVideoSelection = (video: YouTubeDiscoveryResult) => {
    const updatedVideos = videos.map((v) =>
      v.id === video.id ? { ...v, selected: !v.selected } : v
    );
    setVideos(updatedVideos);

    const newSelectedVideos = updatedVideos.filter((v) => v.selected);
    setSelectedVideos(newSelectedVideos);

    // Update workflow state
    const workflowState = loadWorkflowState();
    if (workflowState) {
      workflowState.selectedVideos = updatedVideos;
      saveWorkflowState(workflowState);
    }
  };

  const selectAll = () => {
    const updatedVideos = videos.map((v) => ({ ...v, selected: true }));
    setVideos(updatedVideos);
    setSelectedVideos(updatedVideos);

    // Update workflow state
    const workflowState = loadWorkflowState();
    if (workflowState) {
      workflowState.selectedVideos = updatedVideos;
      saveWorkflowState(workflowState);
    }
  };

  const deselectAll = () => {
    const updatedVideos = videos.map((v) => ({ ...v, selected: false }));
    setVideos(updatedVideos);
    setSelectedVideos([]);

    // Update workflow state
    const workflowState = loadWorkflowState();
    if (workflowState) {
      workflowState.selectedVideos = updatedVideos;
      saveWorkflowState(workflowState);
    }
  };

  const proceedToSpotify = () => {
    if (selectedVideos.length === 0) return;

    // Update workflow state
    const workflowState = loadWorkflowState();
    if (workflowState) {
      updateWorkflowStage(workflowState, "spotify");
    }

    router.push("/discover/spotify");
  };

  const playVideo = (video: YouTubeDiscoveryResult, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card selection toggle
    setPlayingVideo(video);
  };

  const closeVideoPlayer = () => {
    setPlayingVideo(null);
  };

  const goBack = () => {
    router.push("/discover");
  };

  const formatDuration = (duration: string | null): string => {
    if (!duration) return "Unknown";

    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return duration;

    const hours = parseInt(match[1] || "0");
    const minutes = parseInt(match[2] || "0");
    const seconds = parseInt(match[3] || "0");

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
    } else {
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }
  };

  const formatViewCount = (viewCount: string | null): string => {
    if (!viewCount) return "Unknown views";

    const count = parseInt(viewCount);
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M views`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K views`;
    } else {
      return `${count} views`;
    }
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 70)
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
    if (confidence >= 50)
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
    return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
  };

  return (
    <div className="space-y-6">
      <WorkflowProgress currentStage="youtube" />

      {/* Search Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex space-x-2">
            <Input
              placeholder="Search for music on YouTube..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1"
            />
            <Button
              onClick={() => handleSearch()}
              disabled={loading || !searchQuery.trim()}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results Section */}
      {hasSearched && (
        <>
          {/* Selection Controls */}
          {videos.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Found {videos.length} videos • {selectedVideos.length} selected
              </div>
              <div className="space-x-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAll}>
                  Deselect All
                </Button>
              </div>
            </div>
          )}

          {/* Videos Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="ml-2">Searching YouTube...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {videos.map((video) => (
                <Card
                  key={video.id}
                  className={`cursor-pointer transition-all hover:shadow-lg ${
                    video.selected ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => toggleVideoSelection(video)}
                >
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      {/* Thumbnail and Selection */}
                      <div className="relative">
                        <img
                          src={video.thumbnail}
                          alt={video.title}
                          className="w-full aspect-video object-cover rounded"
                        />

                        {/* Play Button Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity rounded">
                          <Button
                            size="sm"
                            className="bg-red-600 hover:bg-red-700 text-white rounded-full p-2"
                            onClick={(e) => playVideo(video, e)}
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="absolute top-2 left-2">
                          <div
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                              video.selected
                                ? "bg-blue-600 border-blue-600"
                                : "border-gray-300 bg-white"
                            }`}
                          >
                            {video.selected && (
                              <Check className="w-3 h-3 text-white" />
                            )}
                          </div>
                        </div>
                        <div className="absolute top-2 right-2">
                          <Badge
                            className={getConfidenceColor(video.confidence)}
                          >
                            {video.confidence}% match
                          </Badge>
                        </div>
                        <div className="absolute bottom-2 right-2 bg-black/70 text-white px-1 py-0.5 rounded text-xs">
                          {formatDuration(video.duration)}
                        </div>
                      </div>

                      {/* Video Info */}
                      <div className="space-y-2">
                        <h3 className="font-medium line-clamp-2 text-sm leading-tight">
                          {video.title}
                        </h3>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {video.channelTitle}
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <div className="flex items-center space-x-1">
                            <Eye className="w-3 h-3" />
                            <span>{formatViewCount(video.viewCount)}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>{formatDuration(video.duration)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {videos.length === 0 && !loading && (
            <div className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400">
                No videos found. Try a different search query.
              </p>
            </div>
          )}
        </>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6">
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Search
        </Button>
        <Button
          onClick={proceedToSpotify}
          disabled={selectedVideos.length === 0}
        >
          Continue to Spotify Matching
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {/* Video Player Modal */}
      <Dialog open={playingVideo !== null} onOpenChange={closeVideoPlayer}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-lg">{playingVideo?.title}</DialogTitle>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {playingVideo?.channelTitle}
            </div>
          </DialogHeader>

          {playingVideo && (
            <div className="space-y-4">
              {/* YouTube Embed */}
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <iframe
                  src={`https://www.youtube.com/embed/${playingVideo.id}?autoplay=1&rel=0&modestbranding=1`}
                  title={playingVideo.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                />
              </div>

              {/* Video Info */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-4">
                  <Badge
                    className={getConfidenceColor(playingVideo.confidence)}
                  >
                    {playingVideo.confidence}% match
                  </Badge>
                  <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                    <Clock className="w-4 h-4" />
                    <span>{formatDuration(playingVideo.duration)}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                    <Eye className="w-4 h-4" />
                    <span>{formatViewCount(playingVideo.viewCount)}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Button
                    size="sm"
                    variant={playingVideo.selected ? "default" : "outline"}
                    onClick={() => {
                      toggleVideoSelection(playingVideo);
                      closeVideoPlayer();
                    }}
                  >
                    {playingVideo.selected ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Selected
                      </>
                    ) : (
                      "Select Video"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
