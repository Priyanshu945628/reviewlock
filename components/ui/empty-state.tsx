"use client";

import * as React from "react";
import { LucideIcon } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  children,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center max-w-[420px] mx-auto",
        className
      )}
      {...props}
    >
      {Icon && (
        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-surface-2 border border-border text-text-faint mb-4">
          <Icon className="w-6 h-6" />
        </div>
      )}
      <h3 className="text-base font-semibold text-text">{title}</h3>
      <p className="mt-1 text-xs text-text-muted leading-relaxed max-w-[340px]">
        {description}
      </p>

      {actionLabel && onAction && (
        <Button variant="primary" size="sm" onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      )}

      {children && <div className="mt-5 w-full">{children}</div>}
    </div>
  );
}
