#!/bin/sh
set -e

echo "[ReviewLock] Starting container initialization..."

# Ensure volume mount directory exists and is writable
mkdir -p "${DATA_DIR:-/data}" 2>/dev/null || true
chmod 777 "${DATA_DIR:-/data}" 2>/dev/null || true
mkdir -p /tmp/reviewlock-data 2>/dev/null || true
chmod 777 /tmp/reviewlock-data 2>/dev/null || true

# Auto-apply database migrations
if [ -n "$DATABASE_URL" ]; then
  echo "[ReviewLock] Applying database migrations..."
  npx drizzle-kit migrate || echo "[ReviewLock] Migration warning: will retry on request..."
fi

# Launch background worker
if [ -f "scripts/worker.ts" ]; then
  echo "[ReviewLock] Starting background worker via tsx..."
  npx tsx scripts/worker.ts &
elif [ -f "worker.js" ]; then
  echo "[ReviewLock] Starting background worker..."
  node worker.js &
fi

# Launch Next.js web application
echo "[ReviewLock] Starting Next.js web application on port ${PORT:-3000}..."
exec npm run start -- -p "${PORT:-3000}" -H 0.0.0.0
