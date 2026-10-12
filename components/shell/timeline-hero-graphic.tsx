"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export function TimelineHeroGraphic({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative w-full aspect-[16/10] max-w-[620px] rounded-lg bg-surface-1 border border-border p-6 flex flex-col justify-between overflow-hidden shadow-2xl select-none",
        className
      )}
    >
      {/* Top Graphic Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border/60">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-border-strong" />
          <span className="w-2.5 h-2.5 rounded-full bg-border-strong" />
          <span className="w-2.5 h-2.5 rounded-full bg-border-strong" />
          <span className="font-mono text-xs text-text-muted ml-3">
            Wedding_Reel_v3.mp4
          </span>
        </div>
        <div className="font-mono text-xs text-accent px-2 py-0.5 rounded bg-accent-soft border border-accent/30">
          LOCKED CUT
        </div>
      </div>

      {/* 3 Horizontal Tracks */}
      <div className="relative my-auto flex flex-col gap-3 py-4">
        {/* Track 1: Video */}
        <div className="relative h-10 w-full rounded bg-surface-2 overflow-hidden flex items-center px-2">
          <span className="font-mono text-[10px] text-text-faint absolute left-2 z-10">
            V1
          </span>
          <div className="absolute left-8 w-44 h-7 rounded bg-info-soft border border-info/30 flex items-center px-2">
            <span className="font-mono text-[10px] text-info">A-Roll Cut</span>
          </div>
          <div className="absolute left-56 w-52 h-7 rounded bg-info-soft border border-info/30 flex items-center px-2">
            <span className="font-mono text-[10px] text-info">
              Ceremony B-Roll
            </span>
          </div>
        </div>

        {/* Track 2: B-Roll & Titles */}
        <div className="relative h-10 w-full rounded bg-surface-2 overflow-hidden flex items-center px-2">
          <span className="font-mono text-[10px] text-text-faint absolute left-2 z-10">
            V2
          </span>
          <div className="absolute left-24 w-32 h-7 rounded bg-surface-3 border border-border-strong flex items-center px-2">
            <span className="font-mono text-[10px] text-text-muted">
              Color Grade
            </span>
          </div>
          <div className="absolute left-64 w-40 h-7 rounded bg-surface-3 border border-border-strong flex items-center px-2">
            <span className="font-mono text-[10px] text-text-muted">
              Lower Thirds
            </span>
          </div>
        </div>

        {/* Track 3: Audio */}
        <div className="relative h-10 w-full rounded bg-surface-2 overflow-hidden flex items-center px-2">
          <span className="font-mono text-[10px] text-text-faint absolute left-2 z-10">
            A1
          </span>
          <div className="absolute left-8 right-8 h-7 rounded bg-success-soft border border-success/30 flex items-center px-2">
            <span className="font-mono text-[10px] text-success">
              Master Audio 48kHz
            </span>
          </div>
        </div>

        {/* Diagonal Hatched Locked Region After Playhead (starts at 38%) */}
        <div
          className="absolute top-0 bottom-0 right-0 left-[38%] rounded z-20 flex items-center justify-center pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(11,11,14,0.85) 0, rgba(11,11,14,0.85) 10px, rgba(24,24,31,0.92) 10px, rgba(24,24,31,0.92) 20px)",
          }}
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-1/90 border border-border shadow-lg">
            <Lock className="w-3.5 h-3.5 text-accent" />
            <span className="font-mono text-[11px] font-medium text-text-muted">
              FULL QUALITY LOCKED
            </span>
          </div>
        </div>

        {/* Amber Playhead Line at 38% */}
        <div className="absolute top-0 bottom-0 left-[38%] w-[2px] bg-accent z-30 pointer-events-none shadow-[0_0_12px_rgba(255,176,32,0.6)]">
          {/* Floating Tag */}
          <div className="absolute -top-6 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] font-semibold text-accent bg-surface-1 px-2 py-0.5 rounded border border-accent/40 shadow">
            00:30 · PREVIEW ENDS
          </div>
        </div>
      </div>

      {/* Bottom Timeline Ruler */}
      <div className="flex items-center justify-between pt-3 border-t border-border/60 font-mono text-[11px] text-text-faint tabular-nums">
        <span>00:00</span>
        <span>00:30</span>
        <span>01:00</span>
        <span>02:00</span>
        <span>03:00</span>
        <span>04:12</span>
      </div>
    </div>
  );
}
