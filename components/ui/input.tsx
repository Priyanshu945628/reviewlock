"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", label, helperText, error, id, disabled, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-text-muted select-none"
          >
            {label}
          </label>
        )}
        <input
          type={type}
          id={inputId}
          ref={ref}
          disabled={disabled}
          className={cn(
            "h-10 px-3 w-full rounded-md bg-surface-2 border border-border text-text placeholder:text-text-faint text-sm transition-colors",
            "focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            error && "border-danger focus-visible:border-danger focus-visible:ring-danger/20",
            className
          )}
          {...props}
        />
        {error ? (
          <p className="text-xs text-danger leading-none">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-text-faint leading-none">{helperText}</p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = "Input";
