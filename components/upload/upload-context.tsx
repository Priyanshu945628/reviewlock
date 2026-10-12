"use client";

import * as React from "react";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";

export interface ActiveUpload {
  file: File;
  title: string;
  uploadId?: string;
  projectId?: string;
  status: "idle" | "uploading" | "paused" | "processing" | "ready" | "error";
  progressPercent: number;
  uploadedBytes: number;
  totalBytes: number;
  speedMBps: number;
  timeLeftFormatted: string;
  stage: "uploading" | "preview" | "storage" | "done";
  error?: string;
}

interface UploadContextType {
  isDialogOpen: boolean;
  isMinimized: boolean;
  currentUpload: ActiveUpload | null;
  openUploadDialog: (file?: File) => void;
  closeUploadDialog: () => void;
  minimizeUploadTray: () => void;
  restoreUploadDialog: () => void;
  setUploadFile: (file: File) => void;
  setUploadTitle: (title: string) => void;
  startUpload: () => Promise<void>;
  pauseUpload: () => void;
  resumeUpload: () => void;
  cancelUpload: () => void;
  resetUpload: () => void;
}

const UploadContext = React.createContext<UploadContextType | null>(null);

const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MiB (CONTRACT §5)

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [isMinimized, setIsMinimized] = React.useState(false);
  const [currentUpload, setCurrentUpload] = React.useState<ActiveUpload | null>(
    null
  );

  const abortControllerRef = React.useRef<AbortController | null>(null);
  const isPausedRef = React.useRef(false);

  const openUploadDialog = (file?: File) => {
    setIsDialogOpen(true);
    setIsMinimized(false);
    if (file) {
      const cleanTitle = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[_-]+/g, " ");
      setCurrentUpload({
        file,
        title: cleanTitle,
        status: "idle",
        progressPercent: 0,
        uploadedBytes: 0,
        totalBytes: file.size,
        speedMBps: 0,
        timeLeftFormatted: "",
        stage: "uploading",
      });
    }
  };

  const closeUploadDialog = () => {
    if (currentUpload && currentUpload.status === "uploading") {
      setIsMinimized(true);
      setIsDialogOpen(false);
    } else {
      setIsDialogOpen(false);
    }
  };

  const minimizeUploadTray = () => {
    setIsDialogOpen(false);
    setIsMinimized(true);
  };

  const restoreUploadDialog = () => {
    setIsMinimized(false);
    setIsDialogOpen(true);
  };

  const setUploadFile = (file: File) => {
    const cleanTitle = file.name
      .replace(/\.[^/.]+$/, "")
      .replace(/[_-]+/g, " ");
    setCurrentUpload({
      file,
      title: cleanTitle,
      status: "idle",
      progressPercent: 0,
      uploadedBytes: 0,
      totalBytes: file.size,
      speedMBps: 0,
      timeLeftFormatted: "",
      stage: "uploading",
    });
  };

  const setUploadTitle = (title: string) => {
    if (currentUpload) {
      setCurrentUpload({ ...currentUpload, title });
    }
  };

  const startUpload = async () => {
    if (!currentUpload || !currentUpload.file) return;

    isPausedRef.current = false;
    abortControllerRef.current = new AbortController();

    setCurrentUpload((prev) =>
      prev ? { ...prev, status: "uploading", stage: "uploading", error: undefined } : null
    );

    try {
      const file = currentUpload.file;
      const totalSize = file.size;

      // 1. Initialize upload session
      const initRes = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          filename: file.name,
          size: totalSize,
          title: currentUpload.title,
        }),
      });

      const initJson = await initRes.json();
      if (!initJson.ok) {
        throw new Error(initJson.error?.message || "Failed to start upload");
      }

      const uploadId = initJson.data.uploadId;
      const projectId = initJson.data.projectId;
      const serverChunkSize = initJson.data.chunkSize || CHUNK_SIZE;

      setCurrentUpload((prev) =>
        prev ? { ...prev, uploadId, projectId } : null
      );

      // 2. Query already received chunks (resume support)
      const resumeRes = await fetch(`/api/uploads/${uploadId}`, {
        credentials: "include",
      });
      const resumeJson = await resumeRes.json();
      const receivedChunks: number[] = resumeJson.data?.receivedChunks || [];
      const receivedSet = new Set(receivedChunks);

      const totalChunks = Math.ceil(totalSize / serverChunkSize);
      let uploadedBytes = receivedChunks.length * serverChunkSize;

      const startTime = Date.now();

      // 3. Upload missing chunks sequentially
      for (let i = 0; i < totalChunks; i++) {
        if (isPausedRef.current) {
          setCurrentUpload((prev) => (prev ? { ...prev, status: "paused" } : null));
          return;
        }

        if (receivedSet.has(i)) {
          continue; // Already on server
        }

        const startByte = i * serverChunkSize;
        const endByte = Math.min(startByte + serverChunkSize, totalSize);
        const chunkBlob = file.slice(startByte, endByte);

        const chunkStart = Date.now();
        const chunkRes = await fetch(
          `/api/uploads/${uploadId}/chunk?index=${i}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            credentials: "include",
            body: chunkBlob,
            signal: abortControllerRef.current?.signal,
          }
        );

        if (!chunkRes.ok) {
          const errJson = await chunkRes.json().catch(() => null);
          throw new Error(errJson?.error?.message || `Failed uploading chunk ${i}`);
        }

        uploadedBytes += chunkBlob.size;
        const elapsedSec = (Date.now() - startTime) / 1000;
        const speedMBps =
          elapsedSec > 0
            ? Math.round((uploadedBytes / (1024 * 1024) / elapsedSec) * 10) / 10
            : 0;

        const remainingBytes = Math.max(0, totalSize - uploadedBytes);
        const remainingSec =
          speedMBps > 0 ? Math.round(remainingBytes / (speedMBps * 1024 * 1024)) : 0;
        const timeLeftFormatted =
          remainingSec < 60
            ? `${remainingSec}s left`
            : `${Math.round(remainingSec / 60)} min left`;

        const percent = Math.min(100, Math.round((uploadedBytes / totalSize) * 100));

        setCurrentUpload((prev) =>
          prev
            ? {
                ...prev,
                progressPercent: percent,
                uploadedBytes,
                speedMBps,
                timeLeftFormatted,
              }
            : null
        );
      }

      // 4. Complete upload & transcode
      setCurrentUpload((prev) =>
        prev
          ? {
              ...prev,
              stage: "preview",
              status: "processing",
              progressPercent: 100,
            }
          : null
      );

      const completeRes = await fetch(`/api/uploads/${uploadId}/complete`, {
        method: "POST",
        credentials: "include",
      });
      const completeJson = await completeRes.json();
      if (!completeJson.ok) {
        throw new Error(completeJson.error?.message || "Assembly failed");
      }

      setCurrentUpload((prev) =>
        prev
          ? {
              ...prev,
              stage: "done",
              status: "ready",
            }
          : null
      );
    } catch (err: any) {
      if (err.name === "AbortError" || isPausedRef.current) {
        return; // Handled gracefully
      }
      setCurrentUpload((prev) =>
        prev
          ? {
              ...prev,
              status: "error",
              error: err.message || "Upload failed. Please retry.",
            }
          : null
      );
    }
  };

  const pauseUpload = () => {
    isPausedRef.current = true;
    abortControllerRef.current?.abort();
    setCurrentUpload((prev) => (prev ? { ...prev, status: "paused" } : null));
  };

  const resumeUpload = () => {
    startUpload();
  };

  const cancelUpload = () => {
    isPausedRef.current = true;
    abortControllerRef.current?.abort();
    setCurrentUpload(null);
    setIsDialogOpen(false);
    setIsMinimized(false);
  };

  const resetUpload = () => {
    setCurrentUpload(null);
  };

  return (
    <UploadContext.Provider
      value={{
        isDialogOpen,
        isMinimized,
        currentUpload,
        openUploadDialog,
        closeUploadDialog,
        minimizeUploadTray,
        restoreUploadDialog,
        setUploadFile,
        setUploadTitle,
        startUpload,
        pauseUpload,
        resumeUpload,
        cancelUpload,
        resetUpload,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const context = React.useContext(UploadContext);
  if (!context) {
    throw new Error("useUpload must be used within an UploadProvider");
  }
  return context;
}
