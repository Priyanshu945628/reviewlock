"use client";

import * as React from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { UploadProvider, useUpload } from "@/components/upload/upload-context";
import { UploadDialog } from "@/components/upload/upload-dialog";
import { UploadTray } from "@/components/upload/upload-tray";
import { api } from "@/lib/api";

function EditorLayoutInner({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<{
    displayName?: string;
    email?: string;
  } | undefined>(undefined);

  const { openUploadDialog } = useUpload();

  React.useEffect(() => {
    async function loadUser() {
      const res = await api.auth.me();
      if (res.ok && res.data?.user) {
        setUser(res.data.user);
      }
    }
    loadUser();
  }, []);

  return (
    <div className="flex min-h-screen bg-bg text-text">
      {/* Sidebar Navigation */}
      <Sidebar user={user} onOpenUpload={() => openUploadDialog()} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        {children}
      </div>

      {/* Global Upload Dialog & Docked Tray */}
      <UploadDialog />
      <UploadTray />
    </div>
  );
}

export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UploadProvider>
      <EditorLayoutInner>{children}</EditorLayoutInner>
    </UploadProvider>
  );
}
