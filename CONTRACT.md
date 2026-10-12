# CONTRACT.md — "ReviewLock" (working name)

> Read this file AND DESIGN.md before every task. If a request conflicts with this
> contract, STOP and tell me instead of improvising. Never build ahead of the
> current chunk. Never change this file without telling me.

## 0. Your role
You are a senior full-stack engineer and security-minded architect. Before coding
each chunk: (1) restate the goal, (2) list files you will create/modify,
(3) wait for nothing, but code only what the chunk asks. End every chunk with:
(a) what I must manually test, (b) what the next chunk depends on,
(c) any contract deviations.

---

## 1. Product
Video editors upload finished work and send clients a protected review link.
The client can only watch a short, watermarked preview. After the client pays,
the editor unlocks the full-quality original from the dashboard and the client
can download it, byte-identical to what was uploaded.

**Users**
- Editor: logged in, owns projects, configures links, grants access.
- Client (viewer): not logged in, opens a link, sees only the preview.

**Per share link, the editor sets**
| Setting | Values |
|---|---|
| visibility | `private` (passcode required) or `public` (anyone with link) |
| preview_mode | `first_n_seconds` or `custom_segment` (start, end) |
| preview_duration | seconds (hard cut: only this much exists for the client) |
| max_viewers | integer, default 1 (unique viewer sessions) |
| expires_at | optional |
| allow_preview_download | boolean (downloads ONLY the watermarked preview file) |
| watermark_text | default: `PREVIEW · NOT PAID` + client label |
| client_label | optional text, e.g. "Rahul – Wedding Reel" |

---

## 2. Core security principle (non-negotiable)
The full original must NEVER reach a viewer's browser before the editor unlocks.

1. On upload, the server builds a **separate preview rendition**: cut to the
   allowed range, re-encoded, watermark burned in. Viewers can only ever reach this.
2. The original lives in a **private Google Drive folder**. Drive file IDs and
   Drive URLs are never sent to any browser. Drive is never shared publicly.
3. All limits are enforced **server-side**. Hidden buttons, disabled controls and
   JS checks are decoration only and must be documented as such.
4. Stream access uses short-lived HMAC tokens (TTL 60s, refreshed by the player)
   bound to `link_id + viewer_session_id`.
5. Viewer counting is atomic in SQL (see §6).
6. The full download exists only when link status is `unlocked`, via a one-time
   token (TTL 5 min) that makes the server stream the original from Drive.
   No re-encode, no quality loss.
7. Rate limiting on every public endpoint; passcode brute-force lockout.
8. **Honest limitation (document in SECURITY.md):** screen recording cannot be
   prevented. Mitigation: burned-in watermark plus a visible dynamic overlay
   (viewer session ID + timestamp).

---

## 3. Stack (decided — do not substitute without asking)
| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript everywhere**, Node.js 20 | One language for backend and frontend keeps AI sessions consistent. Rust is unnecessary here. |
| Web + API | **Next.js (App Router)**, route handlers for the API | Single deployable. |
| DB | **PostgreSQL** (Railway plugin) + **Drizzle ORM** | |
| Queue | **pg-boss** (queue inside Postgres) | No Redis needed. |
| Video | **FFmpeg** installed via Dockerfile | |
| Streaming | **HLS** (m3u8 + .ts/.m4s segments) with hls.js | |
| Original storage | **Google Drive** (my single paid Google One account, backend-only, private folder) | Editors never connect Google. |
| Preview storage | **Railway Volume** mounted at `/data` | Fast, local, never touches Drive quota. |
| Editor auth | Email + password (argon2id), DB-backed sessions, httpOnly secure cookie | |
| Validation | zod on every input | |
| Hosting | **Railway** | |

### Why previews are NOT on Google Drive
Drive has no CDN, no signed URLs, per-file download quotas and API rate limits.
It is fine for storing and occasionally downloading originals. It is bad for
streaming video segments. So: originals → Drive, previews → Railway volume.

