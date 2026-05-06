#!/bin/zsh
set -euo pipefail

cd "${0:a:h}"

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

export PORT="${PORT:-4000}"
export FRONTEND_PORT="${FRONTEND_PORT:-3000}"
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://localhost:${PORT}/api}"
export VITE_WS_URL="${VITE_WS_URL:-ws://localhost:${PORT}/ws}"

if [[ -n "${DATABASE_URL:-}" ]] && command -v psql >/dev/null; then
  if psql "$DATABASE_URL" -c "\\dt" | grep -qE "No relations found|0 rows"; then
    echo "Running migrations..."
    pnpm --dir src/lib/db run push
  else
    echo "DB already migrated"
  fi
else
  echo "Skipping DB migration check: DATABASE_URL is unset or psql is unavailable"
fi

node src/artifacts/api-server/dist/index.mjs &
BACKEND_PID=$!

PORT="$FRONTEND_PORT" pnpm --dir src/artifacts/signal-markets dev &
FRONTEND_PID=$!

wait $BACKEND_PID $FRONTEND_PID
