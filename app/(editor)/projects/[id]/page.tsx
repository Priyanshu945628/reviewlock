"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Check,
  X,
  Plus,
  Trash2,
  ExternalLink,
  Lock,
  Clock,
  Users,
  Film,
  AlertTriangle,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Radio,
  FileCheck2,
} from "lucide-react";
import {
  Button,
  StatusPill,
  Timecode,
  CopyLinkButton,
  ConfirmDialog,
  EmptyState,
  Skeleton,
} from "@/components/ui";
import { formatBytes, formatTimecode, formatRelative } from "@/lib/format";
import { api } from "@/lib/api";
import { MockProject, MockShareLink } from "@/lib/mocks/data";
import { ShareLinkDrawer } from "@/components/share/share-link-drawer";
import { cn } from "@/lib/utils";

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = (params?.id as string) || "";

  const [project, setProject] = React.useState<MockProject | null>(null);
  const [links, setLinks] = React.useState<MockShareLink[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Tab: 'links' | 'activity'
  const [activeTab, setActiveTab] = React.useState<"links" | "activity">("links");

  // Inline rename state
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState("");
  const [isSavingTitle, setIsSavingTitle] = React.useState(false);

  // Share link drawer state
  const [showShareDrawer, setShowShareDrawer] = React.useState(false);
  const [editingLink, setEditingLink] = React.useState<MockShareLink | null>(null);

  // Delete project dialog
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Release full file confirm
  const [releaseTargetLink, setReleaseTargetLink] = React.useState<MockShareLink | null>(null);
  const [isReleasing, setIsReleasing] = React.useState(false);

  // Video player state
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [isMuted, setIsMuted] = React.useState(false);
  const [videoDuration, setVideoDuration] = React.useState(0);

  // Fetch project and its links
  const loadProjectData = React.useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const [projRes, linksRes] = await Promise.all([
        api.projects.get(projectId),
        api.links.listByProject(projectId),
      ]);

      if (projRes.ok && projRes.data?.project) {
        setProject(projRes.data.project);
        setTitleDraft(projRes.data.project.title);
      } else {
        setError(projRes.error?.message || "Failed to load project details.");
      }

      if (linksRes.ok && linksRes.data?.links) {
        setLinks(linksRes.data.links);
      }
    } catch {
      setError("An unexpected network error occurred while loading project details.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => {
    loadProjectData();
  }, [loadProjectData]);

  // Rename handler
  const handleSaveTitle = async () => {
    if (!project || !titleDraft.trim() || titleDraft.trim() === project.title) {
      setIsEditingTitle(false);
      return;
    }
    setIsSavingTitle(true);
    try {
      const res = await api.projects.rename(project.id, titleDraft.trim());
      if (res.ok && res.data?.project) {
        const updatedTitle = res.data.project.title;
        setProject((prev) => (prev ? { ...prev, title: updatedTitle } : null));
        setIsEditingTitle(false);
      }
    } finally {
      setIsSavingTitle(false);
    }
  };

  // Delete handler
  const handleDeleteProject = async () => {
    if (!project) return;
    setIsDeleting(true);
    try {
      const res = await api.projects.delete(project.id);
      if (res.ok) {
        router.push("/projects");
      }
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Release full file handler
  const handleReleaseFullFile = async () => {
    if (!releaseTargetLink) return;
    setIsReleasing(true);
    try {
      const res = await api.links.unlock(releaseTargetLink.id);
      if (res.ok) {
        setLinks((prev) =>
          prev.map((l) =>
            l.id === releaseTargetLink.id
              ? { ...l, status: "unlocked", unlockedAt: new Date().toISOString() }
              : l
          )
        );
        setReleaseTargetLink(null);
      }
    } finally {
      setIsReleasing(false);
    }
  };

  // Video player controls
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
  };

  // 1. Loading State (DESIGN §11)
  if (loading) {
    return (
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-6">
        <Skeleton className="h-6 w-28" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-6">
            <Skeleton className="aspect-video w-full rounded-lg" />
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
          </div>
          <div className="lg:col-span-4 space-y-4">
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-11 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  // 2. Error State (DESIGN §11)
  if (error || !project) {
    return (
      <div className="flex-1 max-w-xl mx-auto p-4 md:p-8 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-full p-6 rounded-lg bg-danger-soft border border-danger/30 text-center space-y-4">
          <AlertTriangle className="w-8 h-8 text-danger mx-auto" />
          <div>
            <h2 className="text-sm font-semibold text-text">Failed to load project</h2>
            <p className="text-xs text-text-muted mt-1">{error || "Project not found."}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={loadProjectData}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const durationSec = project.durationSeconds || videoDuration || 0;
  const resolutionText = `${project.width || 1920}×${project.height || 1080} · 24 fps`;

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-6">
      {/* Top Breadcrumb Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Projects</span>
        </Link>
      </div>

      {/* Main 2-Column Layout (DESIGN §6.5: Left flexible, Right 340px sticky) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (flex / 8 cols) */}
        <div className="lg:col-span-8 space-y-6 min-w-0">
          {/* Preview Video Player */}
          <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-border shadow-md group select-none">
            {/* Native Video (HLS preview or proxy) */}
            <video
              ref={videoRef}
              src={`/api/projects/${project.id}/preview`}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  setVideoDuration(videoRef.current.duration);
                }
              }}
              onEnded={() => setIsPlaying(false)}
              className="w-full h-full object-contain"
              playsInline
            />

            {/* Diagonal Watermark Overlay (DESIGN §6.9) */}
            <div
              className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center opacity-25 select-none"
              aria-hidden="true"
            >
              <div className="grid grid-cols-2 gap-16 transform -rotate-25 scale-125 text-center">
                <span className="font-mono text-sm tracking-widest text-text font-bold">
                  PREVIEW · NOT PAID
                </span>
                <span className="font-mono text-sm tracking-widest text-text font-bold">
                  PREVIEW · NOT PAID
                </span>
                <span className="font-mono text-sm tracking-widest text-text font-bold">
                  PREVIEW · NOT PAID
                </span>
                <span className="font-mono text-sm tracking-widest text-text font-bold">
                  PREVIEW · NOT PAID
                </span>
              </div>
            </div>

            {/* Custom Bottom Controls Bar */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 pt-6 flex flex-col gap-2 transition-opacity duration-fast">
              {/* Scrub bar */}
              <input
                type="range"
                min={0}
                max={durationSec || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1 bg-surface-3 accent-accent rounded cursor-pointer transition-all hover:h-1.5"
                aria-label="Seek preview"
              />

              <div className="flex items-center justify-between text-xs text-text">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="p-1 rounded text-text hover:text-accent transition-colors"
                    aria-label={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                  </button>

                  <button
                    type="button"
                    onClick={toggleMute}
                    className="p-1 rounded text-text-muted hover:text-text transition-colors"
                    aria-label={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>

                  <div className="font-mono text-[11px] tabular-nums text-text-muted">
                    <Timecode seconds={currentTime} /> / <Timecode seconds={durationSec} />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase bg-accent-soft text-accent px-1.5 py-0.5 rounded border border-accent/20">
                    Secure Preview
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (videoRef.current) {
                        if (document.fullscreenElement) {
                          document.exitFullscreen();
                        } else {
                          videoRef.current.requestFullscreen();
                        }
                      }
                    }}
                    className="p-1 rounded text-text-muted hover:text-text transition-colors"
                    aria-label="Fullscreen"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs: Share links & Activity */}
          <div className="space-y-4">
            <div className="flex items-center gap-6 border-b border-border/80 pb-2">
              <button
                type="button"
                onClick={() => setActiveTab("links")}
                className={cn(
                  "font-display text-sm font-semibold transition-colors pb-1 relative",
                  activeTab === "links"
                    ? "text-text"
                    : "text-text-muted hover:text-text"
                )}
              >
                Share links ({links.length})
                {activeTab === "links" && (
                  <span className="absolute bottom-[-9px] inset-x-0 h-[2px] bg-accent rounded" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("activity")}
                className={cn(
                  "font-display text-sm font-semibold transition-colors pb-1 relative",
                  activeTab === "activity"
                    ? "text-text"
                    : "text-text-muted hover:text-text"
                )}
              >
                Activity
                {activeTab === "activity" && (
                  <span className="absolute bottom-[-9px] inset-x-0 h-[2px] bg-accent rounded" />
                )}
              </button>
            </div>

            {/* Tab 1: Share Links List */}
            {activeTab === "links" && (
              <div className="space-y-3">
                {links.length === 0 ? (
                  <EmptyState
                    title="No share links yet"
                    description="Create a locked preview link to share with your client."
                  >
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setEditingLink(null);
                        setShowShareDrawer(true);
                      }}
                      className="mt-2"
                    >
                      + Create share link
                    </Button>
                  </EmptyState>
                ) : (
                  links.map((link) => {
                    const isExhaustedOrExpired =
                      link.status === "viewers_exhausted" || link.status === "expired";
                    const isUnlocked = link.status === "unlocked";

                    return (
                      <div
                        key={link.id}
                        className="rounded-lg bg-surface-1 border border-border p-4 space-y-3 shadow-xs transition-colors hover:border-border-strong"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-sm text-text truncate">
                                {link.clientLabel || "Client Link"}
                              </h3>
                              <StatusPill
                                status={
                                  link.status === "live"
                                    ? "live"
                                    : link.status === "unlocked"
                                    ? "unlocked"
                                    : link.status === "viewers_exhausted"
                                    ? "viewers_exhausted"
                                    : link.status === "expired"
                                    ? "expired"
                                    : "revoked"
                                }
                                label={
                                  link.status === "live"
                                    ? "LIVE"
                                    : link.status === "unlocked"
                                    ? "PAID"
                                    : link.status === "viewers_exhausted"
                                    ? "VIEWED"
                                    : link.status.toUpperCase()
                                }
                              />
                            </div>
                            <div className="flex items-center gap-2 text-xs font-mono text-text-muted">
                              <CopyLinkButton
                                url={typeof window !== "undefined" ? `${window.location.origin}/v/${link.slug}` : `/v/${link.slug}`}
                                displayUrl={`rl.app/v/${link.slug}`}
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(`/v/${link.slug}`, "_blank")}
                              title="Open link in new tab"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline ml-1">Open</span>
                            </Button>

                            {link.status !== "revoked" && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditingLink(link);
                                    setShowShareDrawer(true);
                                  }}
                                  title="Edit link settings"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline ml-1">Edit</span>
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={async () => {
                                    await api.links.revoke(link.id);
                                    loadProjectData();
                                  }}
                                  className="text-text-muted hover:text-danger hover:bg-danger-soft"
                                  title="Revoke access"
                                >
                                  <span className="text-xs">Revoke</span>
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Metadata row: Range · Viewers · Expiry */}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted font-mono tabular-nums">
                          <span className="flex items-center gap-1">
                            <Film className="w-3 h-3 text-text-faint" />
                            {formatTimecode(link.previewStart)}–{formatTimecode(link.previewEnd)}
                          </span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3 text-text-faint" />
                            {link.viewersUsed}/{link.maxViewers} viewers
                          </span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-text-faint" />
                            {link.expiresAt ? formatRelative(link.expiresAt) : "Never expires"}
                          </span>
                        </div>

                        {/* Inline Hint & Release Full File Trigger (DESIGN §6.5) */}
                        {isExhaustedOrExpired && (
                          <div className="pt-2 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-2/40 -mx-4 -mb-4 p-3 rounded-b-lg">
                            <p className="text-xs text-text-muted">
                              Client has seen the preview. Release the full file when paid.
                            </p>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => setReleaseTargetLink(link)}
                              className="shrink-0"
                            >
                              Release full file
                            </Button>
                          </div>
                        )}

                        {isUnlocked && (
                          <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-3 bg-success-soft/20 -mx-4 -mb-4 p-3 rounded-b-lg">
                            <span className="text-xs font-medium text-success flex items-center gap-1.5">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                              Full video released and ready for download.
                            </span>
                            <CopyLinkButton
                              url={typeof window !== "undefined" ? `${window.location.origin}/v/${link.slug}` : `/v/${link.slug}`}
                              displayUrl="Copy release link"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Tab 2: Activity List */}
            {activeTab === "activity" && (
              <div className="rounded-lg bg-surface-1 border border-border p-4 divide-y divide-border">
                <div className="py-2.5 flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-accent-soft text-accent flex items-center justify-center shrink-0 mt-0.5">
                    <FileCheck2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-text">Project created & processed</p>
                    <p className="text-[11px] text-text-muted font-mono">{formatRelative(project.createdAt)}</p>
                  </div>
                </div>

                {links.map((l) => (
                  <div key={l.id} className="py-2.5 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-surface-3 text-text-muted flex items-center justify-center shrink-0 mt-0.5">
                      <Radio className="w-3.5 h-3.5 text-accent" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-text">
                        Link &ldquo;{l.clientLabel}&rdquo; created ({l.viewersUsed}/{l.maxViewers} viewers)
                      </p>
                      <p className="text-[11px] text-text-muted font-mono">{formatRelative(l.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (340px sticky) (DESIGN §6.5) */}
        <aside className="lg:col-span-4 w-full lg:sticky lg:top-20 space-y-6">
          {/* Project Info Card */}
          <div className="rounded-lg bg-surface-1 border border-border p-5 space-y-5 shadow-xs">
            {/* Title with Inline Rename */}
            <div className="space-y-1">
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveTitle();
                      if (e.key === "Escape") {
                        setTitleDraft(project.title);
                        setIsEditingTitle(false);
                      }
                    }}
                    autoFocus
                    disabled={isSavingTitle}
                    className="flex-1 h-8 px-2 rounded-md bg-surface-2 border border-border text-sm font-semibold text-text focus:outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={handleSaveTitle}
                    disabled={isSavingTitle}
                    className="p-1.5 rounded text-accent hover:bg-accent-soft"
                    title="Save title"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTitleDraft(project.title);
                      setIsEditingTitle(false);
                    }}
                    className="p-1.5 rounded text-text-muted hover:text-text"
                    title="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 group">
                  <h1 className="font-display font-semibold text-base text-text truncate">
                    {project.title}
                  </h1>
                  <button
                    type="button"
                    onClick={() => setIsEditingTitle(true)}
                    className="p-1 rounded text-text-muted opacity-0 group-hover:opacity-100 hover:text-text hover:bg-surface-2 transition-opacity"
                    title="Rename project"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Status and Dimensions Badges */}
              <div className="pt-2 flex flex-wrap items-center gap-2">
                <StatusPill
                  status={project.status === "ready" ? "ready" : "processing"}
                  label={project.status.toUpperCase()}
                />
                <span className="text-xs font-mono text-text-muted">
                  <Timecode seconds={durationSec} />
                </span>
                <span className="text-xs font-mono text-text-muted">·</span>
                <span className="text-xs font-mono text-text-muted">
                  {formatBytes(project.originalSize)}
                </span>
              </div>
            </div>

            {/* Detailed metadata */}
            <div className="space-y-2 pt-3 border-t border-border/60 text-xs">
              <div className="flex justify-between py-1 text-text-muted font-mono">
                <span>Resolution</span>
                <span className="text-text">{resolutionText}</span>
              </div>
              <div className="flex justify-between py-1 text-text-muted font-mono">
                <span>Original file</span>
                <span className="text-text truncate max-w-[160px]" title={project.originalFilename}>
                  {project.originalFilename}
                </span>
              </div>
              <div className="flex justify-between py-1 text-text-muted font-mono">
                <span>Uploaded</span>
                <span className="text-text">{formatRelative(project.createdAt)}</span>
              </div>
            </div>

            {/* Create Share Link Button */}
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                setEditingLink(null);
                setShowShareDrawer(true);
              }}
              className="w-full gap-2"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              Create share link
            </Button>
          </div>

          {/* Danger Zone */}
          <div className="rounded-lg bg-surface-1 border border-danger/30 p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-danger font-mono">
              Danger Zone
            </h3>
            <p className="text-xs text-text-muted">
              Deleting this project permanently deletes all watermarked previews, share links, and the Google Drive original.
            </p>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete project
            </Button>
          </div>
        </aside>
      </div>

      {/* Delete Project Confirm Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete project permanently?"
        description="This action cannot be undone. All watermarked previews, active share links, and the original video stored on Google Drive will be deleted immediately."
        confirmLabel="Yes, delete project"
        cancelLabel="Cancel"
        loading={isDeleting}
        variant="danger"
        onConfirm={handleDeleteProject}
      />

      {/* Release Full File Confirm Dialog (DESIGN §6.7) */}
      <ConfirmDialog
        open={!!releaseTargetLink}
        onOpenChange={(open) => !open && setReleaseTargetLink(null)}
        title="Release the full-quality video?"
        description={`${releaseTargetLink?.clientLabel || "The client"} will be able to download the original file. This can't be undone, but you can still revoke the link afterwards.`}
        confirmLabel="Yes, release"
        cancelLabel="Cancel"
        loading={isReleasing}
        variant="primary"
        onConfirm={handleReleaseFullFile}
      />

      {/* Share Link Drawer (DESIGN §6.6 & CHUNK F4) */}
      <ShareLinkDrawer
        open={showShareDrawer}
        onOpenChange={setShowShareDrawer}
        projectId={project.id}
        projectDurationSeconds={project.durationSeconds || 60}
        initialLink={editingLink}
        onSuccess={() => loadProjectData()}
      />
    </div>
  );
}
