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
  ExternalLink,
  Share2,
  Copy,
  Trash2,
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
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui";
import { ShareLinkDrawer } from "@/components/share/share-link-drawer";
import { formatBytes } from "@/lib/format";
import { api } from "@/lib/api";
import { Project } from "@/lib/types";
import { useUpload } from "@/components/upload/upload-context";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
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

  // Share drawer state
  const [selectedProjectForShare, setSelectedProjectForShare] =
    React.useState<Project | null>(null);

  // Delete dialog state
  const [projectToDelete, setProjectToDelete] = React.useState<Project | null>(
    null
  );
  const [isDeleting, setIsDeleting] = React.useState(false);

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

  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    try {
      const res = await api.projects.delete(projectToDelete.id);
      if (res.ok) {
        toast.success("Project deleted successfully");
        setProjects((prev) => prev.filter((p) => p.id !== projectToDelete.id));
        setProjectToDelete(null);
      } else {
        toast.error(res.error?.message || "Failed to delete project");
      }
    } catch {
      toast.error("Network error while deleting project");
    } finally {
      setIsDeleting(false);
    }
  };

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
                className="flex flex-col rounded-lg border border-border bg-surface-1 overflow-hidden p-3.5 space-y-3 animate-pulse"
              >
                <Skeleton className="aspect-video w-full rounded" />
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-4 w-1/2 rounded" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-3 w-3/4 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* 2. Error State */}
        {!loading && error && (
          <div className="p-6 rounded-lg bg-danger-soft border border-danger/30 text-center space-y-3">
            <AlertTriangle className="w-6 h-6 text-danger mx-auto" />
            <p className="text-sm font-semibold text-text">{error}</p>
            <Button variant="secondary" size="sm" onClick={fetchProjects}>
              Try again
            </Button>
          </div>
        )}

        {/* 3. Empty State: Embedded Dropzone (DESIGN §6.3) */}
        {!loading && !error && projects.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="py-8"
          >
            <EmptyState
              title="Upload your first cut"
              description="Nothing is shared until you create a link."
            >
              <div className="max-w-md mx-auto mt-4">
                <Dropzone onFileSelect={(file) => openUploadDialog(file)} />
              </div>
            </EmptyState>
          </motion.div>
        )}

        {/* 4. Populated State — Grid View */}
        {!loading && !error && projects.length > 0 && viewMode === "grid" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {projects.map((proj) => (
              <ProjectCard
                key={proj.id}
                id={proj.id}
                title={proj.title}
                durationSeconds={proj.durationSeconds}
                status={proj.status === "failed" ? "failed" : proj.status}
                statusLabel={proj.statusLabel}
                metaText={`${proj.linkCount} links · ${proj.viewedCount} viewed · ${proj.lastViewedRelative}`}
                onCreateLink={() => setSelectedProjectForShare(proj)}
                onDelete={() => setProjectToDelete(proj)}
              />
            ))}
          </motion.div>
        )}

        {/* 5. Populated State — List View (DESIGN §6.3: 56px rows) */}
        {!loading && !error && projects.length > 0 && viewMode === "list" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg border border-border bg-surface-1 overflow-hidden divide-y divide-border"
          >
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
              <div
                key={proj.id}
                className="grid grid-cols-12 gap-4 px-4 h-14 items-center hover:bg-surface-2/70 transition-colors group select-none relative"
              >
                {/* Thumbnail + Title */}
                <Link
                  href={`/projects/${proj.id}`}
                  className="col-span-5 flex items-center gap-3 min-w-0"
                >
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
                </Link>

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

                {/* Actions: Custom Dropdown Menu */}
                <div className="col-span-1 flex items-center justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Actions"
                        className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-3 transition-colors cursor-pointer"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/projects/${proj.id}`}
                          className="flex items-center gap-2"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-text-muted" />
                          <span>Open Project</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setSelectedProjectForShare(proj)}
                      >
                        <Share2 className="w-3.5 h-3.5 text-text-muted" />
                        <span>Create Share Link</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          if (
                            typeof navigator !== "undefined" &&
                            navigator.clipboard
                          ) {
                            navigator.clipboard.writeText(proj.id);
                            toast.success("Project ID copied to clipboard");
                          }
                        }}
                      >
                        <Copy className="w-3.5 h-3.5 text-text-muted" />
                        <span>Copy Project ID</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="danger"
                        onClick={() => setProjectToDelete(proj)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Project</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </main>

      {/* Share Link Drawer for instant link creation on the same page */}
      {selectedProjectForShare && (
        <ShareLinkDrawer
          open={Boolean(selectedProjectForShare)}
          onOpenChange={(open) => {
            if (!open) setSelectedProjectForShare(null);
          }}
          projectId={selectedProjectForShare.id}
          projectDurationSeconds={selectedProjectForShare.durationSeconds || 60}
          onSuccess={() => {
            fetchProjects();
          }}
        />
      )}

      {/* Custom Confirm Dialog for Project Deletion */}
      <ConfirmDialog
        open={Boolean(projectToDelete)}
        onOpenChange={(open) => {
          if (!open) setProjectToDelete(null);
        }}
        title="Delete Project"
        description={`Are you sure you want to delete "${projectToDelete?.title}"? All previews, timeline data, and share links will be permanently deleted.`}
        confirmLabel="Delete Project"
        variant="danger"
        loading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
