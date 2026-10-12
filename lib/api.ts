// Typed API Client conforming strictly to CONTRACT §9

import {
  MOCK_USER,
  MOCK_PROJECTS,
  MOCK_SHARE_LINKS,
  MockUser,
  MockProject,
  MockShareLink,
} from "@/lib/mocks/data";

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

function isUseMocks(): boolean {
  return (
    process.env.NEXT_PUBLIC_USE_MOCKS === "true" ||
    (typeof window !== "undefined" &&
      window.localStorage?.getItem("use_mocks") === "true")
  );
}

async function request<T>(
  url: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      credentials: "include",
    });

    const json = await res.json();
    return json as ApiResponse<T>;
  } catch (err: any) {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: err?.message || "A network error occurred. Please try again.",
      },
    };
  }
}

export const api = {
  auth: {
    signup: async (
      email: string,
      password: string,
      displayName?: string
    ): Promise<ApiResponse<{ user: MockUser }>> => {
      if (isUseMocks()) {
        return { ok: true, data: { user: MOCK_USER } };
      }
      return request<{ user: MockUser }>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password, displayName }),
      });
    },

    login: async (
      email: string,
      password: string
    ): Promise<ApiResponse<{ user: MockUser }>> => {
      if (isUseMocks()) {
        return { ok: true, data: { user: MOCK_USER } };
      }
      return request<{ user: MockUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    },

    logout: async (): Promise<ApiResponse<{ loggedOut: boolean }>> => {
      if (isUseMocks()) {
        return { ok: true, data: { loggedOut: true } };
      }
      return request<{ loggedOut: boolean }>("/api/auth/logout", {
        method: "POST",
      });
    },

    me: async (): Promise<ApiResponse<{ user: MockUser }>> => {
      if (isUseMocks()) {
        return { ok: true, data: { user: MOCK_USER } };
      }
      return request<{ user: MockUser }>("/api/auth/me");
    },
  },

  storage: {
    getStorageQuota: async (): Promise<
      ApiResponse<{ usedBytes: number; limitBytes: number }>
    > => {
      if (isUseMocks()) {
        return {
          ok: true,
          data: {
            usedBytes: MOCK_USER.storageUsedBytes,
            limitBytes: MOCK_USER.storageLimitBytes,
          },
        };
      }
      return request<{ usedBytes: number; limitBytes: number }>(
        "/api/me/storage"
      );
    },
  },

  projects: {
    list: async (params?: {
      search?: string;
      status?: string;
    }): Promise<ApiResponse<{ projects: MockProject[] }>> => {
      if (isUseMocks()) {
        let results = [...MOCK_PROJECTS];
        if (params?.search) {
          const q = params.search.toLowerCase();
          results = results.filter((p) => p.title.toLowerCase().includes(q));
        }
        if (params?.status && params.status !== "all") {
          results = results.filter((p) => p.status === params.status);
        }
        return { ok: true, data: { projects: results } };
      }

      const searchParams = new URLSearchParams();
      if (params?.search) searchParams.set("search", params.search);
      if (params?.status) searchParams.set("status", params.status);

      return request<{ projects: MockProject[] }>(
        `/api/projects?${searchParams.toString()}`
      );
    },

    get: async (id: string): Promise<ApiResponse<{ project: MockProject }>> => {
      if (isUseMocks()) {
        const found = MOCK_PROJECTS.find((p) => p.id === id);
        if (!found) {
          return {
            ok: false,
            error: { code: "NOT_FOUND", message: "Project not found" },
          };
        }
        return { ok: true, data: { project: found } };
      }
      return request<{ project: MockProject }>(`/api/projects/${id}`);
    },

    rename: async (
      id: string,
      title: string
    ): Promise<ApiResponse<{ project: MockProject }>> => {
      if (isUseMocks()) {
        const found = MOCK_PROJECTS.find((p) => p.id === id);
        if (!found) {
          return {
            ok: false,
            error: { code: "NOT_FOUND", message: "Project not found" },
          };
        }
        const updated = { ...found, title };
        return { ok: true, data: { project: updated } };
      }
      return request<{ project: MockProject }>(`/api/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
    },

    delete: async (
      id: string
    ): Promise<ApiResponse<{ deleted: boolean }>> => {
      if (isUseMocks()) {
        return { ok: true, data: { deleted: true } };
      }
      return request<{ deleted: boolean }>(`/api/projects/${id}`, {
        method: "DELETE",
      });
    },
  },

  links: {
    listByProject: async (
      projectId: string
    ): Promise<ApiResponse<{ links: MockShareLink[] }>> => {
      if (isUseMocks()) {
        const results = MOCK_SHARE_LINKS.filter(
          (l) => l.projectId === projectId
        );
        return { ok: true, data: { links: results } };
      }
      return request<{ links: MockShareLink[] }>(
        `/api/projects/${projectId}/links`
      );
    },

    create: async (
      projectId: string,
      data: Partial<MockShareLink> & { passcode?: string }
    ): Promise<ApiResponse<{ link: MockShareLink }>> => {
      if (isUseMocks()) {
        const newLink: MockShareLink = {
          id: `link_${Date.now()}`,
          projectId,
          slug: Math.random().toString(36).substring(2, 10),
          clientLabel: data.clientLabel || "New Client Link",
          visibility: data.visibility || "public",
          previewMode: data.previewMode || "first_n",
          previewStart: data.previewStart || 0,
          previewEnd: data.previewEnd || 30,
          maxViewers: data.maxViewers || 1,
          viewersUsed: 0,
          allowPreviewDownload: data.allowPreviewDownload || false,
          watermarkText: data.watermarkText || "PREVIEW · NOT PAID",
          expiresAt: data.expiresAt || null,
          status: "live",
          unlockedAt: null,
          createdAt: new Date().toISOString(),
        };
        return { ok: true, data: { link: newLink } };
      }
      return request<{ link: MockShareLink }>(
        `/api/projects/${projectId}/links`,
        {
          method: "POST",
          body: JSON.stringify(data),
        }
      );
    },

    revoke: async (id: string): Promise<ApiResponse<{ revoked: boolean }>> => {
      if (isUseMocks()) {
        return { ok: true, data: { revoked: true } };
      }
      return request<{ revoked: boolean }>(`/api/links/${id}/revoke`, {
        method: "POST",
      });
    },

    unlock: async (id: string): Promise<ApiResponse<{ unlocked: boolean }>> => {
      if (isUseMocks()) {
        return { ok: true, data: { unlocked: true } };
      }
      return request<{ unlocked: boolean }>(`/api/links/${id}/unlock`, {
        method: "POST",
      });
    },
  },

  activity: {
    list: async (): Promise<
      ApiResponse<{
        activities: Array<{
          id: string;
          title: string;
          detail: string;
          action: string;
          entity: string;
          timestamp: string;
          status: string;
        }>;
      }>
    > => {
      if (isUseMocks()) {
        return {
          ok: true,
          data: {
            activities: [
              {
                id: "act-1",
                title: "Original Released",
                detail: "Priyanshu released master original for Studio Kala – Promo.",
                action: "link_unlocked",
                entity: "share_link",
                timestamp: new Date(Date.now() - 10 * 60000).toISOString(),
                status: "completed",
              },
              {
                id: "act-2",
                title: "Client Slot Claimed",
                detail: "Rahul opened Wedding Reel preview. Slot 1/1 claimed.",
                action: "viewer_opened",
                entity: "share_link",
                timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
                status: "completed",
              },
            ],
          },
        };
      }
      return request<{
        activities: Array<{
          id: string;
          title: string;
          detail: string;
          action: string;
          entity: string;
          timestamp: string;
          status: string;
        }>;
      }>("/api/activity");
    },
  },
};
