"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  X,
  Minus,
  Film,
  Pause,
  Play,
  RotateCcw,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropzone } from "@/components/ui/dropzone";
import { ProgressBar } from "@/components/ui/progress-bar";
import { formatBytes } from "@/lib/format";
import { useUpload } from "./upload-context";
import { cn } from "@/lib/utils";

export function UploadDialog() {
  const {
    isDialogOpen,
    closeUploadDialog,
    minimizeUploadTray,
    currentUpload,
    setUploadFile,
    setUploadTitle,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    resetUpload,
  } = useUpload();

  if (!isDialogOpen) return null;

  const hasFile = !!currentUpload?.file;
  const isIdle = currentUpload?.status === "idle";
  const isUploading = currentUpload?.status === "uploading";
  const isPaused = currentUpload?.status === "paused";
  const isProcessing = currentUpload?.status === "processing";
  const isReady = currentUpload?.status === "ready";
  const isError = currentUpload?.status === "error";

  return (
    <DialogPrimitive.Root open={isDialogOpen} onOpenChange={closeUploadDialog}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs animate-in fade-in duration-fast" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-full max-w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface-1 p-6",
            "shadow-[0_12px_40px_rgba(0,0,0,0.5)] focus:outline-none select-none",
            "animate-in fade-in zoom-in-95 duration-fast"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-border/60">
            <DialogPrimitive.Title className="font-display text-base font-semibold text-text">
              Upload Video
            </DialogPrimitive.Title>
            <div className="flex items-center gap-1">
              {hasFile && !isReady && (
                <button
                  type="button"
                  onClick={minimizeUploadTray}
                  title="Minimize to tray"
                  className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
              )}
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  aria-label="Close dialog"
                  className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* Body */}
          <div className="py-6 space-y-6">
            {/* Stage 1: Dropzone (when no file selected yet) */}
            {!hasFile && (
              <Dropzone onFileSelect={(file) => setUploadFile(file)} />
            )}

            {/* Stage 2: File picked, ready to upload or currently uploading */}
            {hasFile && (
              <>
                {/* File Row */}
                <div className="flex items-center justify-between p-3.5 rounded-lg bg-surface-2 border border-border">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded bg-surface-3 border border-border flex items-center justify-center shrink-0">
                      <Film className="w-4 h-4 text-text-muted" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold text-text truncate max-w-sm">
                        {currentUpload.file.name}
                      </span>
                      <span className="font-mono text-xs text-text-faint tabular-nums">
                        {formatBytes(currentUpload.file.size)}
                      </span>
                    </div>
                  </div>

                  {isIdle && (
                    <button
                      type="button"
                      onClick={resetUpload}
                      title="Remove file"
                      className="p-1 rounded text-text-muted hover:text-danger transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Title Input (editable before starting upload) */}
                {isIdle && (
                  <Input
                    label="Project Title"
                    value={currentUpload.title}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="e.g. Wedding Reel v3"
                  />
                )}

                {/* Progress Details during upload */}
                {(isUploading || isPaused) && (
                  <div className="space-y-3 p-4 rounded-lg bg-surface-2/60 border border-border">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-text">
                        {isPaused ? "Upload Paused" : "Uploading..."}
                      </span>
                      <span className="font-mono text-text-muted tabular-nums">
                        {currentUpload.progressPercent}% ·{" "}
                        {formatBytes(currentUpload.uploadedBytes)} of{" "}
                        {formatBytes(currentUpload.totalBytes)} ·{" "}
                        {currentUpload.speedMBps > 0
                          ? `${currentUpload.speedMBps} MB/s`
                          : ""}{" "}
                        {currentUpload.timeLeftFormatted
                          ? `· ${currentUpload.timeLeftFormatted}`
                          : ""}
                      </span>
                    </div>

                    <ProgressBar value={currentUpload.progressPercent} />

                    <div className="flex items-center justify-end gap-2 pt-1">
                      {isUploading && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={pauseUpload}
                          className="gap-1.5"
                        >
                          <Pause className="w-3.5 h-3.5" />
                          <span>Pause</span>
                        </Button>
                      )}
                      {isPaused && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={resumeUpload}
                          className="gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Resume</span>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelUpload}
                        className="text-danger hover:text-danger"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* 3-Step Pipeline Status (DESIGN §6.4) */}
                {(isProcessing || isReady) && (
                  <div className="p-4 rounded-lg bg-surface-2 border border-border space-y-3.5">
                    <p className="text-xs font-semibold text-text uppercase font-mono tracking-wider">
                      Processing Pipeline
                    </p>

                    <div className="space-y-2.5 text-xs">
                      {/* Step 1: Uploaded */}
                      <div className="flex items-center gap-2.5 text-success font-medium">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Uploaded successfully</span>
                      </div>

                      {/* Step 2: Building secure preview */}
                      <div
                        className={cn(
                          "flex items-center gap-2.5 font-medium",
                          isReady
                            ? "text-success"
                            : "text-text"
                        )}
                      >
                        {isReady ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                        ) : (
                          <Loader2 className="w-4 h-4 text-info animate-spin shrink-0" />
                        )}
                        <span>Building secure preview & watermarks</span>
                      </div>

                      {/* Step 3: Saving original to Drive */}
                      <div
                        className={cn(
                          "flex items-center gap-2.5",
                          isReady
                            ? "text-success font-medium"
                            : "text-text-muted"
                        )}
                      >
                        {isReady ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                        ) : (
                          <span className="w-4 h-4 rounded-full border border-text-faint flex items-center justify-center shrink-0" />
                        )}
                        <span>Saving original to private storage</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error Banner with Retry */}
                {isError && (
                  <div className="p-4 rounded-lg bg-danger-soft border border-danger/30 flex items-start justify-between gap-3 text-xs">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-danger">Upload failed</p>
                        <p className="text-text-muted mt-0.5">
                          {currentUpload.error || "An error occurred during upload."}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={startUpload}
                      className="shrink-0 gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry</span>
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/60">
            {isIdle && hasFile && (
              <>
                <Button variant="secondary" size="sm" onClick={resetUpload}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={startUpload}>
                  Upload
                </Button>
              </>
            )}

            {isReady && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  closeUploadDialog();
                  resetUpload();
                  window.location.reload();
                }}
              >
                Done
              </Button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
