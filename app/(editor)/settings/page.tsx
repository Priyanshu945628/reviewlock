"use client";

import * as React from "react";
import { TopBar } from "@/components/shell/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StorageMeter } from "@/components/shell/storage-meter";
import { formatBytes } from "@/lib/format";
import { MOCK_USER, MOCK_PROJECTS } from "@/lib/mocks/data";
import { Trash2 } from "lucide-react";

export default function SettingsPage() {
  const [displayName, setDisplayName] = React.useState(MOCK_USER.displayName);
  const [email] = React.useState(MOCK_USER.email);
  const [watermark, setWatermark] = React.useState("PREVIEW · NOT PAID");
  const [viewerLimit, setViewerLimit] = React.useState("1");
  const [previewLength, setPreviewLength] = React.useState("30");
  const [dirty, setDirty] = React.useState(false);

  const handleSave = () => {
    setDirty(false);
    alert("Settings saved");
  };

  return (
    <div className="flex flex-col flex-1 min-w-0">
      <TopBar title="Settings" />

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8 space-y-8 pb-24">
        {/* Section 1: Profile */}
        <section className="p-6 rounded-lg bg-surface-1 border border-border space-y-4">
          <h2 className="font-display text-base font-semibold text-text">
            Profile
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Display Name"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setDirty(true);
              }}
            />
            <Input label="Email address" value={email} disabled />
          </div>
        </section>

        {/* Section 2: Storage (DESIGN §6.8) */}
        <section className="p-6 rounded-lg bg-surface-1 border border-border space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-text">
              Storage Usage
            </h2>
            <span className="font-mono text-xs text-text-muted tabular-nums">
              {formatBytes(MOCK_USER.storageUsedBytes)} of{" "}
              {formatBytes(MOCK_USER.storageLimitBytes)} (31%)
            </span>
          </div>

          <StorageMeter
            usedBytes={MOCK_USER.storageUsedBytes}
            limitBytes={MOCK_USER.storageLimitBytes}
          />

          <p className="text-xs text-text-faint">
            Storage is managed for you. No Google account needed.
          </p>

          {/* Project storage breakdown (largest first) */}
          <div className="pt-2 border-t border-border space-y-2">
            <p className="text-xs text-text-muted font-medium">
              Files using storage:
            </p>
            <div className="divide-y divide-border/60">
              {MOCK_PROJECTS.map((proj) => (
                <div
                  key={proj.id}
                  className="py-2.5 flex items-center justify-between text-xs"
                >
                  <span className="font-medium text-text truncate max-w-xs">
                    {proj.title}
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-text-muted tabular-nums">
                      {formatBytes(proj.originalSize)}
                    </span>
                    <button
                      type="button"
                      aria-label="Delete project"
                      className="text-text-muted hover:text-danger transition-colors p-1"
                      onClick={() => alert(`Delete ${proj.title}`)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 3: Link Defaults */}
        <section className="p-6 rounded-lg bg-surface-1 border border-border space-y-4">
          <h2 className="font-display text-base font-semibold text-text">
            Share Link Defaults
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Default Watermark"
              value={watermark}
              onChange={(e) => {
                setWatermark(e.target.value);
                setDirty(true);
              }}
            />
            <Select
              label="Default Viewer Limit"
              value={viewerLimit}
              onChange={(e) => {
                setViewerLimit(e.target.value);
                setDirty(true);
              }}
            >
              <option value="1">1 viewer</option>
              <option value="2">2 viewers</option>
              <option value="3">3 viewers</option>
              <option value="5">5 viewers</option>
            </Select>
            <Select
              label="Default Preview Length"
              value={previewLength}
              onChange={(e) => {
                setPreviewLength(e.target.value);
                setDirty(true);
              }}
            >
              <option value="15">15 seconds</option>
              <option value="30">30 seconds</option>
              <option value="60">60 seconds</option>
              <option value="120">2 minutes</option>
            </Select>
          </div>
        </section>

        {/* Section 4: Danger Zone */}
        <section className="p-6 rounded-lg bg-danger-soft/30 border border-danger/30 space-y-3">
          <h2 className="font-display text-base font-semibold text-danger">
            Danger Zone
          </h2>
          <p className="text-xs text-text-muted">
            Permanently delete your editor account, all projects, preview renditions, and private Drive originals.
          </p>
          <Button
            variant="danger"
            size="sm"
            onClick={() => alert("Account deletion prompt")}
          >
            Delete account
          </Button>
        </section>
      </main>

      {/* Floating Save Bar when dirty */}
      {dirty && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-surface-2 border border-border px-5 py-3 rounded-lg shadow-xl animate-in slide-in-from-bottom duration-fast">
          <span className="text-xs text-text font-medium">
            You have unsaved changes.
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDirty(false)}
            >
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave}>
              Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
