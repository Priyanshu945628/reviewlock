"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TimelineStep {
  id: string;
  title: string;
  timestamp?: string;
  detail?: string;
  status: "completed" | "current" | "upcoming";
}

export interface StatusTimelineProps
  extends React.HTMLAttributes<HTMLDivElement> {
  steps: TimelineStep[];
}

export function StatusTimeline({
  steps,
  className,
  ...props
}: StatusTimelineProps) {
  return (
    <div className={cn("flex flex-col", className)} {...props}>
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;

        return (
          <div key={step.id} className="relative flex gap-3.5 pb-6 last:pb-0">
            {/* Vertical connector line */}
            {!isLast && (
              <span
                className="absolute left-[7px] top-3.5 -bottom-1 w-[1px] bg-border pointer-events-none"
                aria-hidden="true"
              />
            )}

            {/* Dot indicator */}
            <div className="relative flex items-center justify-center pt-1">
              {step.status === "completed" ? (
                <span className="w-3.5 h-3.5 rounded-full bg-text-muted flex items-center justify-center ring-4 ring-bg" />
              ) : step.status === "current" ? (
                <span className="relative flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-accent ring-4 ring-bg" />
                </span>
              ) : (
                <span className="w-3.5 h-3.5 rounded-full border border-text-faint bg-bg ring-4 ring-bg" />
              )}
            </div>

            {/* Step content */}
            <div className="flex flex-col gap-0.5 min-w-0 flex-1 pt-0.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "text-sm font-medium leading-none truncate",
                    step.status === "upcoming"
                      ? "text-text-muted"
                      : "text-text font-semibold"
                  )}
                >
                  {step.title}
                </span>
                {step.timestamp && (
                  <span className="font-mono text-xs text-text-muted tabular-nums shrink-0">
                    {step.timestamp}
                  </span>
                )}
              </div>
              {step.detail && (
                <p className="text-xs text-text-faint leading-normal mt-0.5">
                  {step.detail}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
