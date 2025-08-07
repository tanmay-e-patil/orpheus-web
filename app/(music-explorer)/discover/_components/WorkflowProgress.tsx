"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkflowStage } from "@/types/workflow";
import { CheckCircle, Circle, ArrowRight } from "lucide-react";

interface WorkflowProgressProps {
  currentStage: WorkflowStage;
}

export default function WorkflowProgress({
  currentStage,
}: WorkflowProgressProps) {
  const stages = [
    { key: "search", label: "Search", description: "Enter search query" },
    { key: "youtube", label: "YouTube", description: "Discover videos" },
    { key: "spotify", label: "Spotify", description: "Match metadata" },
    { key: "lyrics", label: "Lyrics", description: "Add lyrics" },
    { key: "review", label: "Review", description: "Edit & validate" },
    { key: "commit", label: "Commit", description: "Save to library" },
  ] as const;

  const currentStageIndex = stages.findIndex(
    (stage) => stage.key === currentStage
  );

  const getStageStatus = (index: number) => {
    if (index < currentStageIndex) return "completed";
    if (index === currentStageIndex) return "current";
    return "pending";
  };

  const getStageIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case "current":
        return <Circle className="w-5 h-5 text-blue-600 fill-current" />;
      default:
        return <Circle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStageColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "current":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      default:
        return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    }
  };

  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          {stages.map((stage, index) => {
            const status = getStageStatus(index);
            const isLast = index === stages.length - 1;

            return (
              <React.Fragment key={stage.key}>
                <div className="flex flex-col items-center space-y-2">
                  <div className="flex items-center space-x-2">
                    {getStageIcon(status)}
                    <Badge className={getStageColor(status)}>
                      {stage.label}
                    </Badge>
                  </div>
                  <div className="text-xs text-center text-gray-600 dark:text-gray-400 max-w-20">
                    {stage.description}
                  </div>
                </div>
                {!isLast && (
                  <ArrowRight className="w-4 h-4 text-gray-400 mx-2 flex-shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="mt-6 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-in-out"
            style={{
              width: `${((currentStageIndex + 1) / stages.length) * 100}%`,
            }}
          />
        </div>

        <div className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          Step {currentStageIndex + 1} of {stages.length}:{" "}
          {stages[currentStageIndex]?.label}
        </div>
      </CardContent>
    </Card>
  );
}
