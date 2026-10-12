"use client";

import * as React from "react";
import { Lock, AlertCircle } from "lucide-react";
import { formatTimecode } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TimelineRangeSelectorProps {
  totalDurationSeconds: number;
  startSeconds: number;
  endSeconds: number;
  onChange: (start: number, end: number) => void;
  thumbnails?: string[];
  disabled?: boolean;
  className?: string;
}

export function TimelineRangeSelector({
  totalDurationSeconds,
  startSeconds,
  endSeconds,
  onChange,
  thumbnails = [],
  disabled = false,
  className,
}: TimelineRangeSelectorProps) {
  const [mode, setMode] = React.useState<"first_n" | "custom">(
    startSeconds === 0 ? "first_n" : "custom"
  );

  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const draggingRef = React.useRef<"start" | "end" | "body" | null>(null);
  const dragStartXRef = React.useRef<number>(0);
  const dragInitialRangeRef = React.useRef<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });

  // Clamp safely
  const total = Math.max(1, totalDurationSeconds);
  const safeStart = Math.max(0, Math.min(startSeconds, total - 1));
  const safeEnd = Math.max(safeStart + 1, Math.min(endSeconds, total));
  const previewDuration = safeEnd - safeStart;
  const percentage = Math.round((previewDuration / total) * 100);

  const startPercent = (safeStart / total) * 100;
  const endPercent = (safeEnd / total) * 100;

  // Convert clientX to seconds
  const clientXToSeconds = React.useCallback(
    (clientX: number): number => {
      if (!trackRef.current) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const ratio = clickX / rect.width;
      return Math.round(ratio * total);
    },
    [total]
  );

  // Global mouse/touch move and up listeners during drag
  React.useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!draggingRef.current || disabled) return;

      const currentSec = clientXToSeconds(e.clientX);
      const activeDrag = draggingRef.current;

      if (activeDrag === "start") {
        const newStart = Math.max(0, Math.min(currentSec, safeEnd - 1));
        onChange(newStart, safeEnd);
      } else if (activeDrag === "end") {
        const newEnd = Math.max(safeStart + 1, Math.min(currentSec, total));
        onChange(safeStart, newEnd);
      } else if (activeDrag === "body") {
        if (!trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        const deltaX = e.clientX - dragStartXRef.current;
        const deltaSec = Math.round((deltaX / rect.width) * total);

        const rangeLen =
          dragInitialRangeRef.current.end - dragInitialRangeRef.current.start;
        let newStart = dragInitialRangeRef.current.start + deltaSec;
        let newEnd = dragInitialRangeRef.current.end + deltaSec;

        if (newStart < 0) {
          newStart = 0;
          newEnd = rangeLen;
        }
        if (newEnd > total) {
          newEnd = total;
          newStart = total - rangeLen;
        }

        onChange(newStart, newEnd);
      }
    };

    const handlePointerUp = () => {
      draggingRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [clientXToSeconds, disabled, onChange, safeEnd, safeStart, total]);

  // Handle Quick Pick Buttons for First N seconds
  const handleQuickPick = (sec: number) => {
    const targetEnd = Math.min(total, sec);
    onChange(0, targetEnd);
  };

  // Keyboard navigation on handles
  const handleKeyDown = (
    handle: "start" | "end",
    e: React.KeyboardEvent<HTMLDivElement>
  ) => {
    if (disabled) return;
    const step = e.shiftKey ? 10 : 1;

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (handle === "start") {
        onChange(Math.max(0, safeStart - step), safeEnd);
      } else {
        onChange(safeStart, Math.max(safeStart + 1, safeEnd - step));
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (handle === "start") {
        onChange(Math.min(safeEnd - 1, safeStart + step), safeEnd);
      } else {
        onChange(safeStart, Math.min(total, safeEnd + step));
      }
    } else if (e.key === "Home") {
      e.preventDefault();
      if (handle === "start") onChange(0, safeEnd);
    } else if (e.key === "End") {
      e.preventDefault();
      if (handle === "end") onChange(safeStart, total);
    }
  };

  // Generate ruler tick marks
  const rulerTicks = React.useMemo(() => {
    const tickInterval = total > 300 ? 60 : total > 120 ? 30 : 10;
    const ticks: { sec: number; percent: number }[] = [];
    for (let s = 0; s <= total; s += tickInterval) {
      ticks.push({ sec: s, percent: (s / total) * 100 });
    }
    return ticks;
  }, [total]);

  // Thumbnails count (8 to 12 frames)
  const thumbCount = 10;

  return (
    <div className={cn("flex flex-col gap-3 w-full select-none", className)}>
      {/* Top Bar: Mode Switcher & Quick-pick chips */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-md p-0.5 bg-surface-2 border border-border">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setMode("first_n");
              onChange(0, safeEnd);
            }}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-sm transition-colors",
              mode === "first_n"
                ? "bg-surface-3 text-accent font-semibold"
                : "text-text-muted hover:text-text"
            )}
          >
            First N seconds
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode("custom")}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-sm transition-colors",
              mode === "custom"
                ? "bg-surface-3 text-accent font-semibold"
                : "text-text-muted hover:text-text"
            )}
          >
            Custom segment
          </button>
        </div>

        {mode === "first_n" && (
          <div className="flex items-center gap-1.5">
            {[15, 30, 60, 120].map((sec) => (
              <button
                key={sec}
                type="button"
                disabled={disabled || total < sec}
                onClick={() => handleQuickPick(sec)}
                className={cn(
                  "px-2 py-0.5 text-xs font-mono rounded-sm border transition-colors",
                  safeEnd === sec && safeStart === 0
                    ? "bg-accent-soft border-accent text-accent font-semibold"
                    : "border-border bg-surface-2 text-text-muted hover:border-border-strong hover:text-text",
                  (disabled || total < sec) && "opacity-40 pointer-events-none"
                )}
              >
                {sec < 60 ? `${sec}s` : `${sec / 60}m`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Track Wrapper with Timecode Floating Badges */}
      <div className="relative pt-6 pb-4">
        {/* Floating timecode badges above handles */}
        <div
          className="absolute top-0 -translate-x-1/2 font-mono text-[11px] font-medium text-accent bg-surface-2 px-1.5 py-0.5 rounded border border-accent/40 shadow-xs tabular-nums pointer-events-none z-30"
          style={{ left: `${startPercent}%` }}
        >
          {formatTimecode(safeStart)}
        </div>
        <div
          className="absolute top-0 -translate-x-1/2 font-mono text-[11px] font-medium text-accent bg-surface-2 px-1.5 py-0.5 rounded border border-accent/40 shadow-xs tabular-nums pointer-events-none z-30"
          style={{ left: `${endPercent}%` }}
        >
          {formatTimecode(safeEnd)}
        </div>

        {/* The 64px Track */}
        <div
          ref={trackRef}
          className="relative h-16 w-full rounded-[10px] bg-surface-2 border border-border overflow-hidden cursor-pointer"
        >
          {/* Background Filmstrip */}
          <div className="absolute inset-0 flex divide-x divide-border/40 pointer-events-none opacity-55">
            {Array.from({ length: thumbCount }).map((_, i) => (
              <div
                key={i}
                className="flex-1 h-full bg-surface-3 flex items-center justify-center overflow-hidden"
              >
                {thumbnails[i] ? (
                  <img
                    src={thumbnails[i]}
                    alt={`Frame ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-surface-3 flex items-center justify-center border-r border-border/20">
                    <span className="font-mono text-[9px] text-text-faint opacity-40">
                      {formatTimecode(Math.round((i / thumbCount) * total))}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Locked Region: Before Start (if custom segment mode) */}
          {startPercent > 0 && (
            <div
              className="absolute top-0 bottom-0 left-0 z-10 flex items-center justify-center pointer-events-none"
              style={{
                width: `${startPercent}%`,
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(0,0,0,0.72) 0, rgba(0,0,0,0.72) 8px, rgba(0,0,0,0.85) 8px, rgba(0,0,0,0.85) 16px)",
              }}
            >
              {startPercent > 15 && (
                <Lock className="w-4 h-4 text-text-muted/60" />
              )}
            </div>
          )}

          {/* Allowed Preview Range: Highlighted body */}
          <div
            className="absolute top-0 bottom-0 z-10 bg-accent-soft/80 border-y-2 border-accent cursor-grab active:cursor-grabbing"
            style={{
              left: `${startPercent}%`,
              width: `${endPercent - startPercent}%`,
            }}
            onPointerDown={(e) => {
              if (disabled || mode === "first_n") return;
              draggingRef.current = "body";
              dragStartXRef.current = e.clientX;
              dragInitialRangeRef.current = {
                start: safeStart,
                end: safeEnd,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
          />

          {/* Locked Region: After End */}
          {endPercent < 100 && (
            <div
              className="absolute top-0 bottom-0 right-0 z-10 flex items-center justify-center pointer-events-none"
              style={{
                left: `${endPercent}%`,
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(0,0,0,0.72) 0, rgba(0,0,0,0.72) 8px, rgba(0,0,0,0.85) 8px, rgba(0,0,0,0.85) 16px)",
              }}
            >
              {100 - endPercent > 15 && (
                <Lock className="w-4 h-4 text-text-muted/60" />
              )}
            </div>
          )}

          {/* Left Handle (Custom segment mode only) */}
          {mode === "custom" && (
            <div
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-label="Preview start time"
              aria-valuemin={0}
              aria-valuemax={safeEnd - 1}
              aria-valuenow={safeStart}
              aria-valuetext={`${safeStart} seconds`}
              onKeyDown={(e) => handleKeyDown("start", e)}
              onPointerDown={(e) => {
                if (disabled) return;
                draggingRef.current = "start";
                e.stopPropagation();
              }}
              style={{ left: `${startPercent}%` }}
              className={cn(
                "absolute top-0 bottom-0 z-20 w-3 -translate-x-1/2 bg-accent rounded-sm cursor-ew-resize flex items-center justify-center shadow-md",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                "touch-none"
              )}
            >
              {/* Grip lines */}
              <div className="flex gap-0.5 pointer-events-none">
                <span className="w-[1px] h-3 bg-accent-ink rounded-full" />
                <span className="w-[1px] h-3 bg-accent-ink rounded-full" />
              </div>
            </div>
          )}

          {/* Right Handle (Both modes) */}
          <div
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label="Preview end time"
            aria-valuemin={safeStart + 1}
            aria-valuemax={total}
            aria-valuenow={safeEnd}
            aria-valuetext={`${safeEnd} seconds`}
            onKeyDown={(e) => handleKeyDown("end", e)}
            onPointerDown={(e) => {
              if (disabled) return;
              draggingRef.current = "end";
              e.stopPropagation();
            }}
            style={{ left: `${endPercent}%` }}
            className={cn(
              "absolute top-0 bottom-0 z-20 w-3 -translate-x-1/2 bg-accent rounded-sm cursor-ew-resize flex items-center justify-center shadow-md",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
              "touch-none"
            )}
          >
            {/* Grip lines */}
            <div className="flex gap-0.5 pointer-events-none">
              <span className="w-[1px] h-3 bg-accent-ink rounded-full" />
              <span className="w-[1px] h-3 bg-accent-ink rounded-full" />
            </div>
          </div>
        </div>

        {/* Ruler below track */}
        <div className="relative h-4 w-full mt-1.5 text-text-faint font-mono text-[10px] tabular-nums pointer-events-none">
          {rulerTicks.map((tick) => (
            <div
              key={tick.sec}
              className="absolute -translate-x-1/2 flex flex-col items-center"
              style={{ left: `${tick.percent}%` }}
            >
              <div className="h-1 w-[1px] bg-border mb-0.5" />
              <span>{formatTimecode(tick.sec)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Summary line & warning */}
      <div className="flex flex-col gap-1 text-sm">
        <p className="text-text-muted">
          Client will see{" "}
          <strong className="text-text font-semibold font-mono">
            {formatTimecode(safeStart)} → {formatTimecode(safeEnd)}
          </strong>{" "}
          of{" "}
          <strong className="text-text font-semibold font-mono">
            {formatTimecode(total)}
          </strong>{" "}
          ({percentage}%)
        </p>

        {percentage > 50 && (
          <div className="flex items-center gap-1.5 text-xs text-accent mt-0.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>That&apos;s a big preview. Consider a shorter one.</span>
          </div>
        )}
      </div>
    </div>
  );
}
