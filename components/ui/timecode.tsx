"use client";

import * as React from "react";
import { formatTimecode } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TimecodeProps extends React.HTMLAttributes<HTMLSpanElement> {
  seconds?: number;
  timecode?: string;
}

export function Timecode({
  seconds,
  timecode,
  className,
  ...props
}: TimecodeProps) {
  const display =
    timecode !== undefined
      ? timecode
      : seconds !== undefined
      ? formatTimecode(seconds)
      : "00:00";

  return (
    <span
      className={cn("font-mono tabular-nums tracking-tight text-text", className)}
      {...props}
    >
      {display}
    </span>
  );
}
