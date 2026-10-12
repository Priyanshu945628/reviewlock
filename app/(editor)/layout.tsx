"use client";

import * as React from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { MOCK_USER } from "@/lib/mocks/data";
import { api } from "@/lib/api";

export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = React.useState<{
    displayName: string;
    email: string;
  }>(MOCK_USER);

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
      <Sidebar user={user} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        {children}
      </div>
    </div>
  );
}
