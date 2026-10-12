import http from "node:http";
import url from "node:url";
import readline from "node:readline";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(`
================================================================================
ERROR: Missing Google OAuth Credentials
--------------------------------------------------------------------------------
Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file
or pass them as environment variables before running this script.

Usage:
  npx tsx scripts/get-drive-token.ts
================================================================================
`);
  process.exit(1);
}

const REDIRECT_PORT = 8085;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // Forces consent screen to ensure refresh_token is returned
  scope: ["https://www.googleapis.com/auth/drive.file"],
});

console.log(`
================================================================================
ReviewLock Google Drive OAuth Token Generator
================================================================================

1. Ensure in Google Cloud Console:
   - Google Drive API is enabled.
   - OAuth Consent Screen Publishing status is set to "In production" (never "Testing").
   - Authorized redirect URI contains: ${REDIRECT_URI}

2. Open the following URL in your browser with the Google account that owns
   the Google One / Drive storage:

${authUrl}

--------------------------------------------------------------------------------
Waiting for authorization callback on port ${REDIRECT_PORT}...
(Or paste authorization code directly if running headlessly)
`);

let serverClosed = false;

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url || "", `http://localhost:${REDIRECT_PORT}`);
    if (parsedUrl.pathname === "/oauth2callback") {
      const code = parsedUrl.searchParams.get("code");
      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<h1>Authorization Successful!</h1><p>You can close this tab and return to the terminal.</p>"
        );
        handleCode(code);
      } else {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Authorization code not found in request.");
      }
    }
  } catch (err) {
    console.error("Error processing callback:", err);
  }
});

server.listen(REDIRECT_PORT);

// Also provide manual terminal prompt fallback
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Enter authorization code manually (optional): ", (code) => {
  if (code.trim()) {
    handleCode(code.trim());
  }
});

async function handleCode(code: string) {
  if (serverClosed) return;
  serverClosed = true;
  rl.close();
  server.close();

  try {
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      console.warn(`
WARNING: No refresh token returned.
This happens if consent prompt wasn't forced or app was previously authorized.
Try revoking app permissions in Google Account Security and running this script again.
`);
    } else {
      console.log(`
================================================================================
SUCCESS! Google OAuth Refresh Token Acquired
================================================================================
Add this to your .env and Railway Environment Variables:

GOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"
================================================================================
`);
    }
    process.exit(0);
  } catch (err) {
    console.error("Failed to exchange code for tokens:", err);
    process.exit(1);
  }
}
