"use client";

import * as React from "react";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusPillType =
  | "processing"
  | "ready"
  | "live"
  | "viewed"
  | "exhausted"
  | "viewers_exhausted"
  | "expired"
  | "revoked"
  | "failed"
  | "paid"
  | "unlocked";

export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: StatusPillType;
  label?: string;
}

export function StatusPill({
  status,
  label,
  className,
  ...props
}: StatusPillProps) {
  const displayLabel = label || status;

  const renderIndicator = () => {
    switch (status) {
      case "processing":
        return <Loader2 className="w-2.5 h-2.5 animate-spin text-info" />;
      case "live":
        return (
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent" />
          </span>
        );
      case "paid":
      case "unlocked":
        return <Check className="w-2.5 h-2.5 text-success stroke-[3]" />;
      case "exhausted":
      case "viewers_exhausted":
      case "expired":
        return (
          <span className="inline-block w-1.5 h-1.5 rounded-full border border-text-faint bg-transparent" />
        );
      case "revoked":
      case "failed":
        return (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-danger" />
        );
      case "viewed":
        return (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-info" />
        );
      case "ready":
      default:
        return (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-text-muted" />
        );
    }
  };

  const getStyleClasses = () => {
    switch (status) {
      case "processing":
        return "text-info bg-info-soft border-info/20";
      case "live":
        return "text-accent bg-accent-soft border-accent/20";
      case "paid":
      case "unlocked":
        return "text-success bg-success-soft border-success/20";
      case "revoked":
      case "failed":
        return "text-danger bg-danger-soft border-danger/20";
      case "viewed":
        return "text-info bg-info-soft border-info/20";
      case "exhausted":
      case "viewers_exhausted":
      case "expired":
        return "text-text-faint bg-surface-2 border-border";
      case "ready":
      default:
        return "text-text-muted bg-surface-2 border-border";
    }
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full border text-[11px] font-semibold uppercase tracking-[0.04em] select-none",
        getStyleClasses(),
        className
      )}
      {...props}
    >
      {renderIndicator()}
      <span>{displayLabel}</span>
    </span>
  );
}
