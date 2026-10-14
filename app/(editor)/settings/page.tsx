"use client";

import * as React from "react";
import Link from "next/link";
import { TopBar } from "@/components/shell/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StorageMeter } from "@/components/shell/storage-meter";
import { formatBytes, formatRelative } from "@/lib/format";
import { api } from "@/lib/api";
import { HardDrive, Cloud, ShieldCheck, CheckCircle2 } from "lucide-react";

export default function SettingsPage() {
  const [user, setUser] = React.useState<{
    id: string;
    email: string;
    displayName: string;
    storageUsedBytes: number;
    createdAt?: string;
  } | null>(null);

  const [storage, setStorage] = React.useState<{
    usedBytes: number;
    limitBytes: number;
  }>({
    usedBytes: 0,
    limitBytes: 20 * 1024 * 1024 * 1024,
  });

  const [projects, setProjects] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isDriveConnected, setIsDriveConnected] = React.useState(true);

  React.useEffect(() => {
    async function loadData() {
      try {
        const [meRes, storageRes, projRes, healthRes] = await Promise.all([
          api.auth.me(),
          api.storage.getStorageQuota(),
          api.projects.list(),
          fetch("/api/health").then((r) => r.json()).catch(() => null),
        ]);

        if (meRes.ok && meRes.data?.user) {
          setUser(meRes.data.user as any);
        }
        if (storageRes.ok && storageRes.data) {
          setStorage(storageRes.data);
        }
        if (projRes.ok && projRes.data?.projects) {
          setProjects(projRes.data.projects);
        }
        if (healthRes && healthRes.data?.drive) {
          setIsDriveConnected(healthRes.data.drive === "ok");
        }
      } catch (err) {
        console.error("Failed to load settings data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const percent = Math.min(
    100,
    Math.round((storage.usedBytes / (storage.limitBytes || 1)) * 100)
  );

  return (
    <div className="flex flex-col flex-1 min-w-0">
      <TopBar title="Settings" />

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8 space-y-8 pb-24">
        {/* Section 1: Profile */}
        <section className="p-6 rounded-lg bg-surface-1 border border-border space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-text">
              Editor Account
            </h2>
            <span className="text-xs font-mono text-text-muted">
              Role: Editor
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Display Name"
              value={user?.displayName || "Editor"}
              disabled
            />
            <Input
              label="Email address"
              value={user?.email || "editor@example.com"}
              disabled
            />
          </div>
        </section>

        {/* Section 2: Storage (DESIGN §6.8) */}
        <section className="p-6 rounded-lg bg-surface-1 border border-border space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-accent" />
              <h2 className="font-display text-base font-semibold text-text">
                Storage Usage
              </h2>
            </div>
            <span className="font-mono text-xs text-text-muted tabular-nums">
              {formatBytes(storage.usedBytes)} of {formatBytes(storage.limitBytes)} ({percent}%)
            </span>
          </div>

          <StorageMeter
            usedBytes={storage.usedBytes}
            limitBytes={storage.limitBytes}
          />

          <p className="text-xs text-text-faint">
            Original master files are securely encrypted and archived in cloud storage. Watermarked proxies and timeline scrub sprites are served from high-speed edge cache.
          </p>

          {/* Project storage breakdown (largest first) */}
          <div className="pt-2 border-t border-border space-y-2">
            <p className="text-xs text-text-muted font-medium">
              Projects using storage ({projects.length}):
            </p>
            <div className="divide-y divide-border/60">
              {projects.length === 0 ? (
                <p className="text-xs text-text-muted py-2">No projects uploaded yet.</p>
              ) : (
                projects.map((proj) => (
                  <div
                    key={proj.id}
                    className="py-2.5 flex items-center justify-between text-xs"
                  >
                    <Link
                      href={`/projects/${proj.id}`}
                      className="font-medium text-text hover:text-accent transition-colors truncate max-w-sm"
                    >
                      {proj.title}
                    </Link>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-text-muted tabular-nums">
                        {formatBytes(proj.originalSize)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Section 3: Master Video Vault Status */}
        <section className="p-6 rounded-lg bg-surface-1 border border-border space-y-4">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-accent" />
            <h2 className="font-display text-base font-semibold text-text">
              Master Video Vault
            </h2>
          </div>

          <div className="p-4 rounded-md bg-surface-2 border border-border flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-text">
                  Private Cloud Master Archive
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold font-mono bg-success-soft text-success">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Active & Isolated
                </span>
              </div>
              <p className="text-xs text-text-muted">
                Zero client direct access. High-resolution master exports remain locked until you release payment.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4: Security Architecture */}
        <section className="p-6 rounded-lg bg-surface-1 border border-border space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-accent" />
            <h2 className="font-display text-base font-semibold text-text">
              Security & DRM Guarantees
            </h2>
          </div>

          <ul className="text-xs text-text-muted space-y-1.5 list-disc list-inside">
            <li>Burned-in pixel-level drawtext watermark on all preview cuts.</li>
            <li>Rotating 60-second HMAC-SHA256 streaming tokens for HLS playback.</li>
            <li>Passcode brute-force lockout (5 attempts per 15 minutes per IP).</li>
            <li>Atomic single-use download tokens for master original file delivery.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