### Railway topology (important)
A Railway Volume can attach to only ONE service. Therefore:
- **One service** runs both the Next.js server and the FFmpeg worker
  (start script launches both processes: `node worker.js & next start`).
- Add the **Postgres** plugin. Use Railway reference variables for `DATABASE_URL`.
- Use a **Dockerfile** (node:20-bookworm-slim + `apt-get install -y ffmpeg`).
  Do not rely on Nixpacks for ffmpeg.
- Volume mount path: `/data`. Healthcheck path: `/api/health`.
- Size the volume for concurrent uploads: each in-flight original sits on `/data` until Drive
  verification passes. Limit concurrent processing jobs (e.g. 2) to protect disk.
- Railway filesystem outside `/data` is ephemeral. Never store anything important there.

---

## 4. Google Drive integration spec

### 4.0 Single-owner storage model (decided)
- There is exactly ONE Google account: mine (paid Google One plan, so it has the
  storage). It is connected **only from the backend**, once, via the refresh token.
- Editors and clients NEVER sign in to Google, never see Drive, and never grant
  any Google permission. No "Connect Google Drive" button anywhere in the UI.
- All editors' originals share my Drive quota, so the APP must enforce per-user
  storage limits (`MAX_STORAGE_PER_USER_GB`, tracked in `users.storage_used_bytes`)
  and check them BEFORE accepting an upload. Show usage in the UI (see DESIGN.md).
- Drive is meant for personal storage, not high-volume serving. That is fine for
  this project. Keep everything behind `StorageProvider` so it can move to R2/S3 later.

### 4.0.1 Where Drive is and is NOT in the request path
| Action | Path | Drive involved? |
|---|---|---|
| Client watches preview | Railway Volume → app → browser (HLS) | **No.** Preview files were made at upload time and live on `/data`. First frame is fast and independent of Drive. |
| Preview download | Railway Volume → browser | **No** |
| Original upload | browser → `/data` temp → FFmpeg preview → Drive | Yes, in the background after the preview exists |
| **Full download after unlock** | Drive → app → browser, **piped live** | Yes |

### 4.0.2 Streaming the original: PIPE it, never download-first
Do NOT download the whole file from Drive to the server and then send it. That
makes the client wait for the full transfer, uses double the disk and time, and
can fill the Railway volume. Instead:
1. Open `drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })`,
   passing the browser's `Range` header through to Drive's `Range` request.
2. Pipe the Drive stream straight into the HTTP response (`stream.pipeline`),
   with backpressure. First bytes reach the client as soon as Drive sends them.
3. Return `206 Partial Content` + `Content-Range` for range requests and
   `Accept-Ranges: bytes`, so downloads can resume and download managers work.
4. Memory use stays flat (a few MB) regardless of file size.
5. If the client disconnects, abort the Drive request immediately.
6. Optional later optimization (not v1): after unlock, cache the original on
   `/data` for 24h if repeated downloads become common.

### 4.1 Auth details
- Use `googleapis` with an **OAuth2 client + refresh token** of my personal
  Google account (service accounts have no storage quota on personal Drive, so
  do NOT use a service account).
- Scope: `https://www.googleapis.com/auth/drive.file` only.
- Provide `scripts/get-drive-token.ts`: a one-time local script that runs the
  OAuth consent flow and prints the refresh token for me to paste into Railway.
- Document in README: set the Google Cloud OAuth consent screen to
  **"In production"**. In "Testing" mode refresh tokens expire after 7 days and
  uploads will silently start failing.
- Create (once) a folder named `ReviewLock-Originals`; store its ID in
  `GOOGLE_DRIVE_ROOT_FOLDER_ID`. Each original goes to `<root>/<projectId>/original.<ext>`.
- Upload with the **resumable upload** API. After upload, verify `size` and
  `md5Checksum` against the local file. Only then delete the local copy.
- Download proxy: `drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })`
  piped to the response with `Range` support, `Content-Length`, and
  `Content-Disposition: attachment`. Never buffer the full file in memory.
- Wrap all Drive calls with retry + exponential backoff (429/5xx), and log failures
  to `audit_log`.
