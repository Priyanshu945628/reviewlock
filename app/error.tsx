"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[ReviewLock] Unhandled application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col">
      <header className="h-14 border-b border-border flex items-center px-6">
        <Link href="/projects">
          <Logo />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-[460px] rounded-lg bg-surface-1 border border-border p-8 shadow-2xl text-center space-y-6">
          <div className="w-14 h-14 rounded-full bg-danger-soft text-danger flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <div className="space-y-1.5">
            <h1 className="font-display text-xl font-semibold text-text">
              Something went wrong
            </h1>
            <p className="text-xs text-text-muted">
              An unexpected error occurred while rendering this view.
            </p>
          </div>

          {error?.message && (
            <div className="p-3 rounded-md bg-surface-2 border border-border text-left font-mono text-[11px] text-danger max-h-32 overflow-auto break-words">
              {error.message}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="md"
              onClick={() => (window.location.href = "/projects")}
              className="flex-1"
            >
              Dashboard
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => reset()}
              className="flex-1 gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Try again
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
