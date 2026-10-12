"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export interface SwitchProps
  extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  label?: string;
  helperText?: string;
  description?: string;
}

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(({ className, label, helperText, description, id, disabled, ...props }, ref) => {
  const generatedId = React.useId();
  const switchId = id || generatedId;

  return (
    <div className="flex items-start justify-between gap-4">
      {(label || helperText || description) && (
        <div className="flex flex-col gap-0.5 select-none">
          {label && (
            <label
              htmlFor={switchId}
              className="text-sm font-medium text-text cursor-pointer leading-tight"
            >
              {label}
            </label>
          )}
          {(helperText || description) && (
            <span className="text-xs text-text-faint leading-normal">
              {helperText || description}
            </span>
          )}
        </div>
      )}
      <SwitchPrimitive.Root
        id={switchId}
        ref={ref}
        disabled={disabled}
        className={cn(
          "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border bg-surface-3 transition-colors duration-fast",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "data-[state=checked]:bg-accent data-[state=checked]:border-accent",
          className
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            "pointer-events-none block h-3.5 w-3.5 rounded-full bg-text-muted transition-transform duration-fast",
            "data-[state=checked]:translate-x-4 data-[state=checked]:bg-accent-ink data-[state=unchecked]:translate-x-0.5"
          )}
        />
      </SwitchPrimitive.Root>
    </div>
  );
});
Switch.displayName = "Switch";
