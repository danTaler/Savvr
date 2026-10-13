#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT="$(dirname "$(dirname "$(readlink -f "$0")")")"
TEMP_DIR="$(mktemp -d -t hearth-e2e.XXXXXXXX)"
export DATABASE_URL="sqlite:///$TEMP_DIR/test.db"
export APP_ENV=development
export APP_PASSWORD=e2e-private-password
export SESSION_SECRET=e2e-only-secret-not-for-production-use
export API_URL=http://127.0.0.1:8001
PIDS=()
cleanup() {
  trap - EXIT INT TERM
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait || true
  rm -rf "${TEMP_DIR:?}"
}
trap cleanup EXIT INT TERM
"$ROOT/.venv/bin/alembic" -c "$ROOT/backend/alembic.ini" upgrade head
"$ROOT/.venv/bin/python" -m uvicorn app.main:app --app-dir "$ROOT/backend" --host 127.0.0.1 --port 8001 &
PIDS+=("$!")
node "$ROOT/frontend/node_modules/vite/bin/vite.js" "$ROOT/frontend" --host 127.0.0.1 --port 5174 &
PIDS+=("$!")
wait -n "${PIDS[@]}"
