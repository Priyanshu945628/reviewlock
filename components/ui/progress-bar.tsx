"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number; // 0 - 100
  indeterminate?: boolean;
}

export function ProgressBar({
  value = 0,
  indeterminate = false,
  className,
  ...props
}: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : clampedValue}
      className={cn(
        "relative h-1 w-full overflow-hidden rounded-full bg-surface-3",
        className
      )}
      {...props}
    >
      {indeterminate ? (
        <div className="absolute top-0 bottom-0 w-8 bg-accent rounded-full animate-playhead-tick" />
      ) : (
        <div
          className="h-full bg-accent transition-all duration-base ease-custom rounded-full"
          style={{ width: `${clampedValue}%` }}
        />
      )}
    </div>
  );
}
