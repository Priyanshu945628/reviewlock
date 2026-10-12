"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface LogoProps extends React.HTMLAttributes<HTMLDivElement> {
  asLink?: boolean;
  href?: string;
}

export function Logo({
  asLink = false,
  href = "/projects",
  className,
  ...props
}: LogoProps) {
  const content = (
    <div
      className={cn(
        "inline-flex items-center select-none tracking-tight font-display font-semibold text-lg text-text",
        className
      )}
      {...props}
    >
      <span>Review</span>
      {/* 2px x 18px amber vertical bar (the playhead) between Review and Lock */}
      <span
        className="w-[2px] h-[18px] bg-accent mx-1 rounded-full shrink-0"
        aria-hidden="true"
      />
      <span>Lock</span>
    </div>
  );

  if (asLink) {
    return (
      <Link href={href} className="inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm">
        {content}
      </Link>
    );
  }

  return content;
}
