# ARCHITECTURE.md — ReviewLock System Architecture

This document tracks system components, topological boundaries, data flow, and state connections across development chunks.

---

## 1. High-Level Topology

```
┌────────────────────────────────────────────────────────────────────────┐
│ RAILWAY CONTAINER (node:20-bookworm-slim)                              │
│                                                                        │
│  ┌───────────────────────┐             ┌────────────────────────────┐  │
│  │ Next.js App Router    │             │ Background Worker (B3)     │  │
│  │ (Web & Route Handlers)│             │ (pg-boss + FFmpeg)         │  │
│  └───────────┬───────────┘             └─────────────┬──────────────┘  │
│              │                                       │                 │
│              ▼                                       ▼                 │
│    ┌─────────────────────────────────────────────────────────┐         │
│    │ Railway Persistent Volume (/data)                       │         │
│    │  - /data/uploads/       (in-flight chunks & assembly)   │         │
│    │  - /data/renditions/    (HLS playlists & .ts segments)  │         │
│    │  - /data/thumbs/        (sprites & VTT for timeline)    │         │
│    └─────────────────────────────────────────────────────────┘         │
└────────────────────────────────────────────────────────────────────────┘
              │                                        │
              ▼                                        ▼
    ┌───────────────────────────┐           ┌─────────────────────────────┐
    │ Railway PostgreSQL        │           │ Google Drive (Owner Account)│
    │  - App Database & Drizzle │           │  - ReviewLock-Originals/    │
    │  - pg-boss job queues     │           │    - <projectId>/original.* │
    └───────────────────────────┘           └─────────────────────────────┘
```

---

## 2. Chunk Implementations

### B0 — Scaffold, Railway, Environment & Drive Auth
- **Next.js & Styling**:
  - Next.js 15 App Router + TypeScript.
  - Tailwind CSS configured with exact Design Tokens from `DESIGN.md` §3 (surfaces, border tokens, amber accent, semantic colors, radiuses up to 14px).
  - Web fonts configured via `next/font/google`: Bricolage Grotesque (600), Inter (400, 500, 600), JetBrains Mono (400, 500 tabular-nums).
- **Environment & Configuration**:
  - `lib/env.ts`: Zod schema validating every variable defined in `CONTRACT.md` §8. Fails fast at boot with actionable diagnostic tables if any variable is missing. Supports `SKIP_ENV_VALIDATION=1` during build stages.
  - `.env.example`: Full template documenting each environment variable.
- **Storage Subsystem**:
  - `lib/storage/types.ts`: `StorageProvider` interface defining `putOriginal`, `streamOriginal`, `deleteOriginal`, and `ping`.
  - `lib/storage/google-drive.ts`: `GoogleDriveProvider` implementation:
    - Resumable upload via Drive v3 Resumable Upload protocol.
    - Post-upload verification comparing remote `size` and `md5Checksum` against local file before deletion.
    - Range request passthrough (`bytes=start-end`) returning HTTP 206 Partial Content with proper `Content-Range` headers.
    - Direct stream piping (`stream.pipeline`) with backpressure, immediate client disconnect abort via `AbortSignal`, and flat memory usage.
    - Retry wrapper with exponential backoff and jitter for transient errors (HTTP 429, 5xx).
  - `lib/storage/index.ts`: Provider singleton factory.
- **Database & Health**:
  - `lib/db/index.ts`: PostgreSQL connection pool and Drizzle ORM client with health check helper.
  - `app/api/health/route.ts`: Conforms to `CONTRACT.md` §9 (`{ ok: true, data }` or `{ ok: false, error }`), verifying PostgreSQL and Google Drive reachability.
- **Containerization & Deployment**:
  - `Dockerfile`: Debian bookworm slim base, FFmpeg installed, multi-stage build, non-root `nextjs` runner, healthcheck configured.
  - `start.sh`: Container entrypoint starting background worker and Next.js web server concurrently.
  - `railway.json`: Railway deployment specification with healthcheck endpoint `/api/health`.
- **Scripts**:
  - `scripts/get-drive-token.ts`: One-time local OAuth consent flow to obtain the owner account refresh token.
  - `scripts/drive-smoke-test.ts`: Verifies 5 MB roundtrip upload/stream/delete and 200 MB piped Range streaming with flat memory and TTFB logging.
