"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, ArrowLeft, Loader2, Music, Check, X } from "lucide-react";
import { findSpotifyMatches } from "../../actions";
import { SpotifyMatchResult, YouTubeDiscoveryResult } from "@/types/workflow";
import {
  loadWorkflowState,
  saveWorkflowState,
  updateWorkflowStage,
} from "@/lib/workflow-state";
import WorkflowProgress from "../../_components/WorkflowProgress";

export default function SpotifyMatching() {
  const router = useRouter();
  const [matchResults, setMatchResults] = useState<SpotifyMatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVideos, setSelectedVideos] = useState<
    YouTubeDiscoveryResult[]
  >([]);

  useEffect(() => {
    // Load workflow state and selected videos
    const workflowState = loadWorkflowState();
    if (!workflowState) {
      // No workflow state, redirect to beginning
      router.push("/discover");
      return;
    }

    const selected = workflowState.selectedVideos.filter((v) => v.selected);
    setSelectedVideos(selected);

    // Check if we already have Spotify matches
    if (workflowState.spotifyMatches.length > 0) {
      // If selection has changed since matches were generated, recompute
      const selectedIds = new Set(selected.map((v) => v.id));
      const matchedIds = new Set(
        workflowState.spotifyMatches.map((m) => m.youtubeVideo.id)
      );

      const sameSize = selectedIds.size === matchedIds.size;
      const sameMembers =
        sameSize && [...selectedIds].every((id) => matchedIds.has(id));

      if (!sameMembers) {
        if (selected.length > 0) {
          findMatches(selected);
        } else {
          setMatchResults([]);
        }
      } else {
        setMatchResults(workflowState.spotifyMatches);
      }
    } else if (selected.length > 0) {
      // Start finding Spotify matches
      findMatches(selected);
    }
  }, [router]);

  const findMatches = async (videos: YouTubeDiscoveryResult[]) => {
    setLoading(true);
    try {
      const results = await findSpotifyMatches(videos);
      setMatchResults(results);

      // Update workflow state
      const workflowState = loadWorkflowState();
      if (workflowState) {
        workflowState.spotifyMatches = results;
        workflowState.currentStage = "spotify";
        saveWorkflowState(workflowState);
      }
    } catch (error) {
      console.error("Failed to find Spotify matches:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectMatch = (resultIndex: number, matchIndex: number) => {
    const updatedResults = [...matchResults];
    updatedResults[resultIndex].selectedMatch =
      updatedResults[resultIndex].spotifyMatches[matchIndex];
    setMatchResults(updatedResults);

    // Update workflow state
    const workflowState = loadWorkflowState();
    if (workflowState) {
      workflowState.spotifyMatches = updatedResults;
      saveWorkflowState(workflowState);
    }
  };

  const skipMatch = (resultIndex: number) => {
    const updatedResults = [...matchResults];
    updatedResults[resultIndex].selectedMatch = undefined;
    setMatchResults(updatedResults);

    // Update workflow state
    const workflowState = loadWorkflowState();
    if (workflowState) {
      workflowState.spotifyMatches = updatedResults;
      saveWorkflowState(workflowState);
    }
  };

  const proceedToLyrics = () => {
    // Update workflow stage
    const workflowState = loadWorkflowState();
    if (workflowState) {
      updateWorkflowStage(workflowState, "lyrics");
    }
    router.push("/discover/lyrics");
  };

  const goBack = () => {
    const state = loadWorkflowState();
    if (state) {
      updateWorkflowStage(state, "youtube");
    }
    router.push("/discover/youtube");
  };

  const getConfidenceColor = (confidence: string): string => {
    switch (confidence) {
      case "high":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "medium":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "low":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300";
      default:
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
    }
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

  if (selectedVideos.length === 0) {
    return (
      <div className="text-center py-12">
        <Music className="w-16 h-16 mx-auto mb-4 text-gray-400" />
        <h3 className="text-xl font-semibold mb-2">No Videos Selected</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          You need to select some videos from the YouTube discovery stage first.
        </p>
        <Button onClick={() => router.push("/discover/youtube")}>
          Go Back to YouTube Discovery
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WorkflowProgress currentStage="spotify" />

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin mr-3" />
            <div className="text-center">
              <p className="font-medium">Finding Spotify matches...</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Processing {selectedVideos.length} videos
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && matchResults.length > 0 && (
        <>
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Found matches for {matchResults.length} videos •
            {matchResults.filter((r) => r.selectedMatch).length} matched •
            {matchResults.filter((r) => !r.selectedMatch).length} skipped
          </div>

          <div className="space-y-6">
            {matchResults.map((result, resultIndex) => (
              <Card key={result.youtubeVideo.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-2">
                        {result.youtubeVideo.title}
                      </CardTitle>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {result.youtubeVideo.channelTitle} •{" "}
                        {formatDuration(result.youtubeVideo.duration)}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={getConfidenceColor(result.confidence)}>
                        {result.confidence} confidence
                      </Badge>
                      {result.selectedMatch && (
                        <Badge variant="outline">
                          <Check className="w-3 h-3 mr-1" />
                          Selected
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {result.spotifyMatches.length > 0 ? (
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">
                        Potential Spotify matches:
                      </h4>
                      <div className="space-y-2">
                        {result.spotifyMatches
                          .slice(0, 3)
                          .map((match, matchIndex) => (
                            <div
                              key={match.id}
                              className={`p-3 rounded-lg border cursor-pointer transition-all hover:bg-gray-50 dark:hover:bg-gray-800 ${
                                result.selectedMatch?.id === match.id
                                  ? "ring-2 ring-primary bg-blue-50 dark:bg-blue-950"
                                  : ""
                              }`}
                              onClick={() =>
                                selectMatch(resultIndex, matchIndex)
                              }
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-4">
                                  <img
                                    src={match.albumImageUrl}
                                    alt={match.album}
                                    className="w-20 h-20 rounded-lg object-cover shadow-md"
                                  />
                                  <div>
                                    <p className="font-medium">{match.name}</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                      {match.artist} • {match.album}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {match.releaseDate}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Badge variant="secondary">
                                    {match.matchScore}% match
                                  </Badge>
                                  {result.selectedMatch?.id === match.id && (
                                    <Check className="w-4 h-4 text-primary" />
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                      <Separator />
                      <div className="flex justify-between">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => skipMatch(resultIndex)}
                        >
                          <X className="w-4 h-4 mr-2" />
                          Skip (No match)
                        </Button>
                        {result.spotifyMatches.length > 3 && (
                          <Button variant="ghost" size="sm">
                            View {result.spotifyMatches.length - 3} more matches
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Music className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                      <p className="text-gray-600 dark:text-gray-400">
                        No Spotify matches found for this video
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => skipMatch(resultIndex)}
                      >
                        Skip this video
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6">
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to YouTube
        </Button>
        <Button
          onClick={proceedToLyrics}
          disabled={loading || matchResults.length === 0}
        >
          Continue to Lyrics
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
