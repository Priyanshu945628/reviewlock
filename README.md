# ReviewLock

> Video review links with locked full-quality originals. Video editors share a protected preview link, and clients can download the full-quality original byte-identical to what was uploaded only after the editor unlocks it.

---

## Deploy to Railway

Follow this step-by-step checklist to deploy ReviewLock on Railway.

### 1. Create Railway Project & Add Plugins
1. Open [Railway Dashboard](https://railway.app/) and create a new project.
2. Add a **PostgreSQL** database service (`+ New` -> `Database` -> `PostgreSQL`).
3. Add a new service from your GitHub repository containing ReviewLock.

### 2. Configure Railway Volume
> **CRITICAL (CONTRACT §3):** Railway Volumes can attach to only ONE service. All original uploads, processing queues, and preview renditions live on `/data`. Previews are never stored on Google Drive.
1. In your application service settings, navigate to the **Volumes** tab.
2. Click **+ Add Volume**.
3. Set the Mount Path to `/data`.

### 3. Setup Google Cloud OAuth Credentials
> **CRITICAL (CONTRACT §4):** A single personal Google account (with Google One storage) is connected once from the backend via a refresh token. Editors and clients NEVER connect Google accounts.

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Enable the **Google Drive API** under **APIs & Services** > **Library**.
4. Configure the **OAuth Consent Screen**:
   - User Type: **External**.
   - **Publishing status:** Set to **"In production"**.
     *(DO NOT leave in "Testing" mode! In "Testing" mode, refresh tokens expire every 7 days and background uploads will silently fail).*
5. Go to **Credentials** -> **Create Credentials** -> **OAuth client ID**:
   - Application type: **Web application**.
   - Authorized redirect URIs: Add `http://localhost:8085/oauth2callback`.
6. Note down `Client ID` and `Client Secret`.
7. In Google Drive, create a folder named `ReviewLock-Originals`. Open the folder in your browser and copy its folder ID from the URL (`drive.google.com/drive/folders/<FOLDER_ID>`).
8. Generate your refresh token locally by running:
   ```bash
   GOOGLE_CLIENT_ID="your-id" GOOGLE_CLIENT_SECRET="your-secret" npm run drive:token
   ```
   Follow the prompt in your browser to authorize access, and copy the printed `GOOGLE_REFRESH_TOKEN`.

### 4. Configure Railway Environment Variables
In your Railway Application Service, configure the following variables under the **Variables** tab:

| Variable | Description | Example / Reference |
|---|---|---|
| `DATABASE_URL` | Reference to Postgres plugin | `${{Postgres.DATABASE_URL}}` |
| `APP_URL` | Public production domain | `https://${{RAILWAY_PUBLIC_DOMAIN}}` |
| `SESSION_SECRET` | 32+ char random string for session cookies | `openssl rand -hex 32` |
| `STREAM_TOKEN_SECRET` | 32+ char random HMAC key for stream tokens | `openssl rand -hex 32` |
| `DOWNLOAD_TOKEN_SECRET` | 32+ char random HMAC key for download tokens | `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | `GOCSPX-xxx` |
| `GOOGLE_REFRESH_TOKEN` | Refresh token from `npm run drive:token` | `1//xxx` |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID`| ID of `ReviewLock-Originals` folder | `1a2b3c4d5e...` |
| `DATA_DIR` | Railway Volume mount path | `/data` |
| `MAX_UPLOAD_GB` | Maximum single upload limit in GB | `5` |
| `MAX_STORAGE_PER_USER_GB` | Storage quota per editor in GB | `20` |
| `PREVIEW_MAX_HEIGHT` | Maximum preview vertical resolution | `720` |
| `RESEND_API_KEY` | (Optional) Email notifications | |
| `PORT` | Web server port (injected by Railway) | `3000` |
| `NODE_ENV` | Environment mode | `production` |

### 5. Deployment Verification
1. Railway will automatically build the `Dockerfile` and start both the worker and web processes via `start.sh`.
2. The healthcheck endpoint `/api/health` validates both PostgreSQL and Google Drive reachability.
