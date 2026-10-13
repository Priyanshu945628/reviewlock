#!/bin/sh
set -e

echo "[ReviewLock] Starting container initialization..."

# Ensure volume mount directory exists
mkdir -p "${DATA_DIR:-/data}"

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
