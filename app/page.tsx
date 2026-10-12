"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Film, Download, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { TimelineHeroGraphic } from "@/components/shell/timeline-hero-graphic";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-text flex flex-col">
      {/* Top Navigation */}
      <header className="h-16 border-b border-border px-6 md:px-12 flex items-center justify-between sticky top-0 bg-bg/95 backdrop-blur-xs z-50">
        <Logo asLink href="/" />
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Log in
            </Button>
          </Link>
          <Link href="/signup">
            <Button variant="primary" size="sm">
              Start free
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section (DESIGN §6.1: Left-aligned, not centered) */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 md:px-12 py-12 md:py-20 space-y-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Hero Content */}
          <div className="lg:col-span-6 space-y-6 text-left">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-accent-soft border border-accent/30 text-accent font-mono text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              ORIGINAL FILES STAY PRIVATE
            </div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-[56px] font-semibold tracking-[-0.03em] leading-[1.08] text-text">
              Get paid before the client gets the file.
            </h1>

            <p className="text-base sm:text-lg text-text-muted max-w-lg leading-relaxed">
              Share a locked preview. Release the full-quality video when the
              payment lands. Your master original never leaves private storage.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link href="/signup">
                <Button variant="primary" size="lg" className="gap-2">
                  <span>Start free</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="secondary" size="lg">
                  See how it works
                </Button>
              </Link>
            </div>
          </div>

          {/* Right Hero Graphic */}
          <div className="lg:col-span-6 flex justify-center lg:justify-end">
            <TimelineHeroGraphic />
          </div>
        </div>

        {/* How It Works (DESIGN §6.1: 3 steps in one horizontal row with mono step numbers 01 02 03) */}
        <section className="space-y-8 pt-8 border-t border-border">
          <div className="space-y-1">
            <h2 className="font-display text-2xl font-semibold text-text">
              How ReviewLock works
            </h2>
            <p className="text-sm text-text-muted">
              Zero compression proxies sent to clients. Full uncompressed original unlocked on payment.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Step 1 */}
            <div className="p-6 rounded-lg bg-surface-1 border border-border flex flex-col justify-between gap-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-2xl font-bold text-accent tabular-nums">
                  01
                </span>
                <Film className="w-5 h-5 text-text-muted" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display font-semibold text-base text-text">
                  Upload your master cut
                </h3>
                <p className="text-xs text-text-muted leading-relaxed">
                  Upload your full-res ProRes, MP4, or MOV up to 5 GB. Stored securely in your private Google Drive.
                </p>
              </div>
              <div className="p-2.5 rounded bg-surface-2 border border-border font-mono text-[11px] text-text-muted">
                Private Drive storage ✓
              </div>
            </div>

            {/* Step 2 */}
            <div className="p-6 rounded-lg bg-surface-1 border border-border flex flex-col justify-between gap-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-2xl font-bold text-accent tabular-nums">
                  02
                </span>
                <ShieldCheck className="w-5 h-5 text-text-muted" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display font-semibold text-base text-text">
                  Share a locked preview
                </h3>
                <p className="text-xs text-text-muted leading-relaxed">
                  Choose the preview window (e.g. first 30 seconds). We burn in watermarks and restrict playback.
                </p>
              </div>
              <div className="p-2.5 rounded bg-surface-2 border border-border font-mono text-[11px] text-accent">
                0:00 → 0:30 · 1 viewer slot
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-6 rounded-lg bg-surface-1 border border-border flex flex-col justify-between gap-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-2xl font-bold text-accent tabular-nums">
                  03
                </span>
                <Download className="w-5 h-5 text-text-muted" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display font-semibold text-base text-text">
                  Release on payment
                </h3>
                <p className="text-xs text-text-muted leading-relaxed">
                  Once payment lands in your bank, click Release. Client receives a high-speed piped download of the original.
                </p>
              </div>
              <div className="p-2.5 rounded bg-surface-2 border border-border font-mono text-[11px] text-success">
                Full original released ✓
              </div>
            </div>
          </div>
        </section>

        {/* Trust Strip (DESIGN §6.1) */}
        <section className="p-6 md:p-8 rounded-lg bg-surface-1 border border-border space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-accent shrink-0" />
            <h3 className="text-sm font-semibold text-text">
              Your original never leaves private storage until you release it.
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs text-text-muted">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span>Server-side playback & viewer slot limits</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span>Burned-in watermark preview renditions</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span>Piped one-time verified download links</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="h-16 border-t border-border px-6 md:px-12 flex items-center justify-between text-xs text-text-faint">
        <span>© ReviewLock · Built for video editors and studios.</span>
        <div className="flex items-center gap-4">
          <Link href="/login" className="hover:text-text transition-colors">
            Editor Login
          </Link>
          <Link href="/dev/components" className="hover:text-text transition-colors">
            Component Showcase
          </Link>
        </div>
      </footer>
    </div>
  );
}