- Wrap Drive in an interface `StorageProvider { putOriginal, streamOriginal, deleteOriginal }`
  so it can later be swapped for R2/S3.

---

## 5. Upload flow
1. Browser requests `POST /api/uploads` (filename, size, mime) → gets `uploadId`, `chunkSize` (8 MiB).
2. Browser sends chunks `PUT /api/uploads/:id/chunk?index=n` (resumable; the
   client can ask `GET /api/uploads/:id` for received chunks and continue).
3. Chunks are written to `/data/uploads/<uploadId>/`. On `POST /api/uploads/:id/complete`
   the server assembles the file, validates it with `ffprobe` (real video stream,
   duration, resolution), and enqueues a `process-project` job.
4. Worker: generate preview renditions + thumbnail sprite → upload original to Drive →
   verify → delete local original → mark project `ready`.
5. Before accepting `POST /api/uploads`, reject with `STORAGE_QUOTA_EXCEEDED` if
   `storage_used_bytes + size > MAX_STORAGE_PER_USER_GB`. Update the counter when Drive
   verification succeeds; decrease it when a project is deleted (and delete the Drive file).
   Also reject if `/data` free space is too low for the file (`INSUFFICIENT_SERVER_SPACE`).
6. Limits: max file size from env `MAX_UPLOAD_GB`; allow mp4, mov, mkv, webm, mxf only;
   reject anything `ffprobe` doesn't recognize as video.

Project status: `uploading → uploaded → processing → ready | failed`.

---

## 6. Share links, viewers, tokens
- `slug`: 128-bit random, base64url. Never sequential.
- `passcode`: argon2id hash. 5 wrong tries per IP+link per 15 min → lockout.
- Viewer session: on first valid open, create `viewer_sessions` row and set an
  httpOnly cookie `rl_vs`. A returning viewer with the cookie does NOT consume a slot.
- Atomic slot claim (must be exactly this pattern):
  ```sql
  UPDATE share_links
     SET viewers_used = viewers_used + 1
   WHERE id = $1 AND status = 'active' AND viewers_used < max_viewers
     AND (expires_at IS NULL OR expires_at > now())
  RETURNING viewers_used;
  ```
  Zero rows returned = reject with the correct reason (exhausted / expired / revoked).
- Stream token = HMAC-SHA256(`link_id|session_id|exp`) with `STREAM_TOKEN_SECRET`, TTL 60s,
  player refreshes every 40s via `POST /api/v/:slug/token`.
- Playlist endpoint rewrites segment URLs; segment endpoint verifies token + session
  + link status on EVERY request. `Cache-Control: private, no-store` for playlists.
- Honest note: clearing cookies creates a new viewer slot attempt, which is still
  capped by `max_viewers`. Document it.

### State machine (per share link)
```
created → active → viewers_exhausted | expired | revoked → unlocked
                     └──────────── editor can unlock from any state ──────────┘
```
Transitions happen only through server functions and are written to `audit_log`.

---

## 7. Data model (source of truth; extend only with approval)
```
users(id, email, password_hash, display_name, storage_used_bytes, created_at)
sessions(id, user_id, expires_at, created_at)
projects(id, user_id, title, status, original_filename, original_size, duration_seconds,
         width, height, drive_file_id, drive_md5, created_at)
upload_sessions(id, project_id, total_size, chunk_size, received_chunks_json, status, created_at)
renditions(id, project_id, version, type[preview_hls|preview_mp4|thumb_sprite],
           local_path, duration, status, created_at)
share_links(id, project_id, slug, client_label, visibility, passcode_hash,
            preview_mode, preview_start, preview_end, max_viewers, viewers_used,
            allow_preview_download, watermark_text, expires_at, status,
            unlocked_at, created_at)
viewer_sessions(id, link_id, ip_hash, ua_hash, first_seen, last_seen)
download_grants(id, link_id, token_hash, expires_at, used_at, kind[original|preview])
audit_log(id, actor_type, actor_id, entity, entity_id, action, meta_json, created_at)
```
Changing preview settings on a link re-runs the preview pipeline (new rendition
`version`); the old version stays valid until the new one is `ready`.

