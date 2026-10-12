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
  - `lib/env.ts`: Zod schema validating every variable defined in `CONTRACT.md` §8. Fails fast at boot with actionable diagnostic tables if any variable is missing. Scoped build bypass active *only* when `process.env.NEXT_PHASE === 'phase-production-build'`.
  - `.env.example`: Full template documenting each environment variable.
- **Storage Subsystem**:
  - `lib/storage/types.ts`: `StorageProvider` interface defining `putOriginal`, `streamOriginal`, `deleteOriginal`, and `ping`.
  - `lib/storage/google-drive.ts`: Production `GoogleDriveProvider`:
    - Resumable upload via Google Drive v3 Resumable Upload protocol with `Content-Range: bytes 0-${size-1}/${size}` and Node `https.request` piping for socket reliability.
    - Post-upload verification comparing remote `size` and `md5Checksum` against local file before deletion.
    - Range request passthrough (`bytes=start-end`) returning HTTP 206 Partial Content with proper `Content-Range` headers.
    - Direct stream piping (`stream.pipeline`) with backpressure, immediate client disconnect abort via `AbortSignal`, and flat memory usage.
    - Root folder resolution (`getResolvedRootFolderId`) that supports alphanumeric IDs or folder name strings, auto-creating the folder on Drive if missing.
    - Retry wrapper with exponential backoff and jitter for transient errors (HTTP 429, 5xx).
  - `lib/storage/mock.ts`: Local filesystem test harness strictly forbidden in production.
  - `lib/storage/index.ts`: Provider singleton factory enforcing that `MockStorageProvider` can only be activated via `STORAGE_PROVIDER=mock` in non-production environments, throwing immediately if attempted with `NODE_ENV=production`.
- **Database & Health**:
  - `lib/db/index.ts`: PostgreSQL connection pool and Drizzle ORM client with health check helper.
  - `app/api/health/route.ts`: Conforms to `CONTRACT.md` §9 (`{ ok: true, data }` or `{ ok: false, error }`), verifying PostgreSQL and Google Drive reachability.
- **Containerization & Deployment**:
  - `Dockerfile`: Debian bookworm slim base, FFmpeg installed, multi-stage build, non-root `nextjs` runner, healthcheck configured.
  - `start.sh`: Container entrypoint starting background worker and Next.js web server concurrently.
  - `railway.json`: Railway deployment specification with healthcheck endpoint `/api/health`.
- **Verification Scripts**:
  - `scripts/get-drive-token.ts`: One-time local OAuth consent flow to obtain the owner account refresh token (WHATWG URL API).
  - `scripts/drive-smoke-test.ts`: Verified against live Google Drive with explicit target labeling (`[Target: LIVE GOOGLE DRIVE]` vs `[Target: MOCK]`).
  - `scripts/test-b0-contracts.ts`: Automated contract tests verifying production mock prohibition, silent fallback prevention, and runtime env fail-fast behavior.

### B1 — Database & Editor Auth
- **Database Schema & Migrations**:
  - `lib/db/schema.ts`: Complete Drizzle schema declaring all 9 tables and enums from `CONTRACT.md` §7:
    - `users` (id, email, password_hash, display_name, storage_used_bytes, created_at)
    - `sessions` (id, user_id, expires_at, created_at)
    - `projects` (id, user_id, title, status, original_filename, original_size, duration_seconds, width, height, drive_file_id, drive_md5, created_at)
    - `upload_sessions` (id, project_id, total_size, chunk_size, received_chunks_json, status, created_at)
    - `renditions` (id, project_id, version, type, local_path, duration, status, created_at)
    - `share_links` (id, project_id, slug, client_label, visibility, passcode_hash, preview_mode, preview_start, preview_end, max_viewers, viewers_used, allow_preview_download, watermark_text, expires_at, status, unlocked_at, created_at)
    - `viewer_sessions` (id, link_id, ip_hash, ua_hash, first_seen, last_seen)
    - `download_grants` (id, link_id, token_hash, expires_at, used_at, kind)
    - `audit_log` (id, actor_type, actor_id, entity, entity_id, action, meta_json, created_at)
  - `drizzle/0000_clean_miss_america.sql`: Initial SQL migration for all 9 tables, enum types, and foreign key constraints.
- **Authentication & Security**:
  - `lib/auth/password.ts`: Argon2id password hashing and verification.
  - `lib/auth/session.ts` & `lib/auth/constants.ts`: Database session lifecycle with 30-day expiry and `httpOnly`, `secure`, `sameSite=lax`, `path=/` cookie (`rl_sess`).
  - `lib/auth/rate-limit.ts`: In-memory sliding window rate limiter enforcing 5 attempts per 15 minutes per IP on auth routes.
  - `lib/auth/middleware.ts` & `middleware.ts`: Next.js middleware protecting `/projects*`, `/settings*`, `/api/projects*`, `/api/uploads*`, and `/api/me*`.
- **API Surface**:
  - `POST /api/auth/signup`: User creation, Argon2id hashing, session generation, cookie dispatch.
  - `POST /api/auth/login`: Rate-limited login, password verification, session issuance.
  - `POST /api/auth/logout`: Database session invalidation and cookie clearance.
  - `GET /api/auth/me`: Authenticated profile endpoint returning editor details.
- **Data Seeding & Verification**:
  - `scripts/seed.ts`: Seed script populating DESIGN §12 content (Editor "Priyanshu", 3 projects: Wedding Reel 4:12, Brand Promo 1:48, Podcast 38:05, and 2 share links: Rahul, Studio Kala).
  - `scripts/test-b1-auth.ts`: Automated test suite covering Argon2id hashing, rate limiting, session lifecycle, and all auth route handlers.

---

## 3. Contract & Design Deviations (Explicitly Tracked)

1. **Local Mock Storage Harness (`lib/storage/mock.ts`)**:
   - *Contract Context*: CONTRACT §4 specifies `StorageProvider` and `GoogleDriveProvider`.
   - *Rationale & Bounds*: Added solely for offline unit testing and local CI when developers do not possess live Google Drive credentials.
   - *Strict Guardrail*: It is activated ONLY when `STORAGE_PROVIDER=mock` is set explicitly. If `STORAGE_PROVIDER=mock` is executed while `NODE_ENV=production`, the application immediately throws a fatal exception. Missing credentials in live mode never silently fall back to mock.
2. **Build-Phase Environment Bypass (`lib/env.ts`)**:
   - *Contract Context*: CONTRACT §8 mandates Zod validation at boot that fails fast if variables are missing.
   - *Rationale & Bounds*: In Next.js App Router, `next build` evaluates route modules during static data collection before Railway injects runtime production secrets.
   - *Strict Guardrail*: The bypass applies ONLY when `process.env.NEXT_PHASE === 'phase-production-build'`. At runtime (`next start`, `next dev`, route handlers, scripts), missing variables throw an immediate fatal error with the full diagnostics table.
3. **Google Drive Root Folder Name Resolution (`getResolvedRootFolderId`)**:
   - *Contract Context*: CONTRACT §4.1 states "Create (once) a folder named ReviewLock-Originals; store its ID in GOOGLE_DRIVE_ROOT_FOLDER_ID".
   - *Rationale*: Users frequently paste the folder name (`ReviewLock-Originals`) instead of the alphanumeric Google Drive folder ID into `.env`.
   - *Behavior*: `GoogleDriveProvider` checks if the value is an existing ID; if not found, it queries Drive for a folder with that name or automatically creates it and caches its resolved folder ID.
