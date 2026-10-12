# CHUNKS.md — prompts to feed the builder agent, one per session

**Start of EVERY session, paste this first:**
```
Read CONTRACT.md and DESIGN.md fully. Obey them. Do only the chunk below.
First give me: (1) the goal in your own words, (2) the files you will create/modify,
(3) risks or contract conflicts. Then build. Finish with: what I must test manually,
what the next chunk depends on, and any deviations. Update ARCHITECTURE.md.
```

**Order matters.** Backend chunks (B) play to Antigravity's strength. Frontend chunks (F) are
built against mock data first so UI quality is judged without a backend.

---

## B0 — Scaffold, Railway, env, Drive auth
```
Build ONLY:
- Next.js (App Router, TypeScript) + Tailwind + Drizzle + pg-boss project scaffold.
- Dockerfile (node:20-bookworm-slim, apt-get install ffmpeg, non-root user, builds Next, starts
  web + worker via a start script). railway.json with healthcheck /api/health.
- lib/env.ts: zod validation of every variable in CONTRACT §8, fail fast with a readable message.
- .env.example with every variable and a comment each.
- StorageProvider interface + GoogleDriveProvider (CONTRACT §4): putOriginal (resumable),
  streamOriginal (Range support), deleteOriginal, with retry/backoff.
- scripts/get-drive-token.ts (one-time OAuth consent -> prints refresh token).
- scripts/drive-smoke-test.ts: uploads a 5 MB file, verifies md5, streams it back, deletes it.
- GET /api/health (checks DB and Drive reachability).
- README section "Deploy to Railway": volume at /data, Postgres plugin, variables list,
  Google Cloud steps (enable Drive API, OAuth client, consent screen set to In production).
- smoke test must also prove the PIPE approach: stream a 200 MB file from Drive to a sink with Range
  support while memory stays flat, and show time-to-first-byte (never download-first).
Done when: smoke test passes locally and /api/health returns ok.
```

## B1 — Database and editor auth
```
Build ONLY: Drizzle schema + migrations for every table in CONTRACT §7, signup/login/logout/me
(argon2id, DB sessions, httpOnly secure sameSite=lax cookie), auth middleware, rate limiting on
auth routes, seed script with the sample content from DESIGN §12. Tests for auth and sessions.
```

## F1 — Design system (NO backend needed)
```
Build ONLY: fonts, CSS tokens from DESIGN §3, Tailwind mapping, all core components from DESIGN §4,
and the /dev/components showcase page showing every state of every component.
Also lib/format.ts (formatTimecode, formatBytes, formatRelative) with unit tests.
Do not build any product screens yet. When done, screenshot /dev/components at 1440px and 390px
and compare to DESIGN §1 and the Hard NO list. Fix mismatches before reporting.
```

## F2 — App shell, auth screens, dashboard (mock data)
```
Build ONLY: app shell (DESIGN §5), login/signup (§6.2), dashboard grid + list + empty + loading + error
(§6.3), using mocks from /lib/mocks behind NEXT_PUBLIC_USE_MOCKS. Typed API client in lib/api.ts
matching CONTRACT §9. Screenshot at 1440 and 390 and self-review against DESIGN.
```

## B2 — Upload pipeline
```
Build ONLY: CONTRACT §5 — POST /api/uploads, PUT chunk, GET resume info, complete, ffprobe
validation, size/type limits, assembly on /data/uploads, enqueue process-project job.
Also: per-user storage quota (CONTRACT §4.0) + GET /api/me/storage + disk-space guard.
Tests: quota exceeded rejection, resume after dropped chunk, oversize rejection, non-video rejection, concurrent chunks.
```

## B3 — Processing worker (FFmpeg)
```
Build ONLY: the pg-boss worker (max 2 concurrent jobs). For each project: ffprobe metadata; preview HLS cut per
share-link settings (4s segments, H.264, max height PREVIEW_MAX_HEIGHT, AAC, burned-in
watermark via drawtext, faststart); optional watermarked preview MP4; thumbnail sprite + VTT
for the timeline selector; then upload original to Drive, verify md5+size, delete the local
original, mark project ready. Retries with backoff, failure states, progress percentage written
to DB. Re-running when link settings change creates a new rendition version. Never modify the original.
Because no link exists at first upload, generate a default 60s preview + sprite on upload.
```

