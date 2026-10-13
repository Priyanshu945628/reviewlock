"use client";

import * as React from "react";
import {
  X,
  Lock,
  Globe,
  KeyRound,
  Eye,
  EyeOff,
  Sparkles,
  Minus,
  Plus,
  Clock,
  Download,
  Check,
  Film,
  Copy,
  ExternalLink,
} from "lucide-react";
import {
  Drawer,
  Button,
  Input,
  Select,
  Switch,
  CopyLinkButton,
  TimelineRangeSelector,
} from "@/components/ui";
import { formatTimecode } from "@/lib/format";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface ShareLinkData {
  id?: string;
  projectId?: string;
  slug?: string;
  clientLabel?: string;
  visibility?: "private" | "public";
  previewMode?: string;
  previewStart?: number;
  previewEnd?: number;
  maxViewers?: number;
  viewersUsed?: number;
  allowPreviewDownload?: boolean;
  watermarkText?: string;
  expiresAt?: string | null;
  status?: string;
  unlockedAt?: string | null;
  createdAt?: string;
}

export interface ShareLinkDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectDurationSeconds: number;
  initialLink?: ShareLinkData | null;
  onSuccess?: (createdOrUpdatedLink: any) => void;
}

export function ShareLinkDrawer({
  open,
  onOpenChange,
  projectId,
  projectDurationSeconds,
  initialLink,
  onSuccess,
}: ShareLinkDrawerProps) {
  const isEditMode = !!initialLink;

  // Form states
  const [clientLabel, setClientLabel] = React.useState("");
  const [previewStart, setPreviewStart] = React.useState(0);
  const [previewEnd, setPreviewEnd] = React.useState(30);
  const [visibility, setVisibility] = React.useState<"private" | "public">("private");
  const [passcode, setPasscode] = React.useState("");
  const [showPasscode, setShowPasscode] = React.useState(false);
  const [maxViewers, setMaxViewers] = React.useState(1);
  const [expiryOption, setExpiryOption] = React.useState("never");
  const [customExpiryHours, setCustomExpiryHours] = React.useState(24);
  const [allowPreviewDownload, setAllowPreviewDownload] = React.useState(false);
  const [watermarkText, setWatermarkText] = React.useState("PREVIEW · NOT PAID");

  // Submission state
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Success state screen (DESIGN §6.6)
  const [createdLink, setCreatedLink] = React.useState<any | null>(null);

  // Initialize or reset form values
  React.useEffect(() => {
    if (open) {
      setError(null);
      setCreatedLink(null);
      if (initialLink) {
        setClientLabel(initialLink.clientLabel || "");
        setPreviewStart(initialLink.previewStart || 0);
        setPreviewEnd(initialLink.previewEnd || Math.min(30, projectDurationSeconds || 30));
        setVisibility(initialLink.visibility || "private");
        setPasscode("");
        setMaxViewers(initialLink.maxViewers || 1);
        setAllowPreviewDownload(initialLink.allowPreviewDownload || false);
        setWatermarkText(initialLink.watermarkText || "PREVIEW · NOT PAID");
        if (!initialLink.expiresAt) {
          setExpiryOption("never");
        } else {
          setExpiryOption("custom");
        }
      } else {
        setClientLabel("");
        setPreviewStart(0);
        setPreviewEnd(Math.min(30, projectDurationSeconds || 30));
        setVisibility("private");
        setPasscode(generateRandomPasscode());
        setMaxViewers(1);
        setExpiryOption("never");
        setAllowPreviewDownload(false);
        setWatermarkText("PREVIEW · NOT PAID");
      }
    }
  }, [open, initialLink, projectDurationSeconds]);

  // Generate 6-char passcode helper (DESIGN §6.6)
  function generateRandomPasscode(): string {
    const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // exclude easily confused 0/O, 1/I
    let res = "";
    for (let i = 0; i < 6; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  }

  // Calculate effective expiresAt date
  const computeExpiresAt = (): string | null => {
    const now = new Date();
    if (expiryOption === "1h") {
      return new Date(now.getTime() + 1 * 3600 * 1000).toISOString();
    }
    if (expiryOption === "24h") {
      return new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
    }
    if (expiryOption === "7d") {
      return new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();
    }
    if (expiryOption === "custom") {
      return new Date(now.getTime() + (customExpiryHours || 24) * 3600 * 1000).toISOString();
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (isEditMode && initialLink) {
        // Update link
        const res = await fetch(`/api/links/${initialLink.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientLabel,
            visibility,
            passcode: visibility === "private" && passcode ? passcode : undefined,
            previewStart,
            previewEnd,
            maxViewers,
            allowPreviewDownload,
            watermarkText,
            expiresAt: computeExpiresAt(),
          }),
        });
        const json = await res.json();
        if (json.ok && json.data?.link) {
          onSuccess?.(json.data.link);
          onOpenChange(false);
        } else {
          setError(json.error?.message || "Failed to update share link.");
        }
      } else {
        // Create link
        const res = await fetch(`/api/projects/${projectId}/links`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientLabel: clientLabel || "Client Link",
            visibility,
            passcode: visibility === "private" ? passcode : undefined,
            previewStart,
            previewEnd,
            maxViewers,
            allowPreviewDownload,
            watermarkText,
            expiresAt: computeExpiresAt(),
          }),
        });
        const json = await res.json();
        if (json.ok && json.data?.link) {
          setCreatedLink(json.data.link);
          onSuccess?.(json.data.link);
        } else {
          setError(json.error?.message || "Failed to create share link.");
        }
      }
    } catch {
      setError("An unexpected network error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const fullUrl = createdLink
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/v/${createdLink.slug}`
    : "";

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={createdLink ? "Share link created" : isEditMode ? "Edit share link" : "Create share link"}
      description={
        createdLink
          ? "Your secure locked preview is ready to share."
          : "Control client access, preview range, and watermarking."
      }
    >
      {/* 1. SUCCESS SCREEN (DESIGN §6.6: Amber check draw-in animation, no confetti) */}
      {createdLink ? (
        <div className="p-6 flex flex-col items-center text-center space-y-6 animate-in fade-in zoom-in-95 duration-base">
          {/* Subtle amber check draw-in icon */}
          <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-accent-soft border border-accent/30 text-accent">
            <svg
              className="w-8 h-8 stroke-accent"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path
                d="M5 13l4 4L19 7"
                className="animate-[drawCheck_360ms_ease-out_forwards]"
                style={{
                  strokeDasharray: 24,
                  strokeDashoffset: 0,
                }}
              />
            </svg>
          </div>

          <div className="space-y-1">
            <h2 className="font-display text-lg font-semibold text-text">
              Link is ready for {createdLink.clientLabel}
            </h2>
            <p className="text-xs text-text-muted">
              Client can view only the watermarked preview. Full download remains locked.
            </p>
          </div>

          {/* Copy link box */}
          <div className="w-full space-y-2">
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface-2 border border-border">
              <span className="font-mono text-xs text-text truncate max-w-[280px]">
                {fullUrl}
              </span>
              <CopyLinkButton url={fullUrl} displayUrl="Copy link" />
            </div>

            {/* Passcode row (if private) */}
            {createdLink.visibility === "private" && passcode && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-surface-2 border border-border">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-accent" />
                  <span className="text-xs text-text-muted">Passcode:</span>
                  <span className="font-mono text-sm font-bold tracking-widest text-accent">
                    {passcode}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(passcode);
                  }}
                  title="Copy passcode"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span className="ml-1 text-xs">Copy</span>
                </Button>
              </div>
            )}
          </div>

          {/* Summary stats */}
          <div className="w-full rounded-lg bg-surface-2/60 border border-border/60 p-4 space-y-2 text-left text-xs">
            <div className="flex justify-between text-text-muted font-mono">
              <span>Preview range</span>
              <span className="text-text">
                {formatTimecode(createdLink.previewStart)} → {formatTimecode(createdLink.previewEnd)}
              </span>
            </div>
            <div className="flex justify-between text-text-muted font-mono">
              <span>Viewer slot</span>
              <span className="text-text">{createdLink.maxViewers} viewer</span>
            </div>
            <div className="flex justify-between text-text-muted font-mono">
              <span>Watermark</span>
              <span className="text-text">{createdLink.watermarkText}</span>
            </div>
          </div>

          <div className="w-full pt-4">
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          </div>
        </div>
      ) : (
        /* 2. FORM BODY (DESIGN §6.6: Sections separated by 1px borders and 24px gaps) */
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {error && (
              <div className="p-3 rounded-md bg-danger-soft border border-danger/40 text-xs text-danger">
                {error}
              </div>
            )}

            {/* Section 1: Who is this for */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-text uppercase tracking-wider font-mono">
                1. Who is this for
              </label>
              <Input
                value={clientLabel}
                onChange={(e) => setClientLabel(e.target.value)}
                placeholder="e.g. Rahul – Wedding Reel"
                required
              />
            </div>

            <div className="border-t border-border/80" />

            {/* Section 2: Preview range (TimelineRangeSelector) */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-text uppercase tracking-wider font-mono">
                2. Preview range
              </label>
              <TimelineRangeSelector
                totalDurationSeconds={projectDurationSeconds || 60}
                startSeconds={previewStart}
                endSeconds={previewEnd}
                onChange={(s, e) => {
                  setPreviewStart(s);
                  setPreviewEnd(e);
                }}
              />
            </div>

            <div className="border-t border-border/80" />

            {/* Section 3: Access (Segmented control) */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-text uppercase tracking-wider font-mono">
                3. Access Control
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-surface-2 border border-border">
                <button
                  type="button"
                  onClick={() => setVisibility("private")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                    visibility === "private"
                      ? "bg-surface-3 text-text shadow-xs"
                      : "text-text-muted hover:text-text"
                  )}
                >
                  <Lock className="w-3.5 h-3.5 text-accent" />
                  Private (passcode)
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility("public")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                    visibility === "public"
                      ? "bg-surface-3 text-text shadow-xs"
                      : "text-text-muted hover:text-text"
                  )}
                >
                  <Globe className="w-3.5 h-3.5" />
                  Public (anyone)
                </button>
              </div>

              {visibility === "private" && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showPasscode ? "text" : "password"}
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value.toUpperCase())}
                        placeholder="6-char passcode"
                        maxLength={8}
                        className="font-mono tracking-widest uppercase pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasscode(!showPasscode)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
                        title={showPasscode ? "Hide" : "Show"}
                      >
                        {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      onClick={() => setPasscode(generateRandomPasscode())}
                      className="gap-1.5 shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-accent" />
                      Generate
                    </Button>
                  </div>
                  <p className="text-[11px] text-text-muted">
                    Client must enter this passcode before playback begins.
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-border/80" />

            {/* Section 4: Viewer limit (Stepper − 1 +) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-text uppercase tracking-wider font-mono">
                4. Viewer limit
              </label>
              <div className="flex items-center gap-3">
                <div className="flex items-center rounded-md border border-border bg-surface-2 p-1">
                  <button
                    type="button"
                    onClick={() => setMaxViewers(Math.max(1, maxViewers - 1))}
                    disabled={maxViewers <= 1}
                    className="p-1.5 rounded hover:bg-surface-3 disabled:opacity-40 transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono text-sm font-semibold w-12 text-center text-text tabular-nums">
                    {maxViewers}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMaxViewers(maxViewers + 1)}
                    className="p-1.5 rounded hover:bg-surface-3 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="text-xs text-text-muted">
                  Unique viewers who can open this link
                </span>
              </div>
            </div>

            <div className="border-t border-border/80" />

            {/* Section 5: Expiry (Select) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-text uppercase tracking-wider font-mono">
                5. Expiry
              </label>
              <Select
                value={expiryOption}
                onChange={(e) => setExpiryOption(e.target.value)}
              >
                <option value="never">Never expires</option>
                <option value="1h">1 hour</option>
                <option value="24h">24 hours</option>
                <option value="7d">7 days</option>
                <option value="custom">Custom hours</option>
              </Select>
              {expiryOption === "custom" && (
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    type="number"
                    min={1}
                    max={720}
                    value={customExpiryHours}
                    onChange={(e) => setCustomExpiryHours(parseInt(e.target.value, 10) || 24)}
                    className="w-24 font-mono text-xs"
                  />
                  <span className="text-xs text-text-muted">hours from now</span>
                </div>
              )}
            </div>

            <div className="border-t border-border/80" />

            {/* Section 6: Downloads */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-text uppercase tracking-wider font-mono">
                    6. Preview Download
                  </span>
                  <p className="text-xs text-text-muted mt-0.5">
                    Only the watermarked preview can be downloaded. Full video stays locked.
                  </p>
                </div>
                <Switch
                  checked={allowPreviewDownload}
                  onCheckedChange={setAllowPreviewDownload}
                />
              </div>
            </div>

            <div className="border-t border-border/80" />

            {/* Section 7: Watermark */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-text uppercase tracking-wider font-mono">
                7. Watermark Text
              </label>
              <Input
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                placeholder="PREVIEW · NOT PAID"
              />

              {/* Live Preview Thumbnail with Diagonal Watermark */}
              <div className="relative aspect-video max-w-[200px] rounded-md overflow-hidden bg-surface-2 border border-border flex items-center justify-center select-none shadow-xs">
                <Film className="w-8 h-8 text-text-faint" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none transform -rotate-25 scale-110">
                  <span className="font-mono text-[9px] font-bold tracking-widest text-text opacity-40 bg-black/40 px-1 py-0.5 rounded">
                    {watermarkText || "PREVIEW"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Drawer Footer */}
          <div className="px-6 py-4 border-t border-border bg-surface-1 flex items-center justify-end gap-3 shrink-0">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isSubmitting}
            >
              {isEditMode ? "Save changes" : "Create link"}
            </Button>
          </div>
        </form>
      )}
    </Drawer>
  );
}