---

## 8. Environment variables (Railway → Variables)
Validate with zod at boot. Fail fast with a clear message if any are missing.
Commit `.env.example`; never commit real values.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Railway Postgres reference variable |
| `APP_URL` | Public base URL (used in links and CORS) |
| `SESSION_SECRET` | Editor session signing (32+ random bytes) |
| `STREAM_TOKEN_SECRET` | HMAC for stream tokens |
| `DOWNLOAD_TOKEN_SECRET` | HMAC for download tokens |
| `GOOGLE_CLIENT_ID` | OAuth client |
| `GOOGLE_CLIENT_SECRET` | OAuth client |
| `GOOGLE_REFRESH_TOKEN` | From `scripts/get-drive-token.ts` |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | `ReviewLock-Originals` folder |
| `DATA_DIR` | `/data` (Railway Volume mount) |
| `MAX_UPLOAD_GB` | Max single file, e.g. `5` |
| `MAX_STORAGE_PER_USER_GB` | Per-editor total originals, e.g. `20` (all editors share my Drive quota) |
| `PREVIEW_MAX_HEIGHT` | e.g. `720` |
| `RESEND_API_KEY` | Optional, notifications chunk only |
| `NODE_ENV`, `PORT` | Railway injects PORT; bind to `0.0.0.0:$PORT` |

---

## 9. API surface (frontend and backend must both obey this)
All responses JSON `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.
Error codes are stable strings, e.g. `LINK_EXPIRED`, `VIEWERS_EXHAUSTED`,
`LINK_REVOKED`, `PASSCODE_REQUIRED`, `PASSCODE_WRONG`, `RATE_LIMITED`, `NOT_FOUND`, `STORAGE_QUOTA_EXCEEDED`, `INSUFFICIENT_SERVER_SPACE`.

**Editor (cookie session required)**
```
POST   /api/auth/signup | /api/auth/login | /api/auth/logout    GET /api/auth/me
GET    /api/me/storage                    { usedBytes, limitBytes }
GET    /api/projects                      list (search, status filter, pagination)
POST   /api/uploads                       start upload
PUT    /api/uploads/:id/chunk?index=n
GET    /api/uploads/:id                   resume info
POST   /api/uploads/:id/complete
GET    /api/projects/:id                  detail (+ processing progress)
PATCH  /api/projects/:id                  rename
DELETE /api/projects/:id
GET    /api/projects/:id/thumbs           sprite + vtt for the timeline selector
POST   /api/projects/:id/links            create share link
GET    /api/projects/:id/links
PATCH  /api/links/:id                     edit settings (may re-run pipeline)
POST   /api/links/:id/revoke
POST   /api/links/:id/unlock              "Mark as paid / release original"
GET    /api/links/:id/activity            timeline events
```
**Viewer (public, rate limited)**
```
GET    /api/v/:slug                       link meta + state (never leaks private info)
POST   /api/v/:slug/open                  passcode (if private) → claims slot, sets cookie
POST   /api/v/:slug/token                 refresh stream token
GET    /api/v/:slug/playlist.m3u8?t=
GET    /api/v/:slug/seg/:file?t=
GET    /api/v/:slug/preview-download      only if allow_preview_download
POST   /api/v/:slug/download-token        only if unlocked → one-time token
GET    /api/v/:slug/download?d=           streams original from Drive
GET    /api/health
```

---

## 10. Rules for every chunk
1. Output the folder structure first, then the code.
2. Every endpoint documents auth, validation, errors, rate limit.
3. Tests for each security rule (e.g. "viewer 2 rejected when max_viewers=1",
   "expired token → 403", "50 parallel opens with max_viewers=1 → exactly 1 succeeds").
4. No TODOs in security-critical paths.
5. Update `ARCHITECTURE.md` at the end of every chunk (what exists, how it connects).
6. Commit-sized work: one chunk, one commit.
