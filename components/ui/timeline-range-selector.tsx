"use client";

import * as React from "react";
import { Lock, Sparkles, Check, ChevronLeft, ChevronRight } from "lucide-react";
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
  const total = Math.max(1, Math.round(totalDurationSeconds));

  // Determine initial mode
  const [mode, setMode] = React.useState<"full" | "first_n" | "custom">(() => {
    if (startSeconds === 0 && endSeconds >= total) return "full";
    if (startSeconds === 0) return "first_n";
    return "custom";
  });

  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const draggingRef = React.useRef<"start" | "end" | "body" | null>(null);
  const dragStartXRef = React.useRef<number>(0);
  const dragInitialRangeRef = React.useRef<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });

  // Clamp safely
  const safeStart = Math.max(0, Math.min(Math.round(startSeconds), total - 1));
  const safeEnd = Math.max(safeStart + 1, Math.min(Math.round(endSeconds), total));
  const previewDuration = safeEnd - safeStart;
  const percentage = Math.round((previewDuration / total) * 100);

  const startPercent = (safeStart / total) * 100;
  const endPercent = (safeEnd / total) * 100;

  // Stable refs for event listeners so listeners are never torn down mid-drag
  const safeStartRef = React.useRef(safeStart);
  const safeEndRef = React.useRef(safeEnd);
  const totalRef = React.useRef(total);
  const onChangeRef = React.useRef(onChange);
  const modeRef = React.useRef(mode);

  safeStartRef.current = safeStart;
  safeEndRef.current = safeEnd;
  totalRef.current = total;
  onChangeRef.current = onChange;
  modeRef.current = mode;

  // Convert clientX to seconds
  const clientXToSeconds = React.useCallback(
    (clientX: number): number => {
      if (!trackRef.current) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const ratio = clickX / rect.width;
      return Math.round(ratio * totalRef.current);
    },
    []
  );

  // Global mouse/touch move and up listeners during drag
  React.useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const activeDrag = draggingRef.current;
      if (!activeDrag || disabled) return;

      const currentSec = clientXToSeconds(e.clientX);
      const curStart = safeStartRef.current;
      const curEnd = safeEndRef.current;
      const curTotal = totalRef.current;

      if (activeDrag === "start") {
        const newStart = Math.max(0, Math.min(currentSec, curEnd - 1));
        onChangeRef.current(newStart, curEnd);
      } else if (activeDrag === "end") {
        const newEnd = Math.max(curStart + 1, Math.min(currentSec, curTotal));
        onChangeRef.current(curStart, newEnd);
      } else if (activeDrag === "body") {
        if (!trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        const deltaX = e.clientX - dragStartXRef.current;
        const deltaSec = Math.round((deltaX / rect.width) * curTotal);

        const rangeLen =
          dragInitialRangeRef.current.end - dragInitialRangeRef.current.start;
        let newStart = dragInitialRangeRef.current.start + deltaSec;
        let newEnd = dragInitialRangeRef.current.end + deltaSec;

        if (newStart < 0) {
          newStart = 0;
          newEnd = rangeLen;
        }
        if (newEnd > curTotal) {
          newEnd = curTotal;
          newStart = curTotal - rangeLen;
        }

        onChangeRef.current(newStart, newEnd);
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
  }, [clientXToSeconds, disabled]);

  // Quick picks
  const handleSelectFull = () => {
    setMode("full");
    onChange(0, total);
  };

  const handleSelectFirstN = (sec: number) => {
    setMode("first_n");
    onChange(0, Math.min(total, sec));
  };

  const handleStepStart = (delta: number) => {
    const next = Math.max(0, Math.min(safeStart + delta, safeEnd - 1));
    onChange(next, safeEnd);
  };

  const handleStepEnd = (delta: number) => {
    const next = Math.max(safeStart + 1, Math.min(safeEnd + delta, total));
    onChange(safeStart, next);
  };

  // Click on track directly seeks/sets range
  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const clickSec = clientXToSeconds(e.clientX);

    if (mode === "first_n" || mode === "full") {
      setMode("first_n");
      const targetEnd = Math.max(1, Math.min(clickSec, total));
      onChange(0, targetEnd);
      draggingRef.current = "end";
    } else {
      const distToStart = Math.abs(clickSec - safeStart);
      const distToEnd = Math.abs(clickSec - safeEnd);
      if (distToStart < distToEnd) {
        onChange(Math.max(0, Math.min(clickSec, safeEnd - 1)), safeEnd);
        draggingRef.current = "start";
      } else {
        onChange(safeStart, Math.max(safeStart + 1, Math.min(clickSec, total)));
        draggingRef.current = "end";
      }
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

  const thumbCount = 10;

  return (
    <div className={cn("flex flex-col gap-3 w-full select-none", className)}>
      {/* 1. Mode Switcher: Full Video | First N seconds | Custom segment */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-md p-0.5 bg-surface-2 border border-border">
          <button
            type="button"
            disabled={disabled}
            onClick={handleSelectFull}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-sm transition-colors cursor-pointer",
              mode === "full" && safeStart === 0 && safeEnd === total
                ? "bg-accent text-accent-ink font-semibold shadow-xs"
                : "text-text-muted hover:text-text"
            )}
          >
            Entire video (100%)
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setMode("first_n");
              if (safeEnd === total) {
                onChange(0, Math.min(30, total));
              } else {
                onChange(0, safeEnd);
              }
            }}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-sm transition-colors cursor-pointer",
              mode === "first_n" && (safeStart !== 0 || safeEnd !== total)
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
              "px-3 py-1.5 text-xs font-medium rounded-sm transition-colors cursor-pointer",
              mode === "custom"
                ? "bg-surface-3 text-accent font-semibold"
                : "text-text-muted hover:text-text"
            )}
          >
            Custom segment
          </button>
        </div>

        {/* Quick Pick Chips */}
        <div className="flex items-center gap-1.5">
          {[15, 30].map((sec) => (
            <button
              key={sec}
              type="button"
              disabled={disabled || total < sec}
              onClick={() => handleSelectFirstN(sec)}
              className={cn(
                "px-2 py-1 text-xs font-mono rounded-sm border transition-colors cursor-pointer",
                safeEnd === sec && safeStart === 0 && mode !== "full"
                  ? "bg-accent-soft border-accent text-accent font-semibold"
                  : "border-border bg-surface-2 text-text-muted hover:border-border-strong hover:text-text",
                (disabled || total < sec) && "opacity-40 pointer-events-none"
              )}
            >
              {sec}s
            </button>
          ))}
          {total >= 60 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleSelectFirstN(60)}
              className={cn(
                "px-2 py-1 text-xs font-mono rounded-sm border transition-colors cursor-pointer",
                safeEnd === 60 && safeStart === 0 && mode !== "full"
                  ? "bg-accent-soft border-accent text-accent font-semibold"
                  : "border-border bg-surface-2 text-text-muted hover:border-border-strong hover:text-text"
              )}
            >
              1m
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={handleSelectFull}
            className={cn(
              "px-2.5 py-1 text-xs font-mono rounded-sm border transition-colors cursor-pointer flex items-center gap-1",
              safeStart === 0 && safeEnd === total
                ? "bg-accent border-accent text-accent-ink font-semibold"
                : "border-border bg-surface-2 text-text-muted hover:border-border-strong hover:text-text"
            )}
          >
            <span>Full</span>
            <span className="text-[10px] opacity-80">({formatTimecode(total)})</span>
          </button>
        </div>
      </div>

      {/* 2. Main Track Wrapper with Timecode Badges */}
      <div className="relative pt-6 pb-2">
        {/* Floating timecode badge above start */}
        {(mode === "custom" || safeStart > 0) && (
          <div
            className="absolute top-0 -translate-x-1/2 font-mono text-[11px] font-medium text-accent bg-surface-1 px-1.5 py-0.5 rounded border border-accent/40 shadow-xs tabular-nums pointer-events-none z-30"
            style={{ left: `${startPercent}%` }}
          >
            {formatTimecode(safeStart)}
          </div>
        )}

        {/* Floating timecode badge above end */}
        <div
          className="absolute top-0 -translate-x-1/2 font-mono text-[11px] font-medium text-accent bg-surface-1 px-1.5 py-0.5 rounded border border-accent/40 shadow-xs tabular-nums pointer-events-none z-30"
          style={{ left: `${endPercent}%` }}
        >
          {formatTimecode(safeEnd)}
        </div>

        {/* The 60px Interactive Timeline Track */}
        <div
          ref={trackRef}
          onPointerDown={handleTrackPointerDown}
          className="relative h-14 w-full rounded-lg bg-surface-2 border border-border overflow-hidden cursor-pointer shadow-inner"
        >
          {/* Filmstrip Frame Background */}
          <div className="absolute inset-0 flex divide-x divide-border/30 pointer-events-none opacity-40">
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
                    <span className="font-mono text-[9px] text-text-faint opacity-50">
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
                  "repeating-linear-gradient(45deg, rgba(0,0,0,0.7) 0, rgba(0,0,0,0.7) 8px, rgba(0,0,0,0.85) 8px, rgba(0,0,0,0.85) 16px)",
              }}
            >
              {startPercent > 12 && (
                <Lock className="w-3.5 h-3.5 text-text-muted/60" />
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
              if (disabled || mode === "full") return;
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
                  "repeating-linear-gradient(45deg, rgba(0,0,0,0.7) 0, rgba(0,0,0,0.7) 8px, rgba(0,0,0,0.85) 8px, rgba(0,0,0,0.85) 16px)",
              }}
            >
              {100 - endPercent > 12 && (
                <Lock className="w-3.5 h-3.5 text-text-muted/60" />
              )}
            </div>
          )}

          {/* Left Handle (Custom mode only) */}
          {mode === "custom" && (
            <div
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-label="Preview start time"
              onPointerDown={(e) => {
                if (disabled) return;
                draggingRef.current = "start";
                e.currentTarget.setPointerCapture(e.pointerId);
                e.stopPropagation();
              }}
              style={{ left: `${startPercent}%` }}
              className="absolute top-0 bottom-0 z-20 w-4 -translate-x-1/2 bg-accent rounded-sm cursor-ew-resize flex items-center justify-center shadow-lg touch-none hover:scale-105 transition-transform"
            >
              <div className="flex gap-0.5 pointer-events-none">
                <span className="w-[1.5px] h-3 bg-accent-ink rounded-full" />
                <span className="w-[1.5px] h-3 bg-accent-ink rounded-full" />
              </div>
            </div>
          )}

          {/* Right Handle (Always draggable) */}
          <div
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label="Preview end time"
            onPointerDown={(e) => {
              if (disabled) return;
              draggingRef.current = "end";
              e.currentTarget.setPointerCapture(e.pointerId);
              e.stopPropagation();
            }}
            style={{ left: `${endPercent}%` }}
            className="absolute top-0 bottom-0 z-20 w-4 -translate-x-1/2 bg-accent rounded-sm cursor-ew-resize flex items-center justify-center shadow-lg touch-none hover:scale-105 transition-transform"
          >
            <div className="flex gap-0.5 pointer-events-none">
              <span className="w-[1.5px] h-3 bg-accent-ink rounded-full" />
              <span className="w-[1.5px] h-3 bg-accent-ink rounded-full" />
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

      {/* 3. Range Steppers & Summary */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg bg-surface-2/60 border border-border">
        {/* Exact Timecode Badges with Steppers */}
        <div className="flex items-center gap-2">
          {mode === "custom" && (
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-text-muted font-mono">Start:</span>
              <button
                type="button"
                onClick={() => handleStepStart(-5)}
                disabled={safeStart <= 0}
                className="px-1.5 py-0.5 rounded bg-surface-3 text-[11px] text-text font-mono hover:bg-surface-3/80 disabled:opacity-30 cursor-pointer"
              >
                -5s
              </button>
              <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-surface-3 text-accent tabular-nums">
                {formatTimecode(safeStart)}
              </span>
              <button
                type="button"
                onClick={() => handleStepStart(5)}
                disabled={safeStart >= safeEnd - 1}
                className="px-1.5 py-0.5 rounded bg-surface-3 text-[11px] text-text font-mono hover:bg-surface-3/80 disabled:opacity-30 cursor-pointer"
              >
                +5s
              </button>
            </div>
          )}

          <div className="flex items-center gap-1">
            <span className="text-[11px] text-text-muted font-mono">End:</span>
            <button
              type="button"
              onClick={() => handleStepEnd(-5)}
              disabled={safeEnd <= safeStart + 1}
              className="px-1.5 py-0.5 rounded bg-surface-3 text-[11px] text-text font-mono hover:bg-surface-3/80 disabled:opacity-30 cursor-pointer"
            >
              -5s
            </button>
            <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-surface-3 text-accent tabular-nums">
              {formatTimecode(safeEnd)}
            </span>
            <button
              type="button"
              onClick={() => handleStepEnd(5)}
              disabled={safeEnd >= total}
              className="px-1.5 py-0.5 rounded bg-surface-3 text-[11px] text-text font-mono hover:bg-surface-3/80 disabled:opacity-30 cursor-pointer"
            >
              +5s
            </button>
          </div>
        </div>

        {/* Client visibility summary */}
        <div className="text-xs text-text-muted">
          Client sees{" "}
          <span className="font-mono font-semibold text-text">
            {formatTimecode(safeStart)} → {formatTimecode(safeEnd)}
          </span>{" "}
          ({percentage}%)
        </div>
      </div>
    </div>
  );
}
