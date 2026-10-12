"use client";

import * as React from "react";
import { Film } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropzoneProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onDrop"> {
  onFileSelect?: (file: File) => void;
  accept?: string;
  disabled?: boolean;
}

export function Dropzone({
  onFileSelect,
  accept = "video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm",
  disabled = false,
  className,
  ...props
}: DropzoneProps) {
  const [isDragOver, setIsDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      onFileSelect?.(file);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      onFileSelect?.(file);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      tabIndex={disabled ? -1 : 0}
      role="button"
      aria-label="Upload video file"
      className={cn(
        "relative flex flex-col items-center justify-center h-[220px] w-full rounded-lg border-[1.5px] border-dashed border-border-strong bg-surface-1/40 cursor-pointer select-none transition-colors duration-fast",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        isDragOver && "border-accent bg-accent-soft",
        disabled && "opacity-50 cursor-not-allowed pointer-events-none",
        className
      )}
      {...props}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={handleInputChange}
        className="hidden"
        tabIndex={-1}
      />
      <div className="flex flex-col items-center text-center gap-2 pointer-events-none">
        <Film
          className={cn(
            "w-9 h-9 transition-colors",
            isDragOver ? "text-accent" : "text-text-muted"
          )}
        />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-text">
            Drop your video here,{" "}
            <span className="text-accent hover:underline">or browse files</span>
          </p>
          <p className="font-mono text-xs text-text-faint tracking-tight mt-1">
            MP4 · MOV · MKV · WEBM · up to 5 GB
          </p>
        </div>
      </div>
    </div>
  );
}
