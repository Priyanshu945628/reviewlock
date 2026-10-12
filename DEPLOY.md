# DEPLOY.md — ReviewLock Railway Production Deployment Guide

This guide provides the complete, step-by-step procedure for deploying ReviewLock to Railway with a persistent volume, PostgreSQL database, background FFmpeg processing worker, and Google Drive master storage.

---

## 1. Prerequisites

1. **Railway Account**: Access to [Railway Dashboard](https://railway.app/).
2. **Google Cloud Console**:
   - Google Cloud project with **Google Drive API** enabled.
   - OAuth 2.0 Client ID (Application type: *Web application*).
   - Authorized redirect URI: `http://localhost:8085/oauth2callback`.
   - OAuth Consent Screen Publishing status set to **"In production"** (never "Testing", so refresh tokens never expire after 7 days).
3. **Google Refresh Token**:
   - Run `npm run drive:token` locally to obtain `GOOGLE_REFRESH_TOKEN`.

---

## 2. Step-by-Step Railway Deployment

### Step 1: Create Railway Project & Services
1. In Railway, click **New Project** → **Deploy from GitHub repo**.
2. Select the `ReviewLock` repository.
3. Click **Add Plugin** → **PostgreSQL** to provision a managed PostgreSQL database.

### Step 2: Attach Persistent Volume at `/data`
> [!IMPORTANT]
> A persistent volume at `/data` is strictly mandatory. It stores in-flight upload chunks, HLS renditions, and timeline scrub sprites.
1. In your web service settings on Railway, navigate to **Volumes**.
2. Click **Add Volume**.
3. Set the Mount Path to:
   ```
   /data
   ```
4. Save changes. The container will mount persistent NVMe storage directly at `/data`.

### Step 3: Configure Environment Variables
In the service's **Variables** tab, configure every variable defined in `CONTRACT.md` §8:

| Variable | Recommended Value / Notes |
|---|---|
| `PORT` | `3000` (or Railway default `${{PORT}}`) |
| `NODE_ENV` | `production` |
| `APP_URL` | `https://your-app-domain.up.railway.app` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Reference Railway Postgres) |
| `DATA_DIR` | `/data` |
| `STORAGE_PROVIDER` | `google-drive` (*Strictly required; mock throws error in prod*) |
| `SESSION_SECRET` | 32+ character random secret (e.g. `openssl rand -hex 32`) |
| `STREAM_TOKEN_SECRET` | 32+ character random secret |
| `DOWNLOAD_TOKEN_SECRET` | 32+ character random secret |
| `GOOGLE_CLIENT_ID` | Your Google Cloud OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Your Google Cloud OAuth Client Secret |
| `GOOGLE_REFRESH_TOKEN` | Acquired via `npm run drive:token` |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | `ReviewLock-Originals` (or folder alphanumeric ID) |
| `MAX_STORAGE_PER_USER_GB` | `20` |
| `CHUNK_SIZE_MB` | `8` |
| `PREVIEW_MAX_HEIGHT` | `1080` |
| `RESEND_API_KEY` | *(Optional)* For editor email alerts on client opens |

### Step 4: Database Migrations
Run initial migrations against the provisioned database:
```bash
railway run npm run db:migrate
```
Or seed with initial demo editor account:
```bash
railway run npm run db:seed
```

### Step 5: Container Build & Healthcheck
- Railway detects the root `Dockerfile` (`node:20-bookworm-slim` with FFmpeg installed and non-root `nextjs` user).
- `railway.json` declares:
  ```json
  {
    "$schema": "https://railway.app/railway.schema.json",
    "build": {
      "builder": "DOCKERFILE",
      "dockerfilePath": "Dockerfile"
    },
    "deploy": {
      "healthcheckPath": "/api/health",
      "healthcheckTimeout": 120,
      "restartPolicyType": "ON_FAILURE",
      "restartPolicyMaxRetries": 5
    }
  }
  ```
- `start.sh` starts both the pg-boss background worker (`scripts/worker.ts`) and the Next.js production server concurrently.

---

## 3. Post-Deployment Verification Checklist

- [ ] **Health Endpoint**:
  Navigate to `https://your-domain/api/health`. Confirm response returns HTTP 200:
  ```json
  {
    "ok": true,
    "data": {
      "db": "ok",
      "drive": "ok"
    }
  }
  ```
- [ ] **Editor Auth**:
  Navigate to `/login`. Sign in with your editor credentials. Verify session cookie `rl_sess` is created with `httpOnly`, `secure`, and `sameSite=lax`.
- [ ] **Chunked Resumable Upload**:
  Upload a video file (e.g. 50–200 MB). Verify chunks assemble on `/data/uploads`, FFmpeg extracts duration and resolution, and job enqueues.
- [ ] **Worker Pipeline**:
  Confirm worker transcodes 4-second HLS segments with burned-in `drawtext` watermark, uploads original master to Google Drive, deletes local original, and marks project ready.
- [ ] **Share Link & Passcode**:
  Create a private share link with a custom preview range and 6-letter passcode. Open in incognito window. Verify 5-try lockout on incorrect codes.
- [ ] **HLS Streaming & Watermark**:
  Verify HLS proxy streams smoothly on `hls.js`, 12% opacity drifting DOM watermark displays viewer fingerprint, and playback halts cleanly upon link revocation.
- [ ] **Payment Release & Live-Piped Download**:
  In editor dashboard, click **Release full video**. On client viewer page, click **Download full video**. Verify single-use download token is consumed and original master is live-piped directly from Google Drive with byte-identical integrity.
