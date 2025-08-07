"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Search, Music, FileText, CheckCircle, ArrowRight } from "lucide-react";
import {
  loadWorkflowState,
  clearWorkflowState,
  getAllDrafts,
  deleteNamedDraft,
} from "@/lib/workflow-state";
import { WorkflowState } from "@/types/workflow";

export default function DiscoverLanding() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [savedState, setSavedState] = useState<WorkflowState | null>(null);
  const [drafts, setDrafts] = useState<Record<string, WorkflowState>>({});

  useEffect(() => {
    // Load any existing workflow state
    const existingState = loadWorkflowState();
    setSavedState(existingState);

    // Load saved drafts
    const allDrafts = getAllDrafts();
    setDrafts(allDrafts);
  }, []);

  const startNewWorkflow = () => {
    if (!searchQuery.trim()) return;

    // Clear any existing workflow state
    clearWorkflowState();

    // Navigate to YouTube discovery with search query
    router.push(
      `/discover/youtube?q=${encodeURIComponent(searchQuery.trim())}`
    );
  };

  const resumeWorkflow = () => {
    if (!savedState) return;

    // Navigate to the current stage
    const stageRoutes = {
      search: "/discover",
      youtube: "/discover/youtube",
      spotify: "/discover/spotify",
      lyrics: "/discover/lyrics",
      review: "/discover/review",
      commit: "/discover/commit",
    };

    router.push(stageRoutes[savedState.currentStage] || "/discover/youtube");
  };

  const loadDraft = (draftName: string) => {
    const draft = drafts[draftName];
    if (!draft) return;

    // Navigate to the draft's current stage
    const stageRoutes = {
      search: "/discover",
      youtube: "/discover/youtube",
      spotify: "/discover/spotify",
      lyrics: "/discover/lyrics",
      review: "/discover/review",
      commit: "/discover/commit",
    };

    router.push(stageRoutes[draft.currentStage] || "/discover/youtube");
  };

  const deleteDraft = (draftName: string) => {
    deleteNamedDraft(draftName);
    setDrafts(getAllDrafts());
  };

  const workflowSteps = [
    {
      icon: <Search className="w-6 h-6" />,
      title: "YouTube Discovery",
      description: "Find potential music videos based on your search query",
    },
    {
      icon: <Music className="w-6 h-6" />,
      title: "Spotify Matching",
      description: "Enrich videos with structured Spotify metadata",
    },
    {
      icon: <FileText className="w-6 h-6" />,
      title: "Lyrics Enrichment",
      description: "Add synced lyrics from multiple sources",
    },
    {
      icon: <CheckCircle className="w-6 h-6" />,
      title: "Review & Edit",
      description: "Fine-tune all metadata before saving",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Resume existing workflow */}
      {savedState && (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
          <CardHeader>
            <CardTitle className="text-blue-800 dark:text-blue-200">
              Resume Previous Session
            </CardTitle>
            <CardDescription>
              You have an unfinished workflow for "{savedState.searchQuery}"
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Stage: {savedState.currentStage} •
                {savedState.selectedVideos.length} videos selected
              </div>
              <div className="space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    clearWorkflowState();
                    setSavedState(null);
                  }}
                >
                  Clear
                </Button>
                <Button onClick={resumeWorkflow}>
                  Resume <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved drafts */}
      {Object.keys(drafts).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Saved Drafts</CardTitle>
            <CardDescription>
              Resume work on previously saved search sessions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(drafts).map(([name, draft]) => (
                <div
                  key={name}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <div className="font-medium">{name}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      "{draft.searchQuery}" • Stage: {draft.currentStage}
                    </div>
                  </div>
                  <div className="space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteDraft(name)}
                    >
                      Delete
                    </Button>
                    <Button size="sm" onClick={() => loadDraft(name)}>
                      Load
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* New search */}
      <Card>
        <CardHeader>
          <CardTitle>Start New Discovery</CardTitle>
          <CardDescription>
            Begin a new multi-stage music discovery workflow
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-2">
            <Input
              placeholder="Search for music (e.g., 'Bohemian Rhapsody Queen' or 'indie rock 2023')"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && startNewWorkflow()}
              className="flex-1"
            />
            <Button onClick={startNewWorkflow} disabled={!searchQuery.trim()}>
              <Search className="w-4 h-4 mr-2" />
              Start Discovery
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Workflow overview */}
      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
          <CardDescription>
            Our multi-stage workflow ensures high-quality music data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {workflowSteps.map((step, index) => (
              <div key={index} className="flex items-start space-x-4">
                <div className="flex-shrink-0 p-2 bg-primary/10 rounded-lg">
                  {step.icon}
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{step.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
