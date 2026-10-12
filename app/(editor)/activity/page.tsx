"use client";

import * as React from "react";
import { TopBar } from "@/components/shell/top-bar";
import { StatusTimeline } from "@/components/ui/status-timeline";

export default function ActivityPage() {
  return (
    <div className="flex flex-col flex-1 min-w-0">
      <TopBar title="Activity" />

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8 space-y-6">
        <div className="p-6 rounded-lg bg-surface-1 border border-border">
          <h2 className="font-display text-base font-semibold text-text mb-6">
            Recent Security & Viewer Activity
          </h2>
          <StatusTimeline
            steps={[
              {
                id: "act-1",
                title: "Original Released",
                timestamp: "10 mins ago",
                detail: "Priyanshu released master original for Studio Kala – Promo.",
                status: "completed",
              },
              {
                id: "act-2",
                title: "Client Slot Claimed",
                timestamp: "45 mins ago",
                detail: "Rahul opened Wedding Reel preview. Slot 1/1 claimed.",
                status: "completed",
              },
              {
                id: "act-3",
                title: "New Link Created",
                timestamp: "2 hours ago",
                detail: "Created private link x7Kq9Zr2 with 30s locked preview.",
                status: "completed",
              },
              {
                id: "act-4",
                title: "Processing Completed",
                timestamp: "3 days ago",
                detail: "Wedding_Reel_v3.mp4 HLS proxy rendered and original uploaded to Drive.",
                status: "completed",
              },
            ]}
          />
        </div>
      </main>
    </div>
  );
}
