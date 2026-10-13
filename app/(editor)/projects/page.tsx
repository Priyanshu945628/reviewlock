"use client";

import * as React from "react";
import Link from "next/link";
import {
  LayoutGrid,
  List,
  Film,
  AlertTriangle,
  MoreVertical,
  Plus,
} from "lucide-react";
import { TopBar } from "@/components/shell/top-bar";
import {
  ProjectCard,
  StatusPill,
  Timecode,
  Button,
  Dropzone,
  EmptyState,
  Skeleton,
} from "@/components/ui";
import { formatBytes } from "@/lib/format";
import { api } from "@/lib/api";
import { Project } from "@/lib/types";
import { useUpload } from "@/components/upload/upload-context";
import { cn } from "@/lib/utils";

type FilterStatus = "all" | "processing" | "ready" | "awaiting_payment" | "paid";

export default function ProjectsDashboardPage() {
  const { openUploadDialog } = useUpload();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [searchQuery, setSearchQuery] = React.useState("");
  const [filter, setFilter] = React.useState<FilterStatus>("all");
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid");

  // Fetch projects
  const fetchProjects = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.projects.list({
        search: searchQuery,
        status: filter === "all" ? undefined : filter,
      });

      if (res.ok && res.data?.projects) {
        setProjects(res.data.projects);
      } else {
        setError(res.error?.message || "Failed to load projects.");
      }
    } catch {
      setError("An unexpected network error occurred while loading projects.");
    } finally {
      setLoading(false);
    }
  }, [filter, searchQuery]);

  React.useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const filterChips: { id: FilterStatus; label: string }[] = [
    { id: "all", label: "All" },
    { id: "processing", label: "Processing" },
    { id: "ready", label: "Ready" },
    { id: "awaiting_payment", label: "Awaiting payment" },
    { id: "paid", label: "Paid" },
  ];

  return (
    <div className="flex flex-col flex-1 min-w-0">
      {/* Top Bar (56px) */}
      <TopBar
        title="Projects"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onNewUpload={() => openUploadDialog()}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-6">
        {/* Sub-header: Filters & View Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {filterChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilter(chip.id)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors select-none",
                  filter === chip.id
                    ? "bg-accent-soft text-accent border border-accent/40 font-semibold"
                    : "bg-surface-2 border border-border text-text-muted hover:text-text hover:border-border-strong"
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* View Mode Toggle (Grid / List) */}
          <div className="flex items-center gap-1 p-0.5 rounded-md bg-surface-2 border border-border self-end sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              className={cn(
                "p-1.5 rounded transition-colors",
                viewMode === "grid"
                  ? "bg-surface-3 text-accent"
                  : "text-text-muted hover:text-text"
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-label="List view"
              className={cn(
                "p-1.5 rounded transition-colors",
                viewMode === "list"
                  ? "bg-surface-3 text-accent"
                  : "text-text-muted hover:text-text"
              )}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 1. Loading State: 6 Skeleton cards (DESIGN §6.3) */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="flex flex-col rounded-lg border border-border bg-surface-1 overflow-hidden p-3.5 space-y-3"
              >
                <Skeleton className="aspect-video w-full rounded" />
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-4 w-1/2 rounded" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-3 w-1/3 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* 2. Error State: Inline card with danger-soft bg (DESIGN §11) */}
        {!loading && error && (
          <div className="rounded-lg bg-danger-soft border border-danger/30 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-danger shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-danger">
                  Error loading projects
                </h3>
                <p className="text-xs text-text-muted mt-0.5">{error}</p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchProjects}
              className="shrink-0"
            >
              Try again
            </Button>
          </div>
        )}

        {/* 3. Empty State: Embedded Dropzone (DESIGN §6.3) */}
        {!loading && !error && projects.length === 0 && (
          <div className="py-8">
            <EmptyState
              title="Upload your first cut"
              description="Nothing is shared until you create a link."
            >
              <div className="max-w-md mx-auto mt-4">
                <Dropzone
                  onFileSelect={(file) => openUploadDialog(file)}
                />
              </div>
            </EmptyState>
          </div>
        )}

        {/* 4. Populated State — Grid View */}
        {!loading && !error && projects.length > 0 && viewMode === "grid" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((proj) => (
              <ProjectCard
                key={proj.id}
                id={proj.id}
                title={proj.title}
                durationSeconds={proj.durationSeconds}
                status={proj.status === "failed" ? "failed" : proj.status}
                statusLabel={proj.statusLabel}
                metaText={`${proj.linkCount} links · ${proj.viewedCount} viewed · ${proj.lastViewedRelative}`}
                onActionClick={() => alert(`Actions for ${proj.title}`)}
              />
            ))}
          </div>
        )}

        {/* 5. Populated State — List View (DESIGN §6.3: 56px rows) */}
        {!loading && !error && projects.length > 0 && viewMode === "list" && (
          <div className="rounded-lg border border-border bg-surface-1 overflow-hidden divide-y divide-border">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-surface-2 text-xs font-semibold text-text-muted select-none">
              <span className="col-span-5">Project</span>
              <span className="col-span-2">Status</span>
              <span className="col-span-2">Links</span>
              <span className="col-span-2">Size</span>
              <span className="col-span-1 text-right">Actions</span>
            </div>

            {/* Table Rows: 56px height (h-14) */}
            {projects.map((proj) => (
              <Link
                key={proj.id}
                href={`/projects/${proj.id}`}
                className="grid grid-cols-12 gap-4 px-4 h-14 items-center hover:bg-surface-2 transition-colors group select-none"
              >
                {/* Thumbnail + Title */}
                <div className="col-span-5 flex items-center gap-3 min-w-0">
                  <div className="w-12 h-8 rounded bg-surface-3 flex items-center justify-center shrink-0 border border-border/40 overflow-hidden">
                    <Film className="w-4 h-4 text-text-faint" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-text truncate group-hover:text-accent transition-colors">
                      {proj.title}
                    </span>
                    <span className="font-mono text-[11px] text-text-faint tabular-nums">
                      <Timecode seconds={proj.durationSeconds} />
                    </span>
                  </div>
                </div>

                {/* Status */}
                <div className="col-span-2 flex items-center">
                  <StatusPill
                    status={proj.status === "failed" ? "failed" : proj.status}
                    label={proj.statusLabel}
                  />
                </div>

                {/* Links / Views */}
                <div className="col-span-2 text-xs text-text-muted truncate">
                  {proj.linkCount} links · {proj.viewedCount} viewed
                </div>

                {/* Size */}
                <div className="col-span-2 font-mono text-xs text-text-muted tabular-nums truncate">
                  {formatBytes(proj.originalSize)}
                </div>

                {/* Actions */}
                <div className="col-span-1 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      alert(`Actions for ${proj.title}`);
                    }}
                    aria-label="Actions"
                    className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-3 transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
