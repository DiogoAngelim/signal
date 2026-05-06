#!/bin/zsh
set -euo pipefail

cd "${0:a:h}"

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

export PORT="${PORT:-4000}"
export SERVE_FRONTEND="${SERVE_FRONTEND:-true}"
export ENABLE_BACKGROUND_SIGNAL_ENGINE="${ENABLE_BACKGROUND_SIGNAL_ENGINE:-false}"
export NODE_ECU_API_BASE_URL="${NODE_ECU_API_BASE_URL:-off}"

pnpm run build
exec node src/artifacts/api-server/dist/index.mjs
