"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Hls from "hls.js";
import {
  KeyRound,
  Loader2,
  UsersRound,
  Clock,
  Ban,
  SearchX,
  BadgeCheck,
  Download,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Lock,
  RotateCcw,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { Timecode } from "@/components/ui/timecode";
import { formatBytes, formatTimecode } from "@/lib/format";
import { cn } from "@/lib/utils";

type ViewerState =
  | "loading"
  | "passcode"
  | "not_ready"
  | "viewers_exhausted"
  | "expired"
  | "revoked"
  | "not_found"
  | "unlocked"
  | "error"
  | "ready";

interface LinkMeta {
  id: string;
  slug: string;
  clientLabel: string;
  isPrivate: boolean;
  previewStart: number;
  previewEnd: number;
  previewDuration: number;
  allowPreviewDownload: boolean;
  watermarkText: string;
  status: string;
  unlockedAt: string | null;
  videoTitle: string;
  totalDurationSeconds: number;
  width: number;
  height: number;
  isReady: boolean;
}

export default function ClientViewerPage() {
  const params = useParams();
  const slug = (params?.slug as string) || "";

  // Page state
  const [meta, setMeta] = React.useState<LinkMeta | null>(null);
  const [viewerState, setViewerState] = React.useState<ViewerState>("loading");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Passcode modal state
  const [passcode, setPasscode] = React.useState("");
  const [passcodeShake, setPasscodeShake] = React.useState(false);
  const [isVerifyingPasscode, setIsVerifyingPasscode] = React.useState(false);

  // Active stream playback state
  const [streamToken, setStreamToken] = React.useState<string | null>(null);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [playlistUrl, setPlaylistUrl] = React.useState<string | null>(null);

  // Player controls
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const playerContainerRef = React.useRef<HTMLDivElement | null>(null);
  const hlsRef = React.useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [bufferedTime, setBufferedTime] = React.useState(0);
  const [duration, setDuration] = React.useState(30);
  const [isMuted, setIsMuted] = React.useState(false);
  const [showControls, setShowControls] = React.useState(true);
  const [showEndCard, setShowEndCard] = React.useState(false);
  const [streamError, setStreamError] = React.useState<string | null>(null);

  // DOM Drifting Watermark timestamp (updated every 30s)
  const [driftTimestamp, setDriftTimestamp] = React.useState(
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );

  // Original video download state (CHUNK B6 + F6)
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);

  const handleDownloadOriginal = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch(`/api/v/${slug}/download-token`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json.ok || !json.data?.downloadToken) {
        setDownloadError(
          json.error?.message || "Failed to generate download token"
        );
        setIsDownloading(false);
        return;
      }

      const token = json.data.downloadToken;
      const downloadUrl = `/api/v/${slug}/download?d=${encodeURIComponent(token)}`;
      window.location.href = downloadUrl;
      setTimeout(() => {
        setIsDownloading(false);
      }, 3000);
    } catch {
      setDownloadError("Download request failed. Please try again.");
      setIsDownloading(false);
    }
  };

  // 1. Initial Link Fetch
  const fetchLinkMeta = React.useCallback(async () => {
    if (!slug) return;
    try {
      const res = await fetch(`/api/v/${slug}`);
      const json = await res.json();

      if (!json.ok) {
        if (json.error?.code === "NOT_FOUND") {
          setViewerState("not_found");
        } else {
          setViewerState("revoked");
        }
        return;
      }

      const data: LinkMeta = json.data;
      setMeta(data);
      setDuration(data.previewDuration || 30);

      // Map link status to viewer states (DESIGN §6.9)
      if (data.status === "unlocked") {
        setViewerState("unlocked");
      } else if (data.status === "revoked") {
        setViewerState("revoked");
      } else if (data.status === "expired") {
        setViewerState("expired");
      } else if (data.status === "viewers_exhausted") {
        setViewerState("viewers_exhausted");
      } else if (!data.isReady) {
        setViewerState("not_ready");
      } else if (data.isPrivate) {
        // Automatically attempt open in case viewer already holds valid cookie
        attemptOpen("");
      } else {
        // Public link: claim slot immediately
        attemptOpen("");
      }
    } catch {
      setViewerState("not_found");
    }
  }, [slug]);

  React.useEffect(() => {
    fetchLinkMeta();
  }, [fetchLinkMeta]);

  // Auto-poll metadata every 2.5s while preview is preparing so client never gets stuck
  React.useEffect(() => {
    if (viewerState !== "not_ready") return;
    const interval = setInterval(() => {
      fetchLinkMeta();
    }, 2500);
    return () => clearInterval(interval);
  }, [viewerState, fetchLinkMeta]);

  // 2. Open / Claim Slot Request
  const attemptOpen = async (codeToSubmit: string) => {
    setIsVerifyingPasscode(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/v/${slug}/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: codeToSubmit || undefined }),
      });

      const json = await res.json();

      if (json.ok && json.data) {
        setStreamToken(json.data.streamToken);
        setSessionId(json.data.sessionId);
        setPlaylistUrl(json.data.playlistUrl);
        setViewerState("ready");
      } else {
        const errCode = json.error?.code;
        if (errCode === "PASSCODE_REQUIRED" || errCode === "PASSCODE_WRONG") {
          setViewerState("passcode");
          if (errCode === "PASSCODE_WRONG") {
            setErrorMsg("That passcode isn't right.");
            triggerShake();
          }
        } else if (errCode === "RATE_LIMITED") {
          setViewerState("passcode");
          setErrorMsg(json.error?.message || "Too many attempts. Please try again later.");
          triggerShake();
        } else if (errCode === "VIEWERS_EXHAUSTED") {
          setViewerState("viewers_exhausted");
        } else if (errCode === "LINK_EXPIRED") {
          setViewerState("expired");
        } else if (errCode === "LINK_REVOKED") {
          setViewerState("revoked");
        } else {
          const message = json.error?.message || "Unable to access video.";
          setErrorMsg(message);
          if (!codeToSubmit && viewerState !== "passcode") {
            setViewerState("error");
          }
        }
      }
    } catch {
      const message = "Connection error. Please try again.";
      setErrorMsg(message);
      if (!codeToSubmit && viewerState !== "passcode") {
        setViewerState("error");
      }
    } finally {
      setIsVerifyingPasscode(false);
    }
  };

  const triggerShake = () => {
    setPasscodeShake(true);
    setTimeout(() => setPasscodeShake(false), 360);
  };

  // 3. Token Rotation Every 40 Seconds (CONTRACT §6 & DESIGN §6.9)
  React.useEffect(() => {
    if (viewerState !== "ready" || !sessionId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/v/${slug}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const json = await res.json();
        if (json.ok && json.data?.streamToken) {
          setStreamToken(json.data.streamToken);
        } else {
          // Token refresh failed (e.g. revoked mid-playback)
          if (json.error?.code === "LINK_REVOKED") {
            setViewerState("revoked");
          }
        }
      } catch (err) {
        console.warn("[Viewer] Token rotation notice:", err);
      }
    }, 40 * 1000);

    return () => clearInterval(interval);
  }, [viewerState, sessionId, slug]);

  // 4. Update drift timestamp periodically
  React.useEffect(() => {
    const driftInterval = setInterval(() => {
      setDriftTimestamp(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    }, 30 * 1000);
    return () => clearInterval(driftInterval);
  }, []);

  // 5. Initialize HLS.js Player
  React.useEffect(() => {
    if (viewerState !== "ready" || !playlistUrl || !videoRef.current) return;

    const video = videoRef.current;

    if (Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
      });

      hlsRef.current = hls;
      hls.loadSource(playlistUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setStreamError("Unable to load video stream. The server may still be preparing the preview.");
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native Safari HLS
      video.src = playlistUrl;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [viewerState, playlistUrl]);

  // 6. Keyboard Shortcuts: Space/K (play/pause), Left/Right (seek), F (fullscreen), M (mute)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewerState !== "ready") return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if (e.code === "Space" || e.key === "k" || e.key === "K") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        seekDelta(-5);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        seekDelta(5);
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        toggleMute();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewerState]);

  // 7. Auto-hide controls after 2.5s idle (DESIGN §6.9)
  const controlsTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2500);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (showEndCard) {
      setShowEndCard(false);
      videoRef.current.currentTime = 0;
      videoRef.current.play();
      setIsPlaying(true);
      return;
    }

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

  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      playerContainerRef.current.requestFullscreen();
    }
  };

  const seekDelta = (seconds: number) => {
    if (!videoRef.current) return;
    const newTime = Math.max(0, Math.min(videoRef.current.currentTime + seconds, duration));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    setCurrentTime(cur);

    // Buffer tracking
    if (videoRef.current.buffered.length > 0) {
      setBufferedTime(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
    }

    // Check end of preview cut
    if (cur >= duration) {
      videoRef.current.pause();
      setIsPlaying(false);
      setShowEndCard(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
  };

  // ===========================================================================
  // RENDER VIEWER STATES (DESIGN §6.9)
  // ===========================================================================

  const renderTopBar = () => (
    <header className="h-14 border-b border-border/80 bg-surface-1 px-4 md:px-8 flex items-center justify-between select-none">
      <Logo />
      {meta && (
        <span className="text-xs font-mono text-text-muted">
          Shared by {meta.clientLabel || "Editor"}
        </span>
      )}
    </header>
  );

  // 1. Loading State
  if (viewerState === "loading") {
    return (
      <div className="min-h-screen bg-bg text-text flex flex-col">
        {renderTopBar()}
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-[440px] space-y-4">
            <Skeleton className="aspect-video w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4 mx-auto rounded" />
            <Skeleton className="h-3 w-1/2 mx-auto rounded" />
          </div>
        </main>
      </div>
    );
  }

  // 2. Passcode Modal State (DESIGN §6.9)
  if (viewerState === "passcode") {
    return (
      <div className="min-h-screen bg-bg text-text flex flex-col">
        {renderTopBar()}
        <main className="flex-1 flex items-center justify-center p-4">
          <div
            className={cn(
              "w-full max-w-[440px] rounded-lg bg-surface-1 border border-border p-8 shadow-2xl text-center space-y-6",
              passcodeShake && "animate-[shake_360ms_ease-in-out]"
            )}
          >
            <div className="w-12 h-12 rounded-full bg-accent-soft text-accent flex items-center justify-center mx-auto">
              <KeyRound className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h1 className="font-display text-lg font-semibold text-text">
                This video is private
              </h1>
              <p className="text-xs text-text-muted">
                Enter the passcode provided by the editor to access this preview.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                attemptOpen(passcode.trim());
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <input
                  type="text"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value.toUpperCase())}
                  placeholder="PASSCODE"
                  maxLength={8}
                  autoFocus
                  className={cn(
                    "h-12 w-full text-center font-mono text-lg font-bold tracking-[0.3em] uppercase rounded-md bg-surface-2 border border-border text-text",
                    "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all",
                    errorMsg && "border-danger focus:border-danger focus:ring-danger/20"
                  )}
                />
                {errorMsg && (
                  <p className="text-xs text-danger font-medium text-center">
                    {errorMsg}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={isVerifyingPasscode}
                disabled={!passcode.trim()}
                className="w-full"
              >
                Continue
              </Button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  // 3. Preview Not Ready (Auto-polling)
  if (viewerState === "not_ready") {
    return (
      <div className="min-h-screen bg-bg text-text flex flex-col">
        {renderTopBar()}
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-[440px] rounded-lg bg-surface-1 border border-border p-8 shadow-2xl text-center space-y-4">
            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto" />
            <h1 className="font-display text-base font-semibold text-text">
              Preparing your preview
            </h1>
            <p className="text-xs text-text-muted">
              This usually takes a minute. The preview will load automatically.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // 4. Viewer Limit Reached
  if (viewerState === "viewers_exhausted") {
    return (
      <div className="min-h-screen bg-bg text-text flex flex-col">
        {renderTopBar()}
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-[440px] rounded-lg bg-surface-1 border border-border p-8 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-surface-2 text-text-muted flex items-center justify-center mx-auto">
              <UsersRound className="w-6 h-6" />
            </div>
            <h1 className="font-display text-base font-semibold text-text">
              This link has reached its viewer limit
            </h1>
            <p className="text-xs text-text-muted">
              Ask {meta?.clientLabel || "the editor"} for a new link.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // 5. Expired
  if (viewerState === "expired") {
    return (
      <div className="min-h-screen bg-bg text-text flex flex-col">
        {renderTopBar()}
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-[440px] rounded-lg bg-surface-1 border border-border p-8 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-surface-2 text-text-muted flex items-center justify-center mx-auto">
              <Clock className="w-6 h-6" />
            </div>
            <h1 className="font-display text-base font-semibold text-text">
              This link has expired
            </h1>
            <p className="text-xs text-text-muted">
              Ask {meta?.clientLabel || "the editor"} for a new link.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // 6. Revoked
  if (viewerState === "revoked") {
    return (
      <div className="min-h-screen bg-bg text-text flex flex-col">
        {renderTopBar()}
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-[440px] rounded-lg bg-surface-1 border border-border p-8 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-danger-soft text-danger flex items-center justify-center mx-auto">
              <Ban className="w-6 h-6" />
            </div>
            <h1 className="font-display text-base font-semibold text-text">
              This link is no longer available
            </h1>
            <p className="text-xs text-text-muted">
              The editor has disabled or revoked access to this video.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // 7. Not Found
  if (viewerState === "not_found") {
    return (
      <div className="min-h-screen bg-bg text-text flex flex-col">
        {renderTopBar()}
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-[440px] rounded-lg bg-surface-1 border border-border p-8 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-surface-2 text-text-muted flex items-center justify-center mx-auto">
              <SearchX className="w-6 h-6" />
            </div>
            <h1 className="font-display text-base font-semibold text-text">
              We can&apos;t find that link
            </h1>
            <p className="text-xs text-text-muted">
              Check the address in your browser or ask the editor for a new link.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // 8. Unlocked State (Success card — Original ready for live download)
  if (viewerState === "unlocked") {
    return (
      <div className="min-h-screen bg-bg text-text flex flex-col">
        {renderTopBar()}
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-[480px] rounded-lg bg-surface-1 border border-border p-8 shadow-2xl text-center space-y-6">
            <div className="w-14 h-14 rounded-full bg-success-soft text-success flex items-center justify-center mx-auto">
              <BadgeCheck className="w-8 h-8 stroke-[2.5]" />
            </div>

            <div className="space-y-1.5">
              <h1 className="font-display text-xl font-semibold text-text">
                Your video is ready
              </h1>
              <p className="text-xs text-text-muted">
                Original full quality release · Uncompressed master
              </p>
            </div>

            <div className="p-4 rounded-lg bg-surface-2 border border-border text-left text-xs font-mono space-y-2">
              <div className="flex justify-between text-text-muted">
                <span>File</span>
                <span className="text-text font-semibold truncate max-w-[220px]">
                  {meta?.videoTitle}
                </span>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Duration</span>
                <span className="text-text">
                  <Timecode seconds={meta?.totalDurationSeconds || 0} />
                </span>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Resolution</span>
                <span className="text-text">{meta?.width}×{meta?.height}</span>
              </div>
            </div>

            {downloadError && (
              <p className="text-xs text-danger font-medium text-center">
                {downloadError}
              </p>
            )}

            <Button
              variant="primary"
              size="lg"
              loading={isDownloading}
              onClick={handleDownloadOriginal}
              className="w-full gap-2 text-sm font-semibold"
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              {isDownloading ? "Streaming master file..." : "Download full video"}
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // 8. Error State (with Retry action)
  if (viewerState === "error") {
    return (
      <div className="min-h-screen bg-bg text-text flex flex-col select-none">
        {renderTopBar()}
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-[440px] rounded-lg bg-surface-1 border border-border p-8 shadow-2xl text-center space-y-6 animate-in fade-in duration-base">
            <div className="w-12 h-12 rounded-full bg-danger-soft text-danger flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6 stroke-[2.5]" />
            </div>

            <div className="space-y-1.5">
              <h1 className="font-display text-lg font-semibold text-text">
                Unable to load preview
              </h1>
              <p className="text-xs text-text-muted">
                {errorMsg || "The video could not be loaded at this time. Please check your connection and try again."}
              </p>
            </div>

            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                setViewerState("loading");
                setErrorMsg(null);
                fetchLinkMeta();
              }}
              className="w-full gap-2 text-sm font-semibold"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // 9. READY / PLAYING PLAYER (DESIGN §6.9)
  const playedPercent = Math.min(100, (currentTime / (duration || 1)) * 100);
  const bufferedPercent = Math.min(100, (bufferedTime / (duration || 1)) * 100);

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col select-none">
      {renderTopBar()}

      <main className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6 md:p-8 max-w-5xl mx-auto w-full">
        {/* 16:9 Custom Player Container (DESIGN §6.9: Custom controls, no native video controls) */}
        <div
          ref={playerContainerRef}
          onMouseMove={handleMouseMove}
          onContextMenu={(e) => e.preventDefault()}
          className="relative aspect-video w-full rounded-lg overflow-hidden bg-black border border-border shadow-2xl group"
        >
          {/* HTML5 Video element with nodownload and disablePictureInPicture */}
          <video
            ref={videoRef}
            onTimeUpdate={handleTimeUpdate}
            controlsList="nodownload"
            disablePictureInPicture
            playsInline
            className="w-full h-full object-contain cursor-pointer"
            onClick={togglePlay}
          />

          {/* Big Centered Play Button (Soft pulse on idle before playback starts) */}
          {!isPlaying && !showEndCard && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <button
                type="button"
                onClick={togglePlay}
                aria-label="Play video"
                className="pointer-events-auto flex items-center justify-center w-16 h-16 rounded-full bg-accent text-bg shadow-xl hover:scale-105 active:scale-95 transition-transform"
              >
                <Play className="w-7 h-7 fill-current ml-1" />
              </button>
            </div>
          )}

          {/* Burned-in Watermark DOM Overlay (DESIGN §6.9: 12% opacity drifting tag) */}
          <div
            className="absolute top-6 left-6 pointer-events-none text-[11px] font-mono text-text opacity-12 tracking-wider animate-[drift_20s_infinite_alternate]"
            aria-hidden="true"
          >
            <span>{sessionId?.slice(0, 8)} · {driftTimestamp}</span>
          </div>

          {/* Locked End Card Overlay (Fades in when preview ends) */}
          {showEndCard && (
            <div className="absolute inset-0 z-20 bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center space-y-4 animate-in fade-in duration-base">
              <div className="w-12 h-12 rounded-full bg-surface-2 text-accent flex items-center justify-center">
                <Lock className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-base font-semibold text-text">
                  That&apos;s the end of the preview.
                </h3>
                <p className="text-xs text-text-muted">
                  The full video is released by the editor after payment.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={togglePlay}
                className="gap-1.5 text-xs text-text hover:text-accent"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Watch again
              </Button>
            </div>
          )}

          {/* Stream Error Recovery Overlay */}
          {streamError && (
            <div className="absolute inset-0 z-30 bg-black/90 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center space-y-4 animate-in fade-in duration-base">
              <div className="w-12 h-12 rounded-full bg-danger-soft text-danger flex items-center justify-center">
                <AlertCircle className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-base font-semibold text-text">
                  Stream Interrupted
                </h3>
                <p className="text-xs text-text-muted max-w-sm">
                  {streamError}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setStreamError(null);
                  if (playlistUrl && videoRef.current && hlsRef.current) {
                    hlsRef.current.loadSource(playlistUrl);
                    hlsRef.current.attachMedia(videoRef.current);
                  } else {
                    attemptOpen("");
                  }
                }}
                className="gap-1.5 text-xs font-semibold"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload stream
              </Button>
            </div>
          )}

          {/* Custom Bottom Control Bar (auto-hides after 2.5s idle) */}
          <div
            className={cn(
              "absolute bottom-0 inset-x-0 z-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 pt-6 flex flex-col gap-2 transition-opacity duration-fast",
              showControls ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
          >
            {/* Custom Scrub bar with terminal Lock icon */}
            <div className="relative flex items-center group/scrub">
              <div className="relative w-full h-1 group-hover/scrub:h-2 bg-surface-3 rounded cursor-pointer overflow-hidden transition-all">
                {/* Buffered bar */}
                <div
                  className="absolute left-0 top-0 bottom-0 bg-surface-2"
                  style={{ width: `${bufferedPercent}%` }}
                />
                {/* Played bar */}
                <div
                  className="absolute left-0 top-0 bottom-0 bg-accent"
                  style={{ width: `${playedPercent}%` }}
                />
              </div>

              {/* Native range input overlay for seamless scrub interaction */}
              <input
                type="range"
                min={0}
                max={duration || 30}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                aria-label="Seek preview"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />

              {/* Lock icon situated at terminal right edge */}
              <div
                className="absolute right-0 top-1/2 -translate-y-1/2 text-accent p-0.5 pointer-events-none"
                title="Preview locked barrier"
              >
                <Lock className="w-3 h-3 stroke-[2.5]" />
              </div>
            </div>

            {/* Bottom Controls Row */}
            <div className="flex items-center justify-between text-xs text-text select-none">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="p-1 rounded text-text hover:text-accent transition-colors"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={toggleMute}
                  className="p-1 rounded text-text-muted hover:text-text transition-colors"
                  aria-label={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>

                <div className="font-mono text-[11px] tabular-nums text-text-muted">
                  <Timecode seconds={currentTime} /> / <Timecode seconds={duration} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <StatusPill status="live" label="PREVIEW" />

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="p-1 rounded text-text-muted hover:text-text transition-colors"
                  aria-label="Fullscreen"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Video Title & Preview Disclaimer (DESIGN §6.9) */}
        <div className="w-full mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="font-display font-semibold text-base text-text">
              {meta?.videoTitle}
            </h1>
            <p className="text-xs text-text-muted">
              {meta?.previewDuration && meta?.totalDurationSeconds && meta.previewDuration >= meta.totalDurationSeconds
                ? `Watermarked preview · Full video (${formatTimecode(meta.totalDurationSeconds)})`
                : `Preview only · ${formatTimecode(meta?.previewDuration || 30)} of ${formatTimecode(meta?.totalDurationSeconds || 0)}`}
            </p>
          </div>

          {meta?.allowPreviewDownload && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                window.location.href = `/api/v/${slug}/preview-download`;
              }}
              className="gap-1.5 shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Download preview (watermarked)
            </Button>
          )}
        </div>

        <div className="w-full mt-6 p-4 rounded-lg bg-surface-1 border border-border/60 text-xs text-text-muted">
          &ldquo;The full-quality video is released by the editor after payment.&rdquo;
        </div>
      </main>
    </div>
  );
}
