"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  Music,
  FileText,
  Check,
  X,
  Clock,
  Search,
} from "lucide-react";
import { fetchLyricsOptions, searchLyricsWithCustomQuery } from "../../actions";
import { LyricsSearchResult, TrackMatchResult } from "@/types/workflow";
import SyncLyricsTest from "./SyncLyricsTest";
import {
  loadWorkflowState,
  saveWorkflowState,
  updateWorkflowStage,
} from "@/lib/workflow-state";
import WorkflowProgress from "../../_components/WorkflowProgress";

export default function LyricsEnrichment() {
  const router = useRouter();
  const [lyricsResults, setLyricsResults] = useState<LyricsSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [matchedTracks, setMatchedTracks] = useState<TrackMatchResult[]>([]);
  const [customQueryOpen, setCustomQueryOpen] = useState<Record<number, boolean>>({});
  const [customQueryInputs, setCustomQueryInputs] = useState<Record<number, string>>({});
  const [customQueryLoading, setCustomQueryLoading] = useState<Record<number, boolean>>({});
  // key: `${resultIndex}-${optionId}` → open
  const [syncTestOpen, setSyncTestOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Load workflow state
    const workflowState = loadWorkflowState();
    if (!workflowState) {
      router.push("/discover");
      return;
    }

    // Get tracks that have Spotify matches
    const matched = workflowState.trackMatches.filter(
      (result) => result.selectedMatch
    );
    setMatchedTracks(matched);

    // Check if we already have lyrics results
    if (workflowState.lyricsSearchResults.length > 0) {
      setLyricsResults(workflowState.lyricsSearchResults);
    } else if (matched.length > 0) {
      // Start fetching lyrics
      fetchAllLyrics(matched);
    }
  }, [router]);

  const fetchAllLyrics = async (tracks: TrackMatchResult[]) => {
    setLoading(true);
    const results: LyricsSearchResult[] = [];

    try {
      for (const matchResult of tracks) {
        if (matchResult.selectedMatch) {
          const lyricsResult = await fetchLyricsOptions(
            matchResult.selectedMatch
          );
          results.push(lyricsResult);
        }
      }

      setLyricsResults(results);

      // Update workflow state
      const workflowState = loadWorkflowState();
      if (workflowState) {
        workflowState.lyricsSearchResults = results;
        workflowState.currentStage = "lyrics";
        saveWorkflowState(workflowState);
      }
    } catch (error) {
      console.error("Failed to fetch lyrics:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectLyricsOption = (resultIndex: number, optionIndex: number) => {
    const updatedResults = [...lyricsResults];
    updatedResults[resultIndex].selectedOption =
      updatedResults[resultIndex].options[optionIndex];
    setLyricsResults(updatedResults);

    // Update workflow state
    const workflowState = loadWorkflowState();
    if (workflowState) {
      workflowState.lyricsSearchResults = updatedResults;
      saveWorkflowState(workflowState);
    }
  };

  const skipLyrics = (resultIndex: number) => {
    const updatedResults = [...lyricsResults];
    updatedResults[resultIndex].selectedOption = undefined;
    setLyricsResults(updatedResults);

    // Update workflow state
    const workflowState = loadWorkflowState();
    if (workflowState) {
      workflowState.lyricsSearchResults = updatedResults;
      saveWorkflowState(workflowState);
    }
  };

  const runCustomLyricsSearch = async (resultIndex: number) => {
    const query = customQueryInputs[resultIndex]?.trim();
    if (!query) return;

    const track = matchedTracks.find(
      (t) => t.selectedMatch?.id === lyricsResults[resultIndex].trackId
    )?.selectedMatch;
    if (!track) return;

    setCustomQueryLoading((prev) => ({ ...prev, [resultIndex]: true }));
    try {
      const result = await searchLyricsWithCustomQuery(track, query);
      const updatedResults = [...lyricsResults];
      updatedResults[resultIndex] = result;
      setLyricsResults(updatedResults);
      setCustomQueryOpen((prev) => ({ ...prev, [resultIndex]: false }));

      const workflowState = loadWorkflowState();
      if (workflowState) {
        workflowState.lyricsSearchResults = updatedResults;
        saveWorkflowState(workflowState);
      }
    } catch (error) {
      console.error("Custom lyrics search failed:", error);
    } finally {
      setCustomQueryLoading((prev) => ({ ...prev, [resultIndex]: false }));
    }
  };

  const proceedToReview = () => {
    // Update workflow stage
    const workflowState = loadWorkflowState();
    if (workflowState) {
      updateWorkflowStage(workflowState, "review");
    }
    router.push("/discover/review");
  };

  const goBack = () => {
    router.push("/discover/spotify");
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 70)
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
    if (confidence >= 50)
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
    return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
  };

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  if (matchedTracks.length === 0) {
    return (
      <div className="text-center py-12">
        <Music className="w-16 h-16 mx-auto mb-4 text-gray-400" />
        <h3 className="text-xl font-semibold mb-2">No Matched Tracks</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          You need to have some matched tracks first to fetch lyrics.
        </p>
        <Button onClick={() => router.push("/discover/spotify")}>
          Go Back to Track Matching
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WorkflowProgress currentStage="lyrics" />

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin mr-3" />
            <div className="text-center">
              <p className="font-medium">Searching for lyrics...</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Processing {matchedTracks.length} tracks
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && lyricsResults.length > 0 && (
        <>
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Searched lyrics for {lyricsResults.length} tracks •
            {lyricsResults.filter((r) => r.selectedOption).length} with lyrics •
            {lyricsResults.filter((r) => !r.selectedOption).length} skipped
          </div>

          <div className="space-y-6">
            {lyricsResults.map((result, resultIndex) => {
              const matchedTrack = matchedTracks.find(
                (track) => track.selectedMatch?.id === result.trackId
              );

              return (
                <Card key={result.trackId}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg mb-2">
                          {result.query.track} - {result.query.artist}
                        </CardTitle>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {result.query.album}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge
                          variant={
                            result.status === "found"
                              ? "default"
                              : result.status === "partial"
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {result.status}
                        </Badge>
                        {result.selectedOption && (
                          <Badge variant="outline">
                            <Check className="w-3 h-3 mr-1" />
                            Selected
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {result.options.length > 0 ? (
                      <div className="space-y-4">
                        <h4 className="font-medium text-sm">
                          Available lyrics options:
                        </h4>
                        <div className="space-y-3">
                          {result.options
                            .slice(0, 3)
                            .map((option, optionIndex) => (
                              <div
                                key={option.id}
                                className={`p-4 rounded-lg border cursor-pointer transition-all hover:bg-gray-50 dark:hover:bg-gray-800 ${
                                  result.selectedOption?.id === option.id
                                    ? "ring-2 ring-primary bg-blue-50 dark:bg-blue-950"
                                    : ""
                                }`}
                                onClick={() =>
                                  selectLyricsOption(resultIndex, optionIndex)
                                }
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2 mb-2">
                                      <p className="font-medium">
                                        {option.trackName}
                                      </p>
                                      {option.hasSync && (
                                        <Badge
                                          variant="secondary"
                                          className="text-xs"
                                        >
                                          <Clock className="w-3 h-3 mr-1" />
                                          Synced
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                                      {option.artistName}
                                      {option.albumName &&
                                        ` • ${option.albumName}`}
                                      {option.duration &&
                                        ` • ${formatDuration(option.duration)}`}
                                    </p>

                                    {/* Lyrics preview */}
                                    {option.plainLyrics && (
                                      <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm">
                                        <div className="line-clamp-3">
                                          {option.plainLyrics
                                            .split("\n")
                                            .slice(0, 3)
                                            .join("\n")}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex items-center space-x-2 ml-4">
                                    <Badge
                                      className={getConfidenceColor(
                                        option.confidence
                                      )}
                                    >
                                      {option.confidence}%
                                    </Badge>
                                    {result.selectedOption?.id ===
                                      option.id && (
                                      <Check className="w-4 h-4 text-primary" />
                                    )}
                                  </div>
                                </div>

                                {/* Show synced lyrics preview if selected */}
                                {result.selectedOption?.id === option.id &&
                                  option.syncedLyrics && (
                                    <Tabs defaultValue="plain" className="mt-4">
                                      <TabsList className="grid w-full grid-cols-2">
                                        <TabsTrigger value="plain">
                                          Plain Lyrics
                                        </TabsTrigger>
                                        <TabsTrigger value="synced">
                                          Synced (LRC)
                                        </TabsTrigger>
                                      </TabsList>
                                      <TabsContent
                                        value="plain"
                                        className="mt-3"
                                      >
                                        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm max-h-48 overflow-y-auto">
                                          <pre className="whitespace-pre-wrap">
                                            {option.plainLyrics ||
                                              "No plain lyrics available"}
                                          </pre>
                                        </div>
                                      </TabsContent>
                                      <TabsContent
                                        value="synced"
                                        className="mt-3"
                                      >
                                        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm max-h-48 overflow-y-auto">
                                          <pre className="whitespace-pre-wrap font-mono text-xs">
                                            {option.syncedLyrics}
                                          </pre>
                                        </div>
                                      </TabsContent>
                                    </Tabs>
                                  )}

                                {/* Test sync button */}
                                {option.hasSync &&
                                  option.syncedLyrics &&
                                  matchedTrack?.youtubeVideo?.id && (
                                    <div
                                      className="mt-3"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {syncTestOpen[
                                        `${resultIndex}-${option.id}`
                                      ] ? (
                                        <SyncLyricsTest
                                          syncedLyrics={option.syncedLyrics}
                                          youtubeVideoId={
                                            matchedTrack.youtubeVideo.id
                                          }
                                          onClose={() =>
                                            setSyncTestOpen((prev) => ({
                                              ...prev,
                                              [`${resultIndex}-${option.id}`]: false,
                                            }))
                                          }
                                        />
                                      ) : (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() =>
                                            setSyncTestOpen((prev) => ({
                                              ...prev,
                                              [`${resultIndex}-${option.id}`]: true,
                                            }))
                                          }
                                        >
                                          <Clock className="w-3 h-3 mr-1" />
                                          Test Sync
                                        </Button>
                                      )}
                                    </div>
                                  )}
                              </div>
                            ))}
                        </div>

                        <Separator />

                        <div className="flex justify-between">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => skipLyrics(resultIndex)}
                          >
                            <X className="w-4 h-4 mr-2" />
                            No Lyrics
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setCustomQueryOpen((prev) => ({
                                ...prev,
                                [resultIndex]: !prev[resultIndex],
                              }))
                            }
                          >
                            <Search className="w-4 h-4 mr-1" />
                            Try different search
                          </Button>
                        </div>
                        {customQueryOpen[resultIndex] && (
                          <div className="flex items-center gap-2 mt-2">
                            <Input
                              placeholder="Custom lyrics search query..."
                              value={customQueryInputs[resultIndex] ?? ""}
                              onChange={(e) =>
                                setCustomQueryInputs((prev) => ({
                                  ...prev,
                                  [resultIndex]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  runCustomLyricsSearch(resultIndex);
                              }}
                            />
                            <Button
                              size="sm"
                              disabled={customQueryLoading[resultIndex]}
                              onClick={() => runCustomLyricsSearch(resultIndex)}
                            >
                              {customQueryLoading[resultIndex] ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Search className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="text-center py-6">
                          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                          <p className="text-gray-600 dark:text-gray-400">
                            No lyrics found for this track
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => skipLyrics(resultIndex)}
                          >
                            Continue without lyrics
                          </Button>
                        </div>
                        <Separator />
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="self-start"
                            onClick={() =>
                              setCustomQueryOpen((prev) => ({
                                ...prev,
                                [resultIndex]: !prev[resultIndex],
                              }))
                            }
                          >
                            <Search className="w-4 h-4 mr-1" />
                            Try different search
                          </Button>
                          {customQueryOpen[resultIndex] && (
                            <div className="flex items-center gap-2">
                              <Input
                                placeholder="Custom lyrics search query..."
                                value={customQueryInputs[resultIndex] ?? ""}
                                onChange={(e) =>
                                  setCustomQueryInputs((prev) => ({
                                    ...prev,
                                    [resultIndex]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter")
                                    runCustomLyricsSearch(resultIndex);
                                }}
                              />
                              <Button
                                size="sm"
                                disabled={customQueryLoading[resultIndex]}
                                onClick={() =>
                                  runCustomLyricsSearch(resultIndex)
                                }
                              >
                                {customQueryLoading[resultIndex] ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Search className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6">
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Matching
        </Button>
        <Button
          onClick={proceedToReview}
          disabled={loading || lyricsResults.length === 0}
        >
          Continue to Review
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
