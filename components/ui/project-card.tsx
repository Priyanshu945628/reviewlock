"use client";

import * as React from "react";
import Link from "next/link";
import { MoreVertical, Film, ExternalLink, Share2, Copy, Trash2, Loader2 } from "lucide-react";
import { StatusPill, StatusPillType } from "./status-pill";
import { Timecode } from "./timecode";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface ProjectCardProps {
  id: string;
  title: string;
  durationSeconds?: number;
  durationFormatted?: string;
  thumbnailUrl?: string | null;
  status: StatusPillType;
  statusLabel?: string;
  processingPercent?: number;
  metaText?: string;
  onCreateLink?: () => void;
  onDelete?: () => void;
  onActionClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export function ProjectCard({
  id,
  title,
  durationSeconds,
  durationFormatted,
  thumbnailUrl,
  status,
  statusLabel,
  processingPercent,
  metaText = "0 links · 0 viewed · just now",
  onCreateLink,
  onDelete,
  onActionClick,
  className,
}: ProjectCardProps) {
  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-lg border border-border bg-surface-1 overflow-hidden transition-all duration-fast ease-custom",
        "hover:border-border-strong hover:-translate-y-0.5 cursor-pointer select-none shadow-xs hover:shadow-md",
        className
      )}
    >
      <Link href={`/projects/${id}`} className="flex flex-col w-full h-full">
        {/* 16:9 Thumbnail Area */}
        <div className="relative aspect-video w-full bg-surface-2 overflow-hidden flex items-center justify-center">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={title}
              className="w-full h-full object-cover transition-transform duration-base group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-text-faint gap-1.5">
              <Film className="w-8 h-8 opacity-40" />
            </div>
          )}

          {/* Processing Progress Overlay */}
          {status === "processing" && (
            <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center p-4 gap-2 z-10 select-none">
              <div className="flex items-center gap-2 text-accent">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs font-semibold text-text font-mono">
                  {processingPercent !== undefined ? `${processingPercent}% completed` : "Processing..."}
                </span>
              </div>
              <div className="w-4/5 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-500 rounded-full"
                  style={{ width: `${processingPercent !== undefined ? Math.max(10, processingPercent) : 50}%` }}
                />
              </div>
              <span className="text-[10px] text-text-muted">Transcoding preview & HLS</span>
            </div>
          )}

          {/* Duration chip bottom-right */}
          {status !== "processing" && (durationSeconds !== undefined || durationFormatted) && (
            <div className="absolute bottom-2 right-2 rounded-sm bg-black/70 px-1.5 py-0.5 text-[11px] font-mono tabular-nums text-text backdrop-blur-xs">
              <Timecode
                seconds={durationSeconds}
                timecode={durationFormatted}
              />
            </div>
          )}
        </div>

        {/* Card Body */}
        <div className="flex flex-col p-3.5 gap-2 flex-grow justify-between">
          <div className="flex items-start justify-between gap-2">
            <h3
              className="text-sm font-semibold text-text truncate max-w-[calc(100%-70px)]"
              title={title}
            >
              {title}
            </h3>
            <StatusPill
              status={status}
              label={
                status === "processing" && processingPercent !== undefined
                  ? `${processingPercent}%`
                  : statusLabel
              }
            />
          </div>

          <p className="text-xs text-text-muted truncate">{metaText}</p>
        </div>
      </Link>

      {/* Custom Dropdown Menu for 3-dots actions (replacing browser alerts) */}
      <div
        className="absolute top-2 right-2 z-10"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Project actions"
              className="flex items-center justify-center w-7 h-7 rounded-md bg-surface-1/90 border border-border text-text-muted hover:text-text opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent backdrop-blur-xs cursor-pointer"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href={`/projects/${id}`} className="flex items-center gap-2">
                <ExternalLink className="w-3.5 h-3.5 text-text-muted" />
                <span>Open Project</span>
              </Link>
            </DropdownMenuItem>
            {onCreateLink && (
              <DropdownMenuItem onClick={onCreateLink}>
                <Share2 className="w-3.5 h-3.5 text-text-muted" />
                <span>Create Share Link</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  navigator.clipboard.writeText(id);
                  toast.success("Project ID copied to clipboard");
                }
              }}
            >
              <Copy className="w-3.5 h-3.5 text-text-muted" />
              <span>Copy Project ID</span>
            </DropdownMenuItem>
            {onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="danger" onClick={onDelete}>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Project</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
