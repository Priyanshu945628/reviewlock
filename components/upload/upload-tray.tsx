"use client";

import * as React from "react";
import { Maximize2, Pause, Play, X, Check, AlertCircle, Loader2 } from "lucide-react";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useUpload } from "./upload-context";
import { cn } from "@/lib/utils";

export function UploadTray() {
  const {
    currentUpload,
    isMinimized,
    restoreUploadDialog,
    pauseUpload,
    resumeUpload,
    cancelUpload,
  } = useUpload();

  if (!isMinimized || !currentUpload) {
    return null;
  }

  const isUploading = currentUpload.status === "uploading";
  const isPaused = currentUpload.status === "paused";
  const isProcessing = currentUpload.status === "processing";
  const isReady = currentUpload.status === "ready";
  const isError = currentUpload.status === "error";

  return (
    <div
      role="region"
      aria-label="Upload status tray"
      className={cn(
        "fixed bottom-4 right-4 z-50 w-80 rounded-lg bg-surface-1 border border-border p-3.5 shadow-2xl",
        "animate-in slide-in-from-bottom duration-base select-none"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className="text-xs font-semibold text-text truncate max-w-[180px]"
          title={currentUpload.title}
        >
          {currentUpload.title}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={restoreUploadDialog}
            title="Expand upload dialog"
            className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={cancelUpload}
            title="Cancel upload"
            className="p-1 rounded text-text-muted hover:text-danger hover:bg-danger-soft transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress & Stats */}
      <div className="space-y-2">
        <ProgressBar
          value={currentUpload.progressPercent}
          indeterminate={isProcessing}
        />

        <div className="flex items-center justify-between text-[11px] text-text-muted font-mono tabular-nums">
          <span>
            {isReady
              ? "Completed"
              : isProcessing
              ? "Processing..."
              : isError
              ? "Failed"
              : isPaused
              ? "Paused"
              : `${currentUpload.progressPercent}% · ${currentUpload.timeLeftFormatted || "Uploading"}`}
          </span>

          <div className="flex items-center gap-2">
            {isUploading && (
              <button
                type="button"
                onClick={pauseUpload}
                title="Pause"
                className="text-text-muted hover:text-text"
              >
                <Pause className="w-3.5 h-3.5" />
              </button>
            )}
            {isPaused && (
              <button
                type="button"
                onClick={resumeUpload}
                title="Resume"
                className="text-accent hover:text-accent-hover"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
            )}
            {isReady && <Check className="w-3.5 h-3.5 text-success stroke-[2.5]" />}
            {isProcessing && <Loader2 className="w-3.5 h-3.5 text-info animate-spin" />}
            {isError && <AlertCircle className="w-3.5 h-3.5 text-danger" />}
          </div>
        </div>
      </div>
    </div>
  );
}