## F3 — Upload UI + project detail (mock, then wired)
```
Build ONLY: upload dialog + docked upload tray (DESIGN §6.4), project detail page (§6.5) with
link rows. First with mocks; then wire to real B1-B3 endpoints and remove the mock flag for these
screens. Chunked resumable uploader with pause/resume/cancel and auto-resume on network loss.
```

## B4 — Share link engine
```
Build ONLY: share link create/list/edit/revoke endpoints, 128-bit slugs, argon2id passcodes,
state machine with audit_log, re-run preview pipeline on range/watermark change, activity endpoint.
Tests for every transition and for illegal ones.
```

## F4 — Share link drawer + TimelineRangeSelector
```
Build ONLY: the create/edit drawer (DESIGN §6.6) and the TimelineRangeSelector exactly as specified
(thumb filmstrip, hatch-locked region, handles, keyboard + touch, summary line). Add the success state.
Wire to B4. Build the selector in isolation on /dev/components first with fake thumbnails.
```

## B5 — Viewer access and streaming
```
Build ONLY: viewer endpoints in CONTRACT §9: link meta, open (passcode, atomic slot claim exactly as
CONTRACT §6, cookie session), token refresh, playlist rewriting, segment serving with token+session+status
checks on every request, preview-download. Rate limiting, passcode lockout, enumeration-safe errors.
Tests: 50 parallel opens with max_viewers=1 -> exactly 1 succeeds; expired token 403; token for link A
rejected on link B; revoked mid-playback stops segments within one token TTL.
```

## F5 — Client viewer page
```
Build ONLY: /v/[slug] exactly as DESIGN §6.9: custom player on hls.js, token refresh every 40s,
scrub bar limited to preview length, DOM watermark overlay, end card, every state in the state table
(passcode, preparing, limit reached, expired, revoked, not found, unlocked, preview download).
Test at 375, 768, 1440. Fast start: poster first, first segment buffered before play.
```

## B6 + F6 — Payment gate, unlock, original download
```
Backend: POST /api/links/:id/unlock, download-token (one-time, 5 min, hashed in DB), download endpoint
that PIPES the ORIGINAL live from Drive (CONTRACT §4.0.2: Range passthrough, 206 responses, backpressure,
abort Drive request when client disconnects, flat memory, never download-first), Content-Disposition, no re-encode.
Verify byte-identical output (sha256 test). Audit-log every grant and download.
Frontend: storage meter (DESIGN §5, §6.8) can be wired here too. "Release full file" flow (DESIGN §6.7) and the Unlocked viewer state with download progress.
```

## B7 — Hardening
```
Security pass: token replay, enumeration, CORS, CSP, security headers, bucket/folder permission audit
(confirm Drive folder has NO sharing), signed-token expiry tests, race-condition tests, log redaction
(never log tokens, passcodes, Drive IDs). Produce SECURITY.md: threats, mitigations, known limits
(screen recording, cookie clearing, Drive quotas).
```

## F7 + B8 — Polish, notifications, analytics, deploy
```
Notifications when the client first opens a link (Resend, optional), per-link analytics, StatusTimeline,
settings page (DESIGN §6.8), 404/500 pages, reduced-motion pass, accessibility audit (Lighthouse >= 95),
final DESIGN §14 checklist. Then produce a step-by-step Railway deploy checklist and verify
production env validation fails fast when a variable is missing.
```

---

## Tips for working with Antigravity on the frontend
- Give it **DESIGN.md as the only visual authority** and make it screenshot its own work. Agents that can
  see their output fix far more than agents that only write code.
- If a screen looks generic, don't say "make it prettier". Say which DESIGN section it violates
  (e.g. "§1 Hard NO list: you used a gradient; §3 radius max 14px").
- Review F1 (design system) yourself before moving on. Every later screen inherits it, so a weak
  F1 spoils everything.
- Commit after every chunk; if an IDE drifts from the contract, roll back and re-run the chunk.
