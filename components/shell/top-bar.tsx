"use client";

import * as React from "react";
import { Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface TopBarProps {
  title: string;
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
  onNewUpload?: () => void;
  className?: string;
}

export function TopBar({
  title,
  searchQuery,
  onSearchChange,
  onNewUpload,
  className,
}: TopBarProps) {
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);

  // Global shortcuts: U = new upload, / = focus search
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input or textarea
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "/" && onSearchChange) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (
        (e.key === "u" || e.key === "U") &&
        !e.metaKey &&
        !e.ctrlKey &&
        onNewUpload
      ) {
        e.preventDefault();
        onNewUpload();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNewUpload, onSearchChange]);

  return (
    <header
      className={cn(
        "h-14 sticky top-0 z-30 bg-bg border-b border-border px-4 md:px-8 flex items-center justify-between gap-4",
        className
      )}
    >
      {/* Page Title */}
      <h1 className="font-display font-semibold text-lg md:text-xl text-text truncate">
        {title}
      </h1>

      {/* Right Actions: Search + Upload */}
      <div className="flex items-center gap-3">
        {onSearchChange !== undefined && (
          <div className="relative w-44 md:w-64">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery || ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search..."
              className={cn(
                "h-9 pl-8 pr-7 w-full rounded-md bg-surface-2 border border-border text-xs text-text placeholder:text-text-faint",
                "focus-visible:outline-none focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent/20 transition-colors"
              )}
            />
            <span className="hidden md:inline-flex items-center justify-center absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-text-faint bg-surface-3 px-1.5 py-0.5 rounded border border-border pointer-events-none">
              /
            </span>
          </div>
        )}

        {onNewUpload && (
          <Tooltip content="Upload video" shortcut="U">
            <Button
              variant="primary"
              size="sm"
              onClick={onNewUpload}
              className="gap-1.5 shrink-0"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="hidden sm:inline">New upload</span>
            </Button>
          </Tooltip>
        )}
      </div>
    </header>
  );
}
