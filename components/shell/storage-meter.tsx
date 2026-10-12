"use client";

import * as React from "react";
import Link from "next/link";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface StorageMeterProps {
  usedBytes: number;
  limitBytes: number;
  collapsed?: boolean;
}

export function StorageMeter({
  usedBytes,
  limitBytes,
  collapsed = false,
}: StorageMeterProps) {
  const percent = Math.min(100, Math.round((usedBytes / limitBytes) * 100));
  const isHigh = percent >= 90;

  if (collapsed) {
    return (
      <Link
        href="/settings"
        title={`Storage: ${formatBytes(usedBytes)} of ${formatBytes(limitBytes)} (${percent}%)`}
        className="flex flex-col items-center gap-1.5 p-2 rounded-md hover:bg-surface-2 transition-colors group"
      >
        <div className="w-8 h-1 rounded-full bg-surface-3 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-base",
              isHigh ? "bg-danger" : "bg-accent"
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      </Link>
    );
  }

  return (
    <Link
      href="/settings"
      className="flex flex-col gap-2 p-3 rounded-md hover:bg-surface-2 transition-colors group select-none"
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-text-muted group-hover:text-text transition-colors">
          Storage
        </span>
        <span className="font-mono text-text-faint tabular-nums text-[11px]">
          {formatBytes(usedBytes)} of {formatBytes(limitBytes)}
        </span>
      </div>

      <div className="h-1 w-full rounded-full bg-surface-3 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-base",
            isHigh ? "bg-danger" : "bg-accent"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </Link>
  );
}
