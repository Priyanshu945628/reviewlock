"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Folder,
  Link2,
  Activity,
  Settings,
  LogOut,
  Upload,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { StorageMeter } from "./storage-meter";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Projects", href: "/projects", icon: Folder },
  { label: "Links", href: "/links", icon: Link2 },
  { label: "Activity", href: "/activity", icon: Activity },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar({
  user,
  onOpenUpload,
}: {
  user?: { displayName?: string; email?: string };
  onOpenUpload?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await api.auth.logout();
    router.push("/login");
  };

  const displayName = user?.displayName || "Editor";
  const avatarLetter = displayName.charAt(0).toUpperCase();

  const [storage, setStorage] = React.useState<{
    usedBytes: number;
    limitBytes: number;
  }>({
    usedBytes: 0,
    limitBytes: 20 * 1024 * 1024 * 1024,
  });

  React.useEffect(() => {
    let mounted = true;
    async function loadStorage() {
      try {
        const res = await api.storage.getStorageQuota();
        if (mounted && res.ok && res.data) {
          setStorage(res.data);
        }
      } catch {
        // Fallback gracefully
      }
    }
    loadStorage();
    const interval = setInterval(loadStorage, 15000);
    window.addEventListener("focus", loadStorage);
    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener("focus", loadStorage);
    };
  }, []);

  return (
    <>
      {/* Desktop & Tablet Sidebar (>= 768px) */}
      <aside
        className={cn(
          "hidden md:flex flex-col justify-between shrink-0 h-screen sticky top-0 bg-surface-1 border-r border-border z-40 transition-all duration-base",
          // 232px desktop (>= 1100px), 64px icon rail on tablet (768px - 1099px)
          "w-16 xl:w-[232px]"
        )}
      >
        {/* Top: Logo */}
        <div className="h-14 flex items-center px-4 xl:px-5 border-b border-border/60">
          <Link href="/projects" className="flex items-center">
            {/* Full wordmark on xl (>= 1100px), playhead icon on tablet */}
            <div className="hidden xl:block">
              <Logo />
            </div>
            <div className="xl:hidden flex items-center justify-center w-8 h-8 rounded-md bg-surface-2 border border-border">
              <span className="w-[2px] h-[18px] bg-accent rounded-full" />
            </div>
          </Link>
        </div>

        {/* Center: Navigation Links */}
        <nav className="flex-1 py-4 px-2 xl:px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center h-9 px-2.5 rounded-md text-sm font-medium transition-colors select-none group",
                  isActive
                    ? "bg-surface-3 text-text"
                    : "text-text-muted hover:text-text hover:bg-surface-2"
                )}
                title={item.label}
              >
                {/* 2px amber bar on the left for active item */}
                {isActive && (
                  <span
                    className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-accent rounded-r"
                    aria-hidden="true"
                  />
                )}
                <Icon
                  className={cn(
                    "w-4 h-4 shrink-0 transition-colors",
                    isActive ? "text-accent" : "text-text-muted group-hover:text-text"
                  )}
                />
                <span className="hidden xl:inline ml-3 truncate">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Footer: Storage Meter & User Card */}
        <div className="p-2 xl:p-3 border-t border-border/60 space-y-2">
          {/* Storage Meter */}
          <div className="hidden xl:block">
            <StorageMeter
              usedBytes={storage.usedBytes}
              limitBytes={storage.limitBytes}
              collapsed={false}
            />
          </div>
          <div className="xl:hidden flex justify-center">
            <StorageMeter
              usedBytes={storage.usedBytes}
              limitBytes={storage.limitBytes}
              collapsed={true}
            />
          </div>

          {/* User Profile Row */}
          <div className="flex items-center justify-between p-2 rounded-md bg-surface-2/60 border border-border/40">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-surface-3 border border-border flex items-center justify-center font-display font-semibold text-xs text-accent shrink-0">
                {avatarLetter}
              </div>
              <div className="hidden xl:flex flex-col min-w-0">
                <span className="text-xs font-semibold text-text truncate">
                  {displayName}
                </span>
                <span className="text-[11px] text-text-faint truncate font-mono">
                  Editor
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              title="Log out"
              className="hidden xl:inline-flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-danger hover:bg-danger-soft transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Tab Bar (< 768px) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-surface-1 border-t border-border z-40 flex items-center justify-around px-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-md transition-colors",
                isActive ? "text-accent" : "text-text-muted"
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[10px] font-medium leading-none">
                {item.label}
              </span>
            </Link>
          );
        })}

        {onOpenUpload && (
          <button
            type="button"
            onClick={onOpenUpload}
            className="flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-md text-text-muted hover:text-accent transition-colors"
          >
            <Upload className="w-4 h-4 text-accent" />
            <span className="text-[10px] font-medium leading-none text-accent">
              Upload
            </span>
          </button>
        )}
      </nav>
    </>
  );
}
