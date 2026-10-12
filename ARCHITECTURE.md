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
### F1 — Design System & Showcase Page
- **Typography & Token Implementation**:
  - `app/layout.tsx`: Configured Google Fonts with Next.js font optimization:
    - Display / Headings: `Bricolage_Grotesque` (weight 600, `--font-bricolage`)
    - UI / Body: `Inter` (weights 400, 500, 600, `--font-inter`)
    - Technical / Metrics: `JetBrains_Mono` (weights 400, 500, `--font-jetbrains-mono`, `tabular-nums`)
  - `app/globals.css`: Dark-only design tokens (`--bg`, `--surface-1` through `--surface-3`, `--border`, `--border-strong`, `--accent` #FFB020, semantic success/danger/info, radiuses max 14px, playhead-tick animation).
  - `tailwind.config.ts`: Tailwind v3 mapping directly to CSS variables with exact radius limits and custom animation easing.
- **Formatting Engine**:
  - `lib/format.ts`: Robust timecode (`mm:ss` or `h:mm:ss`), byte formatter (`B`, `KB`, `MB`, `GB`), and relative time parser (`just now`, `Xm ago`, `Xh ago`, `Xd ago`).
  - `scripts/test-f1-format.ts`: Comprehensive test suite passing all edge cases (negative, sub-minute, multi-hour, GB bounds).
- **Core Component Library (`components/ui/`)**:
  - `button.tsx`: Variants (`primary`, `secondary`, `ghost`, `danger`), sizes (`sm` 32px, `md` 40px, `lg` 48px), fixed-width loading state with variant-aware spinner.
  - `input.tsx`, `textarea.tsx`, `select.tsx`, `switch.tsx`, `slider.tsx`: Height 40px, `--surface-2` background, 1px border, 2px amber focus outline with offset, label and error states. Built with `@radix-ui` primitives for Switch and Slider.
  - `status-pill.tsx`: 22px high, 11px uppercase semi-bold with leading dot/check/spinner for all 7 statuses (`processing`, `ready`, `live`, `viewed`, `exhausted`, `revoked`, `paid`/`unlocked`).
  - `timecode.tsx`: JetBrains Mono tabular-nums wrapper for seconds or pre-formatted timestamps.
  - `copy-link-button.tsx`: Mono field with copy button, 1.5s checkmark morph, clipboard fallback, and `sonner` toast notification.
  - `dropzone.tsx`: 220px tall, 14px radius, dashed 1.5px border, drag-over amber highlight, Lucide `Film` icon, and format hint.
  - `progress-bar.tsx`: 4px tall with `--accent` fill and sliding playhead tick indeterminate animation.
  - `project-card.tsx`: 16:9 thumbnail, mono duration chip, title truncate, status pill, hover translateY(-2px), and fading kebab menu.
  - `timeline-range-selector.tsx`: Hero component (§4.9 & §6.6) with dual modes (`First N seconds` and `Custom segment`), quick-pick chips, 10-frame dimmed filmstrip, 45° diagonal hatch on locked regions, floating timecode badges, keyboard navigation, and preview limit warning.
  - `status-timeline.tsx`: Vertical step sequence with filled, amber-pulsing, and hollow dot indicators.
  - `confirm-dialog.tsx`: Radix Dialog with backdrop blur, fade/scale animations, 14px radius, and standard/danger actions.
  - `drawer.tsx`: 480px right-side sheet with slide-in animation, accessible close button, and sticky footer.
  - `tooltip.tsx`: Radix Tooltip with keyboard shortcut badge support.
  - `empty-state.tsx`: Centered icon, title, description, and action button.
  - `skeleton.tsx`: Dark-surface pulse skeleton placeholder matching final component geometries.
  - `logo.tsx`: Wordmark "Review|Lock" with 2px x 18px amber playhead separator.
### F2 — App Shell, Auth Screens, Dashboard & Mock Subsystem
- **Mock Infrastructure & Typed API Client**:
  - `lib/mocks/data.ts`: Mock fixtures conforming strictly to DESIGN §12 and CONTRACT §7 (`MOCK_USER` Priyanshu with 6.2 GB / 20 GB quota, 3 `MOCK_PROJECTS`, 2 `MOCK_SHARE_LINKS`).
  - `lib/api.ts`: Typed client obeying CONTRACT §9 `{ ok, data, error }` schema. Automatically routes to mock fixtures when `NEXT_PUBLIC_USE_MOCKS=true` or `localStorage.getItem('use_mocks') === 'true'`, or makes authenticated `fetch` requests with credentials to backend route handlers.
  - `scripts/test-f2-api.ts`: Automated test suite verifying typed API methods, filter params, search query parsing, project mutations, and link creation.
- **Application Shell (`components/shell/`)**:
  - `sidebar.tsx`: Responsive navigation shell:
    - Desktop (≥1100px): 232px wide with full wordmark, 36px nav rows, active state with 2px amber bar, StorageMeter, and user profile with logout.
    - Tablet (768px–1099px): 64px icon rail with playhead logo and compact storage bar.
    - Mobile (<768px): 56px fixed bottom tab bar with quick navigation.
  - `top-bar.tsx`: 56px sticky top bar with page title, search bar (shortcut `/`), and primary `+ New upload` button (shortcut `U`).
  - `storage-meter.tsx`: 4px bar displaying used vs quota bytes in JetBrains Mono; shifts to `--danger` when usage exceeds 90%.
  - `timeline-hero-graphic.tsx`: CSS/SVG stylised timeline graphic (3 tracks, colored clips, drifting amber playhead at 38%, diagonal hatched locked region with lock icon).
  - `app/(editor)/layout.tsx`: Editor root shell wrapping sidebar, top bar, and centered responsive content container.
- **Screen Implementations**:
  - `app/page.tsx`: Landing page (DESIGN §6.1) featuring left-aligned hero, animated timeline graphic, 3-step workflow (`01 02 03`), and trust strip.
  - `app/login/page.tsx` & `app/signup/page.tsx`: Split layout (DESIGN §6.2) with 480px left panel on `--surface-1`, hero graphic on right, inline validation, and password visibility toggle.
  - `app/(editor)/projects/page.tsx`: Dashboard (DESIGN §6.3) featuring filter chips (`All`, `Processing`, `Ready`, `Awaiting payment`, `Paid`), Grid / List view switcher (56px table rows), 6-card skeleton loading state, inline error state with retry, and empty state with embedded dropzone.
### B2 — Upload Pipeline & Storage Quota
- **Storage & Disk Quota Guard (`lib/storage/quota.ts`)**:
  - `checkStorageLimits`: Checks user storage usage against `MAX_STORAGE_PER_USER_GB` (CONTRACT §4.0) and rejects with `STORAGE_QUOTA_EXCEEDED` if exceeded.
  - File size validator checking against `MAX_UPLOAD_GB` with `FILE_TOO_LARGE` rejection.
  - Disk space guard using Node.js `statfs` on `DATA_DIR` to ensure 2x file size temporary space for chunk assembly and transcode buffer, rejecting with `INSUFFICIENT_SERVER_SPACE` if disk is constrained.
- **Probe Subsystem (`lib/video/probe.ts`)**:
  - FFprobe subprocess inspector extracting video stream properties (`codec_type === 'video'`), dimensions (`width`, `height`), and duration (`durationSeconds`).
  - Rejects non-video files or corrupted media streams with diagnostic errors.
- **Background Job Enqueuer (`lib/queue/boss.ts`)**:
  - Configures pg-boss job queue singleton (`process-project` queue) with retry limits and 1-hour expiration.
  - Enqueues project processing payload upon verified chunk assembly completion.
- **Route Handlers**:
  - `GET /api/me/storage`: Authenticated endpoint returning user's `usedBytes` and configured quota `limitBytes`.
  - `POST /api/uploads`: Initiates upload session, verifies allowed extensions (`.mp4`, `.mov`, `.mkv`, `.webm`, `.mxf`), enforces quotas, creates database records for project (`uploading`) and upload session (8 MiB chunks), and creates temp directory on `DATA_DIR`.
  - `PUT /api/uploads/:id/chunk?index=n`: Receives binary chunk parts, persists them to disk (`chunk_${index}.part`), and atomically updates `received_chunks_json` with keyed mutex lock preventing race condition data loss during concurrent uploads.
  - `GET /api/uploads/:id`: Returns upload session status, total size, chunk size, and array of received chunk indices for client-side drop resume.
  - `POST /api/uploads/:id/complete`: Validates that all chunks are present, streams sequential chunk assembly into single file, verifies byte size, cleans up part files, executes `ffprobe` verification, transitions project to `uploaded`, and enqueues pg-boss worker job.
### B3 — Processing Worker (FFmpeg & pg-boss)
- **FFmpeg Transcoding & Watermarking Engine (`lib/video/ffmpeg.ts`)**:
  - `generatePreviewHls`: Renders 4s H.264 segments (`-hls_time 4 -hls_playlist_type vod`), scales to `PREVIEW_MAX_HEIGHT`, encodes 128k AAC audio, burns in drawtext watermark text with cross-platform font resolution (Windows Arial/Segoe, Linux DejaVu/FreeSans/Liberation), and outputs `master.m3u8` playlist.
  - `generatePreviewMp4`: Renders standalone watermarked preview MP4 with `faststart` for client preview downloads.
  - `generateThumbnailSprite`: Extracts 10 frames across video duration tiled horizontally (`tile=10x1`, 160x90 per frame) into `sprite.jpg` and generates corresponding WebVTT index `thumbs.vtt`.
- **Worker Execution Subsystem (`lib/queue/worker.ts`, `scripts/worker.ts`)**:
  - `startWorker`: pg-boss worker registered on `process-project` queue with `batchSize: 2` (max 2 concurrent jobs).
  - Project processing pipeline:
    1. Sets `projects.status = 'processing'`.
    2. Probes metadata (duration, width, height).
    3. Generates default 60s HLS preview cut (rendition version 1).
    4. Generates preview MP4 (rendition version 1).
    5. Generates 10-frame thumbnail sprite and VTT.
    6. Uploads master original to Google Drive via `getStorageProvider().putOriginal()`.
    7. Verifies MD5 checksum and byte size match local source.
    8. Deletes local original file from `/data/uploads/` to reclaim server disk space.
    9. Transitions `projects.status = 'ready'`, sets `drive_file_id` and `drive_md5`.
    10. Atomically increments `users.storage_used_bytes` by original file size.
    11. Writes `project_processed` event to `audit_log`.
    12. On failure, transitions status to `failed` and records error in `audit_log`.
- **Project Endpoints (`app/api/projects/[id]/`, `thumbs/`)**:
  - `GET /api/projects/:id`: Returns project detail, status, and associated renditions.
  - `PATCH /api/projects/:id`: Renames project title.
  - `DELETE /api/projects/:id`: Deletes project from database, deletes original file from Google Drive via storage provider, decrements user storage quota, and logs to `audit_log`.
  - `GET /api/projects/:id/thumbs`: Serves thumbnail sprite JPEG (`?image=true`), WebVTT text (`?vtt=true`), or JSON metadata.
### F3 — Upload UI & Project Detail
- **Resumable Client Upload Context (`components/upload/upload-context.tsx`)**:
  - Global `UploadProvider` exposing `useUpload()` hook managing multi-part chunked uploads.
  - Slices video files into 8 MiB chunks, queries upload session status for resumed uploads, and sends chunks to `/api/uploads/:id/chunk?index=n`.
  - Calculates real-time upload speed (MB/s), remaining time estimate (`timeLeftFormatted`), and upload progress percentage.
  - Features pause, resume, and cancel with `AbortController` cancellation.
  - Auto-polls upload session and project readiness across processing pipeline stages (`Uploaded ✓` → `Building secure preview` → `Saving original to private storage`).
- **Upload Dialog (`components/upload/upload-dialog.tsx`) & Docked Tray (`components/upload/upload-tray.tsx`)**:
  - 640px modal dialog featuring embedded Dropzone, auto-cleaned title generator, speed/time stats, and 3-step live progress indicators.
  - Minimizable to 320px docked upload tray (`fixed bottom-4 right-4`) that persists across navigation with expandable/cancellable controls.
- **Project Detail Page (`app/(editor)/projects/[id]/page.tsx`)**:
  - Conforms strictly to DESIGN §6.5 layout (flexible left column, 340px sticky right column).
  - Left column:
    - Custom preview video player rendering owner's watermarked proxy preview with scrubbing, timecode tags, and diagonal watermark overlay.
    - Two-tab layout: `Share links` (count) and `Activity` log.
    - Share link cards displaying client label, status pill, slug with copy button, timecode range, viewer counters (`viewersUsed / maxViewers`), and relative expiry.
    - Contextual "Release full file" prompt and button appearing automatically when link status is `viewers_exhausted` or `expired`.
  - Right column:
    - Inline project title renaming (`PATCH /api/projects/:id`) with keyboard shortcuts (Enter to save, Escape to cancel).
    - Metadata badges: status pill, duration timecode, formatted byte size, resolution & fps, and relative upload date.
    - Primary `+ Create share link` button.
    - Danger zone with `Delete project` action protected by `ConfirmDialog`.
- **Project Preview Endpoint (`app/api/projects/[id]/preview/route.ts`)**:
  - Authenticated route streaming owner's watermarked preview video with HTTP 206 `Accept-Ranges` support for smooth scrubbing.
### B4 — Share Link Engine
- **Service & State Machine (`lib/links/service.ts`)**:
  - `generateSlug`: Generates cryptographically secure 128-bit random base64url slug (16 bytes entropy, 22 characters).
  - Passcode Security: Hashes passcodes with Argon2id (`memoryCost: 19456`, `timeCost: 2`, `parallelism: 1`).
  - State Machine (`isValidStateTransition`): Enforces `created -> active -> viewers_exhausted | expired | revoked -> unlocked`.
    - Revoked links are immutable and reject further modifications (`CANNOT_MODIFY_REVOKED_LINK`).
    - Editor can unlock to release full file from ANY state (CONTRACT §6).
    - Prevents illegal backward transitions (e.g., `revoked -> active`, `unlocked -> active`).
  - Preview Pipeline Re-run (`rerunPreviewPipeline`): Changing `previewStart`, `previewEnd`, or `watermarkText` automatically generates a new rendition version (`v${nextVersion}`) while preserving previous rendition until ready (CONTRACT §7).
  - Audit Logging: Every state transition and mutation writes to `audit_log` (`link_created`, `link_updated`, `link_revoked`, `link_unlocked`, `rendition_regenerated`).
- **REST Endpoints**:
  - `POST /api/projects/:id/links`: Creates link with initial active state, hashed passcode, and audit log.
  - `GET /api/projects/:id/links`: Lists all share links for a project belonging to authenticated editor.
  - `PATCH /api/links/:id`: Updates client label, visibility, passcode, preview range, and watermark (re-triggers preview pipeline if range/watermark modified).
  - `POST /api/links/:id/revoke`: Revokes access; sets status to `revoked`.
  - `POST /api/links/:id/unlock`: Releases original file; sets status to `unlocked` and records `unlocked_at`.
  - `GET /api/links/:id/activity`: Returns audit log events and viewer session records for timeline rendering.
### F4 — Share Link Drawer & TimelineRangeSelector
- **Share Link Drawer (`components/share/share-link-drawer.tsx`)**:
  - 480px right-sliding drawer conforming strictly to DESIGN §6.6 layout, structure, and 24px section spacing:
    1. *Who is this for*: `client_label` text input.
    2. *Preview range*: Integrated `TimelineRangeSelector` with live filmstrip, dragging handles, and summary line.
    3. *Access*: Segmented control toggling `Private (passcode)` vs `Public (anyone)`. If private: 6-char mono passcode generator with show/hide toggle and copy action.
    4. *Viewer limit*: Stepper control (`− 1 +`) enforcing minimum 1 viewer slot.
    5. *Expiry*: Select options: `Never`, `1 hour`, `24 hours`, `7 days`, and `Custom hours`.
    6. *Preview download*: Switch toggling watermarked preview download permission with explicit clarification that original remains locked.
    7. *Watermark*: Editable watermark text prefilled with `PREVIEW · NOT PAID` plus live diagonal preview thumbnail.
  - Sticky footer with secondary "Cancel" and primary "Create link" / "Save changes".
  - Success State Screen (DESIGN §6.6):
    - Subtle 360ms amber SVG check draw-in animation (zero confetti).
    - Big `CopyLinkButton` with URL and one-click copy.
    - Passcode display card with copy button when private access is configured.
    - Readout summary cards for range, viewers, and watermark text.
    - "Done" button to close drawer.
- **TimelineRangeSelector Component (`components/ui/timeline-range-selector.tsx`)**:
  - Full-width track, 64px height, radius 10px, background `--surface-2`.
  - Filmstrip thumbnail background dimmed to 55% opacity.
  - Modes: `First N seconds` (single amber left-edge handle + quick-pick chips `15s · 30s · 60s · 2m`) and `Custom segment` (two amber handles + draggable body).
  - Handles: 10px wide × full-height rounded bars with dual grip lines and floating timecode tags. Hit area ≥ 44px for touch accessibility.
  - Locked region: Darkened 70% with 45° diagonal repeating gradient hatch pattern and centered lock icon when width ≥ 80px.
  - Keyboard accessible: Handles focusable with Left/Right (1s), Shift+Left/Right (10s), and Home/End snapping.
### B5 — Viewer Access & Streaming
- **Viewer Engine (`lib/viewer/service.ts`)**:
  - `generateStreamToken`: Generates HMAC-SHA256 token (`linkId.sessionId.exp.sig`) with 60s TTL using `STREAM_TOKEN_SECRET`.
  - `verifyStreamToken`: Enforces constant-time `crypto.timingSafeEqual`, timestamp expiration, and strict link binding.
  - `claimViewerSlot`: Executes exact atomic SQL update pattern mandated by CONTRACT §6 (`UPDATE share_links SET viewers_used = viewers_used + 1 WHERE id = $1 AND status = 'active' AND viewers_used < max_viewers AND (expires_at IS NULL OR expires_at > now()) RETURNING viewers_used, max_viewers`).
    - Successfully claims unique slots with race-free concurrency.
    - Transitions link status to `viewers_exhausted` when limit is reached.
    - Returning viewers with valid `rl_vs` cookie session do not consume additional slots.
  - `verifyLinkPasscode`: Compares Argon2id passcode hash with 5-attempt / 15-minute lockout window via `checkRateLimit`.
  - `getRewrittenPlaylist`: Parses HLS master playlist and rewrites segment URLs to `/api/v/:slug/seg/:file?t=${token}` with `Cache-Control: private, no-store`.
  - `getSegmentPath`: Validates filename against path traversal and resolves `.ts` segments from active rendition.
- **Public & Streaming Endpoints**:
  - `GET /api/v/:slug`: Returns public metadata and state without leaking editor details, internal IDs, or Drive info.
  - `POST /api/v/:slug/open`: Verifies passcode, atomically claims viewer slot, sets `rl_vs` httpOnly cookie, and issues initial 60s stream token.
  - `POST /api/v/:slug/token`: Refreshes 60s stream token every 40s; immediately cuts off revoked or expired links.
  - `GET /api/v/:slug/playlist.m3u8?t=`: Serves token-rewritten HLS playlist with no-store headers.
  - `GET /api/v/:slug/seg/:file?t=`: Verifies token, session binding, and live DB status on every segment request.
### F5 — Client Viewer Page (`/v/[slug]`)
- **Full-Viewport Custom Video Player (`app/(public)/v/[slug]/page.tsx`)**:
  - Implements HLS playback via `hls.js` with automatic fallback to native Safari HLS.
  - Custom UI controls replacing native controls: play/pause, scrub bar with buffered bar indicator, terminal lock icon indicator, mono timecodes (`0:07 / 0:30`), volume/mute, and fullscreen.
  - Bottom control bar over a 0→black 60% gradient, auto-hiding after 2.5s idle.
  - Keyboard accessibility: Space/K (play/pause), Left/Right (±5s seek), F (fullscreen), M (mute).
  - DOM drifting watermark overlay (12% opacity) containing viewer session ID and dynamic timestamp drifting across video bounds.
  - Video element protected with `controlsList="nodownload"`, `disablePictureInPicture`, and disabled context menu.
  - Locked End Card: Automatically dims player upon reaching preview end with lock icon, copy: *"That's the end of the preview. The full video is released by the editor after payment."*, and "Watch again" button that does not consume another viewer slot.
- **State Screens (DESIGN §6.9)**:
  - *Passcode Modal*: Card with `KeyRound` icon, letter-spaced uppercase passcode input, 300ms error shake animation, and lockout notices.
  - *Loading State*: Poster skeleton with shimmer animation.
  - *Preview Not Ready*: Card with spinner and auto-polling until worker processing completes.
  - *Viewer Limit Reached*: Card with `UsersRound` icon (*"This link has reached its viewer limit"*).
  - *Expired*: Card with `Clock` icon (*"This link has expired"*).
  - *Revoked*: Card with `Ban` icon (*"This link is no longer available"*).
  - *Not Found*: Card with `SearchX` icon (*"We can't find that link"*).
  - *Unlocked*: Success card with `BadgeCheck` icon, filename, mono size, uncompressed master banner, and **Download full video** button.
  - *Preview Download*: Dedicated secondary download action when `allowPreviewDownload` is enabled.
- **Token Rotation**:
  - Automatically queries `POST /api/v/:slug/token` every 40s to refresh stream token during active sessions. Immediately stops playback if link is revoked.

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
