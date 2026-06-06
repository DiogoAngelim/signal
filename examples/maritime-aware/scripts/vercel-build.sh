#!/usr/bin/env sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../../.."
export NODE_OPTIONS=--max-old-space-size=16384
export NPM_CONFIG_NODE_OPTIONS=--max-old-space-size=16384
export API_OUTPUT_ROOT=api

cd packages/decision
corepack pnpm exec tsc -p tsconfig.json

cd ../decision-memory
corepack pnpm exec tsc -p tsconfig.json

cd ../../api/protocol
corepack pnpm exec tsc -p tsconfig.json

cd ../runtime
corepack pnpm exec tsc -p tsconfig.json

cd ../../examples/maritime-aware
corepack pnpm build
