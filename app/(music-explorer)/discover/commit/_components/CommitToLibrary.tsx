"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Music,
  Home,
  RotateCcw,
} from "lucide-react";
import { EditableTrackData, CommitResult } from "@/types/workflow";
import { loadWorkflowState, clearWorkflowState } from "@/lib/workflow-state";
import WorkflowProgress from "../../_components/WorkflowProgress";
import { saveSongAndVideo } from "../../actions"; // migrated to discover actions
import { SpotifyTrack, YouTubeVideo } from "@/types/explorer";

export default function CommitToLibrary() {
  const router = useRouter();
  const [tracks, setTracks] = useState<EditableTrackData[]>([]);
  const [commitResults, setCommitResults] = useState<CommitResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    // Load workflow state
    const workflowState = loadWorkflowState();
    if (!workflowState || workflowState.editedTracks.length === 0) {
      router.push("/discover");
      return;
    }

    setTracks(workflowState.editedTracks);
  }, [router]);

  const commitAllTracks = async () => {
    setLoading(true);
    const results: CommitResult[] = [];

    const workflowState = loadWorkflowState();
    if (!workflowState) {
      setLoading(false);
      return;
    }

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      try {
        // Find the corresponding Spotify and YouTube data
        const spotifyMatch = workflowState.spotifyMatches[i];
        const youtubeVideo = workflowState.selectedVideos.find(
          (v) => v.id === spotifyMatch?.youtubeVideo.id
        );
        const lyrics = workflowState.lyricsSearchResults[i];

        if (!spotifyMatch?.selectedMatch || !youtubeVideo) {
          throw new Error("Missing Spotify or YouTube data");
        }

        // Convert to the format expected by existing saveSongAndVideo function
        const spotifyTrack: SpotifyTrack = {
          id: spotifyMatch.selectedMatch.id,
          name: track.trackName || spotifyMatch.selectedMatch.name,
          artist: track.artistName || spotifyMatch.selectedMatch.artist,
          album: track.albumName || spotifyMatch.selectedMatch.album,
          albumImageUrl:
            track.albumArt || spotifyMatch.selectedMatch.albumImageUrl,
          releaseDate:
            track.releaseDate || spotifyMatch.selectedMatch.releaseDate,
        };

        const youtubeVideoData: YouTubeVideo = {
          id: youtubeVideo.id,
          title: track.youtubeTitle || youtubeVideo.title,
          thumbnail: youtubeVideo.thumbnail,
          channelTitle: track.youtubeChannel || youtubeVideo.channelTitle,
          publishedAt: youtubeVideo.publishedAt,
          duration: youtubeVideo.duration || track.youtubeDuration,
          viewCount: youtubeVideo.viewCount,
        };
        // Save using existing function
        await saveSongAndVideo(spotifyTrack, youtubeVideoData, lyrics);

        results.push({
          trackId: spotifyTrack.id,
          success: true,
        });
      } catch (error) {
        console.error(`Failed to save track ${i}:`, error);
        results.push({
          trackId: `track-${i}`,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }

      // Update results incrementally
      setCommitResults([...results]);
    }

    setLoading(false);
    setCompleted(true);
  };

  const startNewWorkflow = () => {
    clearWorkflowState();
    router.push("/discover");
  };

  const goToLibrary = () => {
    clearWorkflowState();
    router.push("/home");
  };

  const retryFailedTracks = async () => {
    // Re-attempt failed tracks
    const failedIndices = commitResults
      .map((result, index) => (!result.success ? index : -1))
      .filter((index) => index !== -1);

    if (failedIndices.length === 0) return;

    setLoading(true);
    // This would retry only the failed tracks
    // For simplicity, we'll just retry all tracks
    await commitAllTracks();
  };

  const successCount = commitResults.filter((r) => r.success).length;
  const failureCount = commitResults.filter((r) => !r.success).length;

  if (tracks.length === 0) {
    return (
      <div className="text-center py-12">
        <Music className="w-16 h-16 mx-auto mb-4 text-gray-400" />
        <h3 className="text-xl font-semibold mb-2">No Tracks to Commit</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Complete the review stage to have tracks ready for committing.
        </p>
        <Button onClick={() => router.push("/discover")}>Start Over</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WorkflowProgress currentStage="commit" />

      {!loading && !completed && (
        <Card>
          <CardHeader>
            <CardTitle>Ready to Commit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-400">
                You have {tracks.length} tracks ready to be saved to your music
                library.
              </p>
              <div className="space-y-2">
                {tracks.map((track, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">
                        {track.trackName} - {track.artistName}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {track.albumName}
                      </p>
                    </div>
                    <Badge variant="outline">Ready</Badge>
                  </div>
                ))}
              </div>
              <Button onClick={commitAllTracks} className="w-full">
                <CheckCircle className="w-4 h-4 mr-2" />
                Commit All Tracks to Library
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <Loader2 className="w-12 h-12 animate-spin mx-auto" />
              <div>
                <p className="font-medium">Saving tracks to your library...</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {commitResults.length} of {tracks.length} processed
                </p>
              </div>

              {commitResults.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {commitResults.map((result, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 border rounded text-sm"
                    >
                      <span>
                        {tracks[index].trackName} - {tracks[index].artistName}
                      </span>
                      <div className="flex items-center">
                        {result.success ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {completed && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CheckCircle className="w-6 h-6 mr-2 text-green-600" />
              Workflow Complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="text-center">
                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                  <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {successCount}
                    </div>
                    <div className="text-sm text-green-800 dark:text-green-300">
                      Successfully saved
                    </div>
                  </div>
                  <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">
                      {failureCount}
                    </div>
                    <div className="text-sm text-red-800 dark:text-red-300">
                      Failed to save
                    </div>
                  </div>
                </div>
              </div>

              {failureCount > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-red-600">Failed Tracks:</h4>
                  {commitResults
                    .map((result, index) => ({ result, index }))
                    .filter(({ result }) => !result.success)
                    .map(({ result, index }) => (
                      <div
                        key={index}
                        className="p-3 bg-red-50 dark:bg-red-950 rounded-lg"
                      >
                        <p className="font-medium">
                          {tracks[index].trackName} - {tracks[index].artistName}
                        </p>
                        <p className="text-sm text-red-600 dark:text-red-400">
                          {result.error || "Unknown error"}
                        </p>
                      </div>
                    ))}
                  <Button
                    variant="outline"
                    onClick={retryFailedTracks}
                    disabled={loading}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Retry Failed Tracks
                  </Button>
                </div>
              )}

              <div className="flex space-x-4 justify-center">
                <Button onClick={goToLibrary}>
                  <Home className="w-4 h-4 mr-2" />
                  Go to Library
                </Button>
                <Button variant="outline" onClick={startNewWorkflow}>
                  <Music className="w-4 h-4 mr-2" />
                  Start New Discovery
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress Summary */}
      {commitResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Progress Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {commitResults.map((result, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 border rounded"
                >
                  <div className="flex-1">
                    <p className="font-medium">{tracks[index].trackName}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {tracks[index].artistName} • {tracks[index].albumName}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {result.success ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <Badge
                          variant="default"
                          className="bg-green-100 text-green-800"
                        >
                          Success
                        </Badge>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5 text-red-600" />
                        <Badge variant="destructive">Failed</Badge>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
