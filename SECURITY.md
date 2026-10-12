# SECURITY.md — ReviewLock Security Architecture & Threat Model

ReviewLock is built for freelance video editors and production agencies to share watermarked preview cuts with clients while protecting the high-resolution master file until payment is confirmed.

---

## 1. Threat Model & Security Boundaries

| Actor | Access Level | Threat Vector | System Countermeasure |
|---|---|---|---|
| **Public / Unauthenticated** | None | Slug enumeration & brute force probing | 128-bit cryptographically random base64url slugs (~$10^{38}$ space); uniform 404 responses; rate limiting. |
| **Passcode Attacker** | Network observer / client | Passcode brute-force guessing | In-memory sliding window lockout (5 failed attempts per 15 min per IP); Argon2id hashing with constant-time verification. |
| **Preview Viewer** | Authorized preview | Ripper / stream downloading / watermark stripping | FFmpeg burned-in `drawtext` watermark in video pixel stream; 4s HLS chunks with 60s rotating HMAC tokens; DOM drifting watermark. |
| **Concurrent Viewers** | Link recipients | Sharing link with unauthorized third parties | Atomic SQL viewer slot reservation (`max_viewers`); slots locked to hashed IP/UA fingerprints. |
| **Payment Defaulter** | Non-paying client | Attempting to access master file before release | Original master stored in private Google Drive folder with NO public link sharing; live-piped download endpoint requires editor manual unlock. |
| **Replay / Token Hijacker** | Network interceptor | Reusing streaming or download tokens | Streaming tokens expire in 60s and require active session binding; download tokens expire in 5 min and are single-use (`used_at IS NULL` atomic check). |

---

## 2. Architectural Mitigations

### 2.1 Watermark & Preview Integrity
- **Burned-In Pixel-Level Watermark**: Previews are transcoded with FFmpeg `drawtext` filter at render time. The watermark is permanently embedded into the video frame stream, making DOM element removal impossible.
- **Drifting DOM Watermark**: A secondary drifting overlay (12% opacity) renders the viewer's session fingerprint and dynamic timestamp across the viewport to deter screen capture.

### 2.2 Storage Isolation & Live-Piping
- **Isolated Storage**: Master files are transferred directly to the owner's private Google Drive folder upon upload completion. The local original on disk is deleted immediately upon verification of size and MD5 checksum.
- **Strictly No Drive Sharing**: The Google Drive root folder contains no `anyone` or `anyoneWithLink` permissions. The API operates strictly with OAuth service/refresh tokens on behalf of the application owner.
- **Live Memory-Piped Downloads**: Full file downloads are piped directly from Google Drive to the client using Node.js stream backpressure and Web Streams. Master files are never pre-downloaded to local disk, maintaining a flat memory footprint and zero disk exposure.
- **Immediate Socket Termination**: If the client disconnects or aborts during a download, the upstream Google Drive HTTP stream is destroyed immediately via `req.signal`.

### 2.3 Token Security & Cryptographic Verifications
- **Short-Lived Streaming Tokens**: HLS playlists and segments require a 60-second HMAC-SHA256 stream token bound to `linkId` and `sessionId`. Tokens are renewed automatically every 40s during active playback.
- **Constant-Time Verification**: All token HMACs and password checks utilize `crypto.timingSafeEqual` to eliminate timing side-channel attacks.
- **Single-Use Download Grants**: Full original file downloads require a 5-minute single-use token. Token consumption uses an atomic SQL query (`UPDATE download_grants SET used_at = now() WHERE id = $1 AND used_at IS NULL`) preventing replay or concurrent racing.
- **Real-Time Revocation**: On every segment request (`/api/v/:slug/seg/:file`), the database is queried for live link status. If an editor revokes a link, playback terminates immediately within the current 4-second segment.

### 2.4 Editor Authentication & Session Security
- **Argon2id Hashes**: Editor passwords are hashed using Argon2id with memory cost 65,536 KiB, 3 iterations, and parallelism 4.
- **Database Sessions**: Sessions are stored in PostgreSQL with 30-day TTL and delivered via `httpOnly`, `secure`, `sameSite=lax` cookies.
- **Strict Middleware**: All management routes (`/projects`, `/links`, `/activity`, `/settings`, `/api/projects/*`, `/api/links/*`, `/api/me/*`, `/api/uploads/*`) enforce valid session cookies.

### 2.5 Security Headers & CSP
All HTTP responses are protected with standard hardened headers:
- `Content-Security-Policy`: `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' blob: data:; media-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'`
- `X-Frame-Options: DENY` (clickjacking prevention)
- `X-Content-Type-Options: nosniff` (MIME sniffing prevention)
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()`
- `Cache-Control: private, no-store, must-revalidate` on all authenticated video segments and playlists.

### 2.6 Log Redaction
The application logs (`lib/logger.ts`) automatically filter and redact:
- Google Drive refresh tokens (`1//...`)
- Stream and download signed tokens (`raw.exp.sig`)
- Argon2id password hashes (`$argon2id$...`)
- Session cookies (`rl_sess=...`)
- Passcodes and password fields in JSON bodies
- Google Drive file IDs in request parameters

---

## 3. Known Limits & Threat Realities

1. **Screen Recording & Optical Capture**:
   - Software-level DRM and browser restrictions cannot prevent external HDMI capture devices or physical cameras pointed at a display. ReviewLock's defense relies on prominent burned-in watermarks to identify the client and render the leaked preview commercially unusable.
2. **Cookie Clearing & Viewer Quotas**:
   - If a client manually clears cookies or opens an incognito window, they cannot restore their existing session token. However, each unique open claims one viewer slot toward `max_viewers`. Once `max_viewers` is reached, subsequent attempts are rejected (`VIEWERS_EXHAUSTED`).
3. **Google Drive API Quotas**:
   - Google Drive v3 API imposes standard per-user rate limits (10 requests/second per user, with exponential backoff retries built into `lib/storage/google-drive.ts`). High-volume production setups streaming large numbers of concurrent master downloads should monitor Google Cloud quotas.

---

## 4. Vulnerability Disclosure

To report security vulnerabilities or concerns, please contact the repository maintainer directly or open an encrypted issue.
