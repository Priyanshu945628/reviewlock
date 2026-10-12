"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;

export interface TooltipProps {
  content: React.ReactNode;
  shortcut?: string;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

export function Tooltip({
  content,
  shortcut,
  children,
  side = "top",
  align = "center",
}: TooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={150}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          className={cn(
            "z-50 overflow-hidden rounded-sm border border-border bg-surface-2 px-2.5 py-1 text-xs text-text shadow-md animate-in fade-in-0 zoom-in-95",
            "flex items-center gap-2 select-none"
          )}
        >
          <span>{content}</span>
          {shortcut && (
            <kbd className="font-mono text-[10px] uppercase font-semibold text-text-faint bg-surface-3 px-1.5 py-0.5 rounded-xs border border-border">
              {shortcut}
            </kbd>
          )}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
