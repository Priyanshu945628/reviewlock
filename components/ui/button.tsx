"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-sans font-medium rounded-md transition-colors transition-transform select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]";

    const variantStyles = {
      primary:
        "bg-accent text-accent-ink hover:bg-accent-hover active:bg-accent/90",
      secondary:
        "bg-surface-2 text-text border border-border hover:bg-surface-3 hover:border-border-strong",
      ghost:
        "bg-transparent text-text-muted hover:text-text hover:bg-surface-2",
      danger:
        "bg-danger-soft text-danger border border-danger/30 hover:bg-danger hover:text-white",
    };

    const sizeStyles = {
      sm: "h-8 px-3 text-xs gap-1.5",
      md: "h-10 px-4 text-sm gap-2",
      lg: "h-12 px-6 text-base font-semibold gap-2.5",
    };

    const spinnerColor =
      variant === "primary" ? "text-accent-ink" : "text-current";

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          loading && "relative text-transparent transition-none",
          className
        )}
        {...props}
      >
        {children}
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 className={cn("w-4 h-4 animate-spin", spinnerColor)} />
          </span>
        )}
      </button>
    );
  }
);
Button.displayName = "Button";
