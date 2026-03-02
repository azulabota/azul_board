#!/usr/bin/env bash
set -euo pipefail

# LaunchAgents run with a minimal PATH. Ensure Homebrew tools are available.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="$ROOT_DIR/scripts/generation-worker.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  echo "Copy scripts/generation-worker.env.example to scripts/generation-worker.env and fill it in." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

# Basic validation
if [[ -z "${SUPABASE_URL:-}" ]] || [[ "${SUPABASE_URL:-}" != https://* ]]; then
  echo "SUPABASE_URL must be set to a valid https://... supabase URL" >&2
  exit 1
fi
if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "SUPABASE_SERVICE_ROLE_KEY is missing" >&2
  exit 1
fi

export SUPABASE_URL
export SUPABASE_SERVICE_ROLE_KEY
export MODEL_PROVIDER="${MODEL_PROVIDER:-codex}"
export GENERATION_WORKER_POLL_MS="${GENERATION_WORKER_POLL_MS:-2000}"
export CODEX_MODEL="${CODEX_MODEL:-}"

# Ensure deps are available
if [[ ! -d node_modules ]]; then
  npm install
fi

exec /opt/homebrew/bin/npx tsx scripts/generation-worker.ts
