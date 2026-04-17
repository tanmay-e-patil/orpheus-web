"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRight, ArrowLeft, Edit, Save, AlertCircle } from "lucide-react";
import {
  ProcessedTrack,
  EditableTrackData,
  ValidationResult,
} from "@/types/workflow";
import {
  loadWorkflowState,
  saveWorkflowState,
  updateWorkflowStage,
} from "@/lib/workflow-state";
import WorkflowProgress from "../../_components/WorkflowProgress";

export default function ReviewAndEdit() {
  const router = useRouter();
  const [processedTracks, setProcessedTracks] = useState<ProcessedTrack[]>([]);
  const [editingTrack, setEditingTrack] = useState<string | null>(null);

  useEffect(() => {
    // Load workflow state and build processed tracks
    const workflowState = loadWorkflowState();
    if (!workflowState) {
      router.push("/discover");
      return;
    }

    // Build processed tracks from workflow state
    const tracks: ProcessedTrack[] = [];

    workflowState.trackMatches.forEach((spotifyMatch) => {
      if (spotifyMatch.selectedMatch) {
        const lyricsResult = workflowState.lyricsSearchResults.find(
          (lr) => lr.trackId === spotifyMatch.selectedMatch!.id
        );

        const spotifyMs = spotifyMatch.selectedMatch?.durationMs;
        const formatMsToClock = (ms?: number): string => {
          if (typeof ms !== "number") return "Unknown";
          const totalSeconds = Math.floor(ms / 1000);
          const minutes = Math.floor(totalSeconds / 60);
          const seconds = totalSeconds % 60;
          return `${minutes}:${seconds.toString().padStart(2, "0")}`;
        };

        const processedTrack: ProcessedTrack = {
          youtube: spotifyMatch.youtubeVideo,
          track: spotifyMatch.selectedMatch,
          lyrics: lyricsResult,
          userEdits: {
            trackName: spotifyMatch.selectedMatch.name,
            artistName: spotifyMatch.selectedMatch.artist,
            albumName: spotifyMatch.selectedMatch.album,
            albumArt: spotifyMatch.selectedMatch.albumImageUrl,
            releaseDate: spotifyMatch.selectedMatch.releaseDate,
            youtubeTitle: spotifyMatch.youtubeVideo.title,
            youtubeChannel: spotifyMatch.youtubeVideo.channelTitle,
            youtubeDuration: spotifyMatch.youtubeVideo.duration || "Unknown",
            trackDuration: formatMsToClock(spotifyMs),
            lyrics: lyricsResult?.selectedOption?.plainLyrics || "",
            syncedLyrics: lyricsResult?.selectedOption?.syncedLyrics,
            customTags: [],
          },
          validationStatus: validateTrack({
            trackName: spotifyMatch.selectedMatch.name,
            artistName: spotifyMatch.selectedMatch.artist,
            albumName: spotifyMatch.selectedMatch.album,
            albumArt: spotifyMatch.selectedMatch.albumImageUrl,
            releaseDate: spotifyMatch.selectedMatch.releaseDate,
            youtubeTitle: spotifyMatch.youtubeVideo.title,
            youtubeChannel: spotifyMatch.youtubeVideo.channelTitle,
            youtubeDuration: spotifyMatch.youtubeVideo.duration || "Unknown",
            trackDuration: formatMsToClock(spotifyMs),
            lyrics: lyricsResult?.selectedOption?.plainLyrics || "",
            syncedLyrics: lyricsResult?.selectedOption?.syncedLyrics,
            customTags: [],
          }),
        };

        tracks.push(processedTrack);
      }
    });

    setProcessedTracks(tracks);
  }, [router]);

  const validateTrack = (
    trackData: Partial<EditableTrackData>
  ): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required field validation
    if (!trackData.trackName?.trim()) errors.push("Track name is required");
    if (!trackData.artistName?.trim()) errors.push("Artist name is required");
    if (!trackData.albumName?.trim()) warnings.push("Album name is missing");

    // URL validation
    if (trackData.albumArt && !trackData.albumArt.startsWith("http")) {
      warnings.push("Album art URL appears invalid");
    }

    // Duration consistency check (tolerate small differences)
    if (trackData.youtubeDuration && trackData.trackDuration) {
      const parseIso = (duration: string): number => {
        const m = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!m) return NaN;
        const h = parseInt(m[1] || "0");
        const min = parseInt(m[2] || "0");
        const s = parseInt(m[3] || "0");
        return h * 3600 + min * 60 + s;
      };
      const parseClock = (clock: string): number => {
        // Expects m:ss or mm:ss
        const parts = clock.split(":");
        if (parts.length !== 2) return NaN;
        const min = parseInt(parts[0]);
        const s = parseInt(parts[1]);
        if (Number.isNaN(min) || Number.isNaN(s)) return NaN;
        return min * 60 + s;
      };

      const ytSec = parseIso(trackData.youtubeDuration);
      const spSec = parseClock(trackData.trackDuration);

      if (!Number.isNaN(ytSec) && !Number.isNaN(spSec)) {
        const diff = Math.abs(ytSec - spSec);
        if (diff > 5) {
          warnings.push(
            `YouTube and Spotify durations don't match (YouTube: ${formatDuration(
              trackData.youtubeDuration
            )}, Spotify: ${trackData.trackDuration})`
          );
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  };

  const updateTrackData = (
    trackIndex: number,
    field: keyof EditableTrackData,
    value: any
  ) => {
    const updatedTracks = [...processedTracks];
    updatedTracks[trackIndex].userEdits = {
      ...updatedTracks[trackIndex].userEdits,
      [field]: value,
    };

    // Re-validate
    updatedTracks[trackIndex].validationStatus = validateTrack(
      updatedTracks[trackIndex].userEdits
    );

    setProcessedTracks(updatedTracks);
  };

  const proceedToCommit = () => {
    // Check if all tracks are valid
    const hasErrors = processedTracks.some(
      (track) => !track.validationStatus.isValid
    );
    if (hasErrors) {
      alert("Please fix all validation errors before proceeding");
      return;
    }

    // Update workflow stage
    const workflowState = loadWorkflowState();
    if (workflowState) {
      // Store the processed tracks in workflow state
      workflowState.editedTracks = processedTracks.map(
        (track) => track.userEdits as EditableTrackData
      );
      updateWorkflowStage(workflowState, "commit");
    }

    router.push("/discover/commit");
  };

  const goBack = () => {
    router.push("/discover/lyrics");
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

  if (processedTracks.length === 0) {
    return (
      <div className="text-center py-12">
        <Edit className="w-16 h-16 mx-auto mb-4 text-gray-400" />
        <h3 className="text-xl font-semibold mb-2">No Tracks to Review</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Complete the previous stages to have tracks ready for review.
        </p>
        <Button onClick={() => router.push("/discover")}>Start Over</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WorkflowProgress currentStage="review" />

      <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Reviewing {processedTracks.length} tracks •
        {processedTracks.filter((t) => t.validationStatus.isValid).length} valid
        •{processedTracks.filter((t) => !t.validationStatus.isValid).length}{" "}
        with errors
      </div>

      <div className="space-y-6">
        {processedTracks.map((track, index) => (
          <Card key={`${track.youtube.id}-${track.track?.id}`}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg">
                  {track.userEdits.trackName} - {track.userEdits.artistName}
                </CardTitle>
                <div className="flex items-center space-x-2">
                  {!track.validationStatus.isValid && (
                    <Badge variant="destructive">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      {track.validationStatus.errors.length} errors
                    </Badge>
                  )}
                  {track.validationStatus.warnings.length > 0 && (
                    <Badge variant="secondary">
                      {track.validationStatus.warnings.length} warnings
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setEditingTrack(
                        editingTrack === `track-${index}`
                          ? null
                          : `track-${index}`
                      )
                    }
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    {editingTrack === `track-${index}` ? "Done" : "Edit"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {editingTrack === `track-${index}` ? (
                <Tabs defaultValue="basic" className="space-y-4">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="basic">Basic Info</TabsTrigger>
                    <TabsTrigger value="sources">Sources</TabsTrigger>
                    <TabsTrigger value="lyrics">Lyrics</TabsTrigger>
                  </TabsList>

                  <TabsContent value="basic" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`track-name-${index}`}>
                          Track Name
                        </Label>
                        <Input
                          id={`track-name-${index}`}
                          value={track.userEdits.trackName || ""}
                          onChange={(e) =>
                            updateTrackData(index, "trackName", e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`artist-name-${index}`}>
                          Artist Name
                        </Label>
                        <Input
                          id={`artist-name-${index}`}
                          value={track.userEdits.artistName || ""}
                          onChange={(e) =>
                            updateTrackData(index, "artistName", e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`album-name-${index}`}>
                          Album Name
                        </Label>
                        <Input
                          id={`album-name-${index}`}
                          value={track.userEdits.albumName || ""}
                          onChange={(e) =>
                            updateTrackData(index, "albumName", e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`release-date-${index}`}>
                          Release Date
                        </Label>
                        <Input
                          id={`release-date-${index}`}
                          value={track.userEdits.releaseDate || ""}
                          onChange={(e) =>
                            updateTrackData(
                              index,
                              "releaseDate",
                              e.target.value
                            )
                          }
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="sources" className="space-y-4">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>YouTube Title</Label>
                        <Input
                          value={track.userEdits.youtubeTitle || ""}
                          onChange={(e) =>
                            updateTrackData(
                              index,
                              "youtubeTitle",
                              e.target.value
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>YouTube Channel</Label>
                        <Input
                          value={track.userEdits.youtubeChannel || ""}
                          onChange={(e) =>
                            updateTrackData(
                              index,
                              "youtubeChannel",
                              e.target.value
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Album Art URL</Label>
                        <Input
                          value={track.userEdits.albumArt || ""}
                          onChange={(e) =>
                            updateTrackData(index, "albumArt", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="lyrics" className="space-y-4">
                    <div className="space-y-2">
                      <Label>Synced Lyrics</Label>
                      <textarea
                        className="w-full h-48 p-3 border rounded-md resize-none"
                        value={track.userEdits.syncedLyrics || ""}
                        onChange={(e) =>
                          updateTrackData(index, "syncedLyrics", e.target.value)
                        }
                        placeholder="Enter lyrics..."
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Track Info */}
                  <div className="space-y-3">
                    <h4 className="font-medium">Track Information</h4>
                    <div className="space-y-2 text-sm">
                      <div>
                        <strong>Album:</strong> {track.userEdits.albumName}
                      </div>
                      <div>
                        <strong>Release:</strong> {track.userEdits.releaseDate}
                      </div>
                      <div>
                        <strong>Duration:</strong>{" "}
                        {formatDuration(
                          track.userEdits.youtubeDuration || null
                        )}
                        {track.userEdits.trackDuration && (
                          <> • Spotify: {track.userEdits.trackDuration}</>
                        )}
                      </div>
                      {track.userEdits.customTags &&
                        track.userEdits.customTags.length > 0 && (
                          <div>
                            <strong>Tags:</strong>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {track.userEdits.customTags.map(
                                (tag, tagIndex) => (
                                  <Badge
                                    key={tagIndex}
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    {tag}
                                  </Badge>
                                )
                              )}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>

                  {/* Source Info */}
                  <div className="space-y-3">
                    <h4 className="font-medium">Sources</h4>
                    <div className="space-y-2 text-sm">
                      <div>
                        <strong>YouTube:</strong>{" "}
                        {track.userEdits.youtubeChannel}
                      </div>
                      <div>
                        <strong>Album:</strong> {track.track?.album}
                      </div>
                      {track.lyrics?.selectedOption && (
                        <div>
                          <strong>Lyrics:</strong>{" "}
                          {track.lyrics.selectedOption.source}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Validation Messages */}
              {(track.validationStatus.errors.length > 0 ||
                track.validationStatus.warnings.length > 0) && (
                <div className="mt-4 space-y-2">
                  {track.validationStatus.errors.map((error, errorIndex) => (
                    <div
                      key={errorIndex}
                      className="flex items-center text-sm text-red-600 dark:text-red-400"
                    >
                      <AlertCircle className="w-4 h-4 mr-2" />
                      {error}
                    </div>
                  ))}
                  {track.validationStatus.warnings.map(
                    (warning, warningIndex) => (
                      <div
                        key={warningIndex}
                        className="flex items-center text-sm text-yellow-600 dark:text-yellow-400"
                      >
                        <AlertCircle className="w-4 h-4 mr-2" />
                        {warning}
                      </div>
                    )
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6">
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Lyrics
        </Button>
        <Button onClick={proceedToCommit}>
          <Save className="w-4 h-4 mr-2" />
          Commit to Library
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
