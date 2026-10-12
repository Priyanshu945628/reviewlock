"use client";

import * as React from "react";
import { TopBar } from "@/components/shell/top-bar";
import { StatusPill, CopyLinkButton } from "@/components/ui";
import { MOCK_SHARE_LINKS, MOCK_PROJECTS } from "@/lib/mocks/data";

export default function LinksPage() {
  return (
    <div className="flex flex-col flex-1 min-w-0">
      <TopBar title="Share Links" />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-6">
        <div className="rounded-lg border border-border bg-surface-1 overflow-hidden divide-y divide-border">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-surface-2 text-xs font-semibold text-text-muted select-none">
            <span className="col-span-4">Client / Project</span>
            <span className="col-span-2">Status</span>
            <span className="col-span-3">Share Link</span>
            <span className="col-span-3">Viewers / Window</span>
          </div>

          {MOCK_SHARE_LINKS.map((link) => {
            const proj = MOCK_PROJECTS.find((p) => p.id === link.projectId);
            return (
              <div
                key={link.id}
                className="grid grid-cols-12 gap-4 px-4 py-3.5 items-center hover:bg-surface-2 transition-colors text-xs"
              >
                <div className="col-span-4 min-w-0">
                  <p className="font-semibold text-text truncate">
                    {link.clientLabel}
                  </p>
                  <p className="text-[11px] text-text-muted truncate mt-0.5">
                    {proj?.title || "Unknown project"}
                  </p>
                </div>

                <div className="col-span-2">
                  <StatusPill status={link.status} />
                </div>

                <div className="col-span-3">
                  <CopyLinkButton
                    url={`https://reviewlock.app/v/${link.slug}`}
                    displayUrl={`rl.app/v/${link.slug}`}
                  />
                </div>

                <div className="col-span-3 font-mono text-text-muted tabular-nums">
                  {link.viewersUsed}/{link.maxViewers} viewers · {link.previewStart}:00–{link.previewEnd}:00
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
