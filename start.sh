#!/bin/sh
set -e

echo "[ReviewLock] Starting container initialization..."

# Ensure volume mount directory exists
mkdir -p "${DATA_DIR:-/data}"

# Launch background worker
if [ -f "worker.js" ]; then
  echo "[ReviewLock] Starting background worker..."
  node worker.js &
fi

# Launch Next.js web application
echo "[ReviewLock] Starting Next.js web application on port ${PORT:-3000}..."
exec npm run start -- -p "${PORT:-3000}" -H 0.0.0.0
