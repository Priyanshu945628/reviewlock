"use client";

import * as React from "react";
import { TopBar } from "@/components/shell/top-bar";
import { StatusTimeline } from "@/components/ui/status-timeline";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelative } from "@/lib/format";
import { api } from "@/lib/api";
import { Activity as ActivityIcon } from "lucide-react";

export default function ActivityPage() {
  const [activities, setActivities] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function loadActivity() {
      try {
        const res = await api.activity.list();
        if (res.ok && res.data?.activities) {
          setActivities(res.data.activities);
        }
      } catch (err) {
        console.error("Failed to load activity:", err);
      } finally {
        setLoading(false);
      }
    }
    loadActivity();
  }, []);

  const timelineSteps = activities.map((item) => ({
    id: item.id,
    title: item.title,
    timestamp: formatRelative(item.timestamp),
    detail: item.detail,
    status: item.status || "completed",
  }));

  return (
    <div className="flex flex-col flex-1 min-w-0">
      <TopBar title="Activity" />

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8 space-y-6">
        <div className="p-6 rounded-lg bg-surface-1 border border-border">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-base font-semibold text-text">
              Recent Security & Viewer Activity
            </h2>
            <span className="text-xs font-mono text-text-faint">
              Audit Log (Live)
            </span>
          </div>

          {loading ? (
            <div className="space-y-4 py-2">
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
            </div>
          ) : timelineSteps.length === 0 ? (
            <EmptyState
              icon={ActivityIcon}
              title="No activity recorded yet"
              description="Actions such as project uploads, link creations, viewer opens, and master downloads will appear here in chronological order."
            />
          ) : (
            <StatusTimeline steps={timelineSteps} />
          )}
        </div>
      </main>
    </div>
  );
}
