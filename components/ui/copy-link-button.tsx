"use client";

import * as React from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface CopyLinkButtonProps
  extends React.HTMLAttributes<HTMLDivElement> {
  url: string;
  displayUrl?: string;
}

export function CopyLinkButton({
  url,
  displayUrl,
  className,
  ...props
}: CopyLinkButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  const textToDisplay = displayUrl || url;

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for older or insecure contexts
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      toast.success("Link copied");

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      toast.error("Could not copy link to clipboard");
    }
  };

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      className={cn(
        "inline-flex items-center h-10 px-3 rounded-md bg-surface-2 border border-border max-w-full group focus-within:border-accent transition-colors",
        className
      )}
      {...props}
    >
      <span className="font-mono text-xs text-text-muted truncate select-all mr-2">
        {textToDisplay}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy link to clipboard"
        className="ml-auto inline-flex items-center justify-center w-7 h-7 rounded hover:bg-surface-3 text-text-muted hover:text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-accent stroke-[2.5]" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}
