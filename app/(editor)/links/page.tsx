"use client";

import * as React from "react";
import Link from "next/link";
import { TopBar } from "@/components/shell/top-bar";
import { StatusPill, CopyLinkButton, Skeleton, EmptyState } from "@/components/ui";
import { api } from "@/lib/api";
import { Link2, ExternalLink } from "lucide-react";
import { formatRelative } from "@/lib/format";

interface EnrichedLink {
  id: string;
  slug: string;
  clientLabel: string;
  projectId: string;
  projectTitle: string;
  status: string;
  viewersUsed: number;
  maxViewers: number;
  previewStart: number;
  previewEnd: number;
  createdAt: string;
}

export default function LinksPage() {
  const [links, setLinks] = React.useState<EnrichedLink[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function loadAllLinks() {
      try {
        const projRes = await api.projects.list();
        if (!projRes.ok || !projRes.data?.projects) {
          setLoading(false);
          return;
        }

        const projectList = projRes.data.projects;
        const enriched: EnrichedLink[] = [];

        await Promise.all(
          projectList.map(async (project) => {
            const linksRes = await api.links.listByProject(project.id);
            if (linksRes.ok && linksRes.data?.links) {
              for (const l of linksRes.data.links) {
                enriched.push({
                  id: l.id,
                  slug: l.slug,
                  clientLabel: l.clientLabel,
                  projectId: project.id,
                  projectTitle: project.title,
                  status: l.status,
                  viewersUsed: l.viewersUsed || 0,
                  maxViewers: l.maxViewers || 1,
                  previewStart: l.previewStart || 0,
                  previewEnd: l.previewEnd || 30,
                  createdAt: l.createdAt,
                });
              }
            }
          })
        );

        // Sort descending by creation
        enriched.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        setLinks(enriched);
      } catch (err) {
        console.error("Failed to load share links:", err);
      } finally {
        setLoading(false);
      }
    }

    loadAllLinks();
  }, []);

  return (
    <div className="flex flex-col flex-1 min-w-0">
      <TopBar title="Share Links" />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-6">
        <div className="rounded-lg border border-border bg-surface-1 overflow-hidden divide-y divide-border">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-surface-2 text-xs font-semibold text-text-muted select-none">
            <span className="col-span-4">Client / Project</span>
            <span className="col-span-2">Status</span>
            <span className="col-span-3">Share Link</span>
            <span className="col-span-3">Viewers / Window</span>
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ) : links.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={Link2}
                title="No share links created yet"
                description="Open any project and click 'Create share link' to generate protected client review URLs."
              />
            </div>
          ) : (
            links.map((link) => (
              <div
                key={link.id}
                className="grid grid-cols-12 gap-4 px-4 py-3.5 items-center hover:bg-surface-2 transition-colors text-xs"
              >
                <div className="col-span-4 min-w-0">
                  <p className="font-semibold text-text truncate">
                    {link.clientLabel}
                  </p>
                  <Link
                    href={`/projects/${link.projectId}`}
                    className="text-[11px] text-text-muted hover:text-accent truncate mt-0.5 inline-flex items-center gap-1 group"
                  >
                    <span>{link.projectTitle}</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </div>

                <div className="col-span-2">
                  <StatusPill status={link.status as any} />
                </div>

                <div className="col-span-3">
                  <CopyLinkButton
                    url={
                      typeof window !== "undefined"
                        ? `${window.location.origin}/v/${link.slug}`
                        : `http://localhost:3000/v/${link.slug}`
                    }
                    displayUrl={`/v/${link.slug}`}
                  />
                </div>

                <div className="col-span-3 font-mono text-text-muted tabular-nums">
                  {link.viewersUsed}/{link.maxViewers} viewers ·{" "}
                  {link.previewStart}s–{link.previewEnd}s
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
