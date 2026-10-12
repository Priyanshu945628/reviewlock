"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

export interface SliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  label?: string;
  helperText?: string;
  valueDisplay?: string | number;
}

export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, label, helperText, valueDisplay, disabled, ...props }, ref) => {
  return (
    <div className="flex flex-col gap-2 w-full">
      {(label || valueDisplay !== undefined) && (
        <div className="flex items-center justify-between text-xs font-medium text-text-muted">
          {label && <span>{label}</span>}
          {valueDisplay !== undefined && (
            <span className="font-mono text-text tabular-nums">{valueDisplay}</span>
          )}
        </div>
      )}
      <SliderPrimitive.Root
        ref={ref}
        disabled={disabled}
        className={cn(
          "relative flex w-full touch-none select-none items-center py-1 cursor-pointer",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
        {...props}
      >
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-surface-3">
          <SliderPrimitive.Range className="absolute h-full bg-accent" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className={cn(
            "block h-4 w-4 rounded-full border-2 border-accent bg-bg transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          )}
        />
      </SliderPrimitive.Root>
      {helperText && <p className="text-xs text-text-faint">{helperText}</p>}
    </div>
  );
});
Slider.displayName = "Slider";
