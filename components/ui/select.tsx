"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, helperText, error, id, disabled, children, ...props }, ref) => {
    const generatedId = React.useId();
    const selectId = id || generatedId;

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="text-xs font-medium text-text-muted select-none"
          >
            {label}
          </label>
        )}
        <div className="relative w-full">
          <select
            id={selectId}
            ref={ref}
            disabled={disabled}
            className={cn(
              "h-10 px-3 pr-9 w-full appearance-none rounded-md bg-surface-2 border border-border text-text text-sm transition-colors cursor-pointer",
              "focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              error && "border-danger focus-visible:border-danger focus-visible:ring-danger/20",
              className
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
        </div>
        {error ? (
          <p className="text-xs text-danger leading-none">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-text-faint leading-none">{helperText}</p>
        ) : null}
      </div>
    );
  }
);
Select.displayName = "Select";
