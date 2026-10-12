"use client";

import * as React from "react";
import {
  Button,
  Input,
  Textarea,
  Select,
  Switch,
  Slider,
  StatusPill,
  Timecode,
  CopyLinkButton,
  Dropzone,
  ProgressBar,
  ProjectCard,
  TimelineRangeSelector,
  StatusTimeline,
  ConfirmDialog,
  Drawer,
  Tooltip,
  EmptyState,
  Skeleton,
  Logo,
} from "@/components/ui";
import { Film, Sparkles, AlertTriangle, Trash2, FolderPlus } from "lucide-react";

export default function DevComponentsPage() {
  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [dangerConfirmOpen, setDangerConfirmOpen] = React.useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // TimelineRangeSelector state
  const [rangeStart, setRangeStart] = React.useState(0);
  const [rangeEnd, setRangeEnd] = React.useState(30);

  // Switch and Slider state
  const [switchChecked, setSwitchChecked] = React.useState(true);
  const [sliderVal, setSliderVal] = React.useState([45]);

  return (
    <div className="min-h-screen bg-bg text-text p-4 md:p-8 max-w-7xl mx-auto space-y-12">
      {/* Header */}
      <div className="border-b border-border pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Logo />
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface-2 border border-border text-text-muted">
              DESIGN SYSTEM SHOWCASE · /dev/components
            </span>
          </div>
          <p className="text-text-muted text-sm">
            Core UI components exhibiting all required states (default, hover,
            focus, active, disabled, loading, error).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDrawerOpen(true)}
          >
            Open Test Drawer
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setConfirmOpen(true)}
          >
            Open Test Dialog
          </Button>
        </div>
      </div>

      {/* 1. Logo & Typography */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-text">
          1. Logo & Typography Tokens
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 rounded-lg bg-surface-1 border border-border">
          <div className="space-y-3">
            <p className="text-xs text-text-faint uppercase font-mono">Wordmark & Favicon Motif</p>
            <div className="flex items-center gap-4">
              <Logo className="text-2xl" />
              <div className="w-8 h-8 rounded-md bg-surface-1 border border-border flex items-center justify-center">
                <span className="w-[2px] h-[18px] bg-accent rounded-full" />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-text-faint uppercase font-mono">Font Roles</p>
            <p className="font-display text-lg font-semibold text-text">
              Display / Heading: Bricolage Grotesque (600)
            </p>
            <p className="font-sans text-sm text-text">
              UI / Body: Inter (400, 500, 600)
            </p>
            <p className="font-mono text-xs text-text-muted tabular-nums">
              Mono: JetBrains Mono 01:42 · 2.9 GB · 1920×1080
            </p>
          </div>
        </div>
      </section>

      {/* 2. Buttons */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-text">
          2. Buttons (DESIGN §4.1)
        </h2>
        <div className="p-6 rounded-lg bg-surface-1 border border-border space-y-6">
          <div className="space-y-2">
            <p className="text-xs text-text-faint uppercase font-mono">Variants (md - 40px)</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">Primary Accent</Button>
              <Button variant="secondary">Secondary Surface</Button>
              <Button variant="ghost">Ghost Button</Button>
              <Button variant="danger">Danger Action</Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-text-faint uppercase font-mono">Sizes (sm 32px / md 40px / lg 48px)</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small (32px)</Button>
              <Button size="md">Medium (40px)</Button>
              <Button size="lg">Large (48px)</Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-text-faint uppercase font-mono">States: Disabled & Loading (fixed-width)</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" disabled>
                Primary Disabled
              </Button>
              <Button variant="secondary" disabled>
                Secondary Disabled
              </Button>
              <Button variant="primary" loading>
                Primary Loading
              </Button>
              <Button variant="secondary" loading>
                Secondary Loading
              </Button>
              <Button variant="danger" loading>
                Danger Loading
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Inputs & Form Controls */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-text">
          3. Form Controls (DESIGN §4.2)
        </h2>
        <div className="p-6 rounded-lg bg-surface-1 border border-border grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Input
              label="Standard Input"
              placeholder="e.g. Rahul – Wedding Reel"
              helperText="Visible to client on review page."
            />
            <Input
              label="Disabled Input"
              disabled
              value="Uneditable link title"
            />
            <Input
              label="Error State Input"
              defaultValue="Invalid passcode"
              error="Passcode must be at least 6 characters"
            />
          </div>
          <div className="space-y-4">
            <Select
              label="Expiry Duration"
              defaultValue="24h"
              helperText="Access expires automatically."
            >
              <option value="1h">1 hour</option>
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
              <option value="never">Never</option>
            </Select>

            <Textarea
              label="Watermark Text"
              defaultValue="PREVIEW · NOT PAID"
              helperText="Tiled diagonally across the proxy rendition."
            />

            <div className="pt-2 space-y-4 border-t border-border">
              <Switch
                label="Allow preview download"
                description="Client can download the watermarked cut only."
                checked={switchChecked}
                onCheckedChange={setSwitchChecked}
              />

              <Slider
                label="Viewer Limit"
                valueDisplay={`${sliderVal[0]} viewers`}
                value={sliderVal}
                onValueChange={setSliderVal}
                max={10}
                min={1}
                step={1}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 4. Status Pills */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-text">
          4. Status Pills (DESIGN §4.3 — All 7 Variants)
        </h2>
        <div className="p-6 rounded-lg bg-surface-1 border border-border flex flex-wrap gap-3">
          <StatusPill status="processing" label="PROCESSING" />
          <StatusPill status="ready" label="READY" />
          <StatusPill status="live" label="LIVE" />
          <StatusPill status="viewed" label="VIEWED" />
          <StatusPill status="exhausted" label="EXHAUSTED" />
          <StatusPill status="expired" label="EXPIRED" />
          <StatusPill status="revoked" label="REVOKED" />
          <StatusPill status="failed" label="FAILED" />
          <StatusPill status="paid" label="PAID" />
          <StatusPill status="unlocked" label="UNLOCKED" />
        </div>
      </section>

      {/* 5. Timecode & CopyLinkButton */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-text">
          5. Timecode & Copy Link (DESIGN §4.4, §4.5)
        </h2>
        <div className="p-6 rounded-lg bg-surface-1 border border-border grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="space-y-2">
            <p className="text-xs text-text-faint uppercase font-mono">Timecodes (tabular-nums)</p>
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-text-muted text-xs mr-2">Short:</span>
                <Timecode seconds={30} />
              </div>
              <div>
                <span className="text-text-muted text-xs mr-2">Medium:</span>
                <Timecode seconds={252} />
              </div>
              <div>
                <span className="text-text-muted text-xs mr-2">Over 1h:</span>
                <Timecode seconds={4215} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-text-faint uppercase font-mono">Copy Link Button (with toast feedback)</p>
            <CopyLinkButton
              url="https://reviewlock.app/v/x7Kq9Zr2"
              displayUrl="rl.app/v/x7Kq9Zr2"
            />
          </div>
        </div>
      </section>

      {/* 6. Dropzone & ProgressBar */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-text">
          6. Dropzone & Progress Bar (DESIGN §4.6, §4.7)
        </h2>
        <div className="p-6 rounded-lg bg-surface-1 border border-border space-y-6">
          <Dropzone />

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>Upload Progress (42%)</span>
              <span className="font-mono tabular-nums text-text">
                1.2 GB of 2.9 GB · 18 MB/s
              </span>
            </div>
            <ProgressBar value={42} />

            <div className="flex items-center justify-between text-xs text-text-muted pt-2">
              <span>Indeterminate State (Playhead Tick)</span>
              <span className="font-mono text-text-faint">Processing...</span>
            </div>
            <ProgressBar indeterminate />
          </div>
        </div>
      </section>

      {/* 7. Project Cards */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-text">
          7. Project Cards (DESIGN §4.8, §12 sample content)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          <ProjectCard
            id="proj-1"
            title="Wedding_Reel_v3.mp4"
            durationSeconds={252}
            status="live"
            statusLabel="LIVE"
            metaText="2 links · 1 viewed · 3d ago"
          />
          <ProjectCard
            id="proj-2"
            title="Brand_Promo_Final.mov"
            durationSeconds={108}
            status="ready"
            statusLabel="READY"
            metaText="1 link · 0 viewed · 1d ago"
          />
          <ProjectCard
            id="proj-3"
            title="Podcast_Ep14_Cut.mp4"
            durationSeconds={2285}
            status="processing"
            statusLabel="PROCESSING"
            metaText="0 links · 0 viewed · just now"
          />
        </div>
      </section>

      {/* 8. TimelineRangeSelector (HERO COMPONENT) */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-text">
          8. TimelineRangeSelector (DESIGN §4.9, §6.6 Hero Component)
        </h2>
        <div className="p-6 rounded-lg bg-surface-1 border border-border">
          <TimelineRangeSelector
            totalDurationSeconds={252}
            startSeconds={rangeStart}
            endSeconds={rangeEnd}
            onChange={(start, end) => {
              setRangeStart(start);
              setRangeEnd(end);
            }}
          />
        </div>
      </section>

      {/* 9. StatusTimeline */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-text">
          9. StatusTimeline (DESIGN §4.10)
        </h2>
        <div className="p-6 rounded-lg bg-surface-1 border border-border max-w-lg">
          <StatusTimeline
            steps={[
              {
                id: "1",
                title: "Link Created",
                timestamp: "10:14 AM",
                detail: "Created by Priyanshu with 30s locked preview.",
                status: "completed",
              },
              {
                id: "2",
                title: "Opened by Client",
                timestamp: "10:28 AM",
                detail: "Client opened from Chrome (macOS).",
                status: "completed",
              },
              {
                id: "3",
                title: "Preview Finished",
                timestamp: "10:32 AM",
                detail: "Client reached preview lock barrier.",
                status: "current",
              },
              {
                id: "4",
                title: "Payment Received",
                timestamp: undefined,
                detail: "Awaiting payment verification.",
                status: "upcoming",
              },
              {
                id: "5",
                title: "Original Downloaded",
                timestamp: undefined,
                detail: "Full quality uncompressed original release.",
                status: "upcoming",
              },
            ]}
          />
        </div>
      </section>

      {/* 10. Modals, Drawers & Skeletons */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold text-text">
          10. Dialogs, Drawers, Tooltips, Empty State & Skeletons (DESIGN §4.11)
        </h2>
        <div className="p-6 rounded-lg bg-surface-1 border border-border space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <Tooltip content="Upload shortcut" shortcut="U">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmOpen(true)}
              >
                Trigger Confirm Dialog
              </Button>
            </Tooltip>

            <Button
              variant="danger"
              size="sm"
              onClick={() => setDangerConfirmOpen(true)}
            >
              Trigger Danger Dialog
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={() => setDrawerOpen(true)}
            >
              Open 480px Drawer
            </Button>
          </div>

          {/* Skeletons Preview */}
          <div className="space-y-2 pt-4 border-t border-border">
            <p className="text-xs text-text-faint uppercase font-mono">Card Skeletons</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-surface-2 border border-border space-y-3">
                <Skeleton className="aspect-video w-full rounded" />
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
              <div className="p-4 rounded-lg bg-surface-2 border border-border space-y-3">
                <Skeleton className="aspect-video w-full rounded" />
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
              <div className="p-4 rounded-lg bg-surface-2 border border-border space-y-3">
                <Skeleton className="aspect-video w-full rounded" />
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            </div>
          </div>

          {/* EmptyState Preview */}
          <div className="pt-4 border-t border-border">
            <p className="text-xs text-text-faint uppercase font-mono mb-4">Empty State</p>
            <EmptyState
              icon={FolderPlus}
              title="No projects uploaded yet"
              description="Upload your first cut. Nothing is shared until you create a link."
              actionLabel="New upload"
              onAction={() => alert("Upload triggered")}
            />
          </div>
        </div>
      </section>

      {/* Confirm Dialog Instance (Standard) */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Release the full-quality video?"
        description="Rahul – Wedding Reel will be able to download the original file. This can't be undone, but you can still revoke the link afterwards."
        confirmLabel="Yes, release"
        onConfirm={() => {
          setConfirmOpen(false);
          alert("Full file released");
        }}
      />

      {/* Confirm Dialog Instance (Danger) */}
      <ConfirmDialog
        open={dangerConfirmOpen}
        onOpenChange={setDangerConfirmOpen}
        title="Delete project permanently?"
        description="This will delete the original file from Google Drive and all generated preview renditions. This action cannot be reversed."
        confirmLabel="Delete project"
        variant="danger"
        onConfirm={() => {
          setDangerConfirmOpen(false);
          alert("Project deleted");
        }}
      />

      {/* Drawer Instance */}
      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Create Share Link"
        description="Set preview boundaries and access control."
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDrawerOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setDrawerOpen(false);
                alert("Link created successfully");
              }}
            >
              Create link
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <Input
            label="Who is this for"
            placeholder="e.g. Rahul – Wedding Reel"
          />
          <div>
            <label className="text-xs font-medium text-text-muted mb-2 block">
              Preview range
            </label>
            <TimelineRangeSelector
              totalDurationSeconds={252}
              startSeconds={rangeStart}
              endSeconds={rangeEnd}
              onChange={(s, e) => {
                setRangeStart(s);
                setRangeEnd(e);
              }}
            />
          </div>
          <Input
            label="Passcode (Optional)"
            placeholder="Leave empty for public link"
          />
          <Switch
            label="Allow preview download"
            description="Only the watermarked preview can be downloaded."
            checked={true}
          />
        </div>
      </Drawer>
    </div>
  );
}
