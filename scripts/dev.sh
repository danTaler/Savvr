#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT="$(dirname "$(dirname "$(readlink -f "$0")")")"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  source "$ROOT/.env"
  set +a
fi
export APP_ENV=development
export APP_PASSWORD="${APP_PASSWORD:-budget-local-dev}"
export API_PORT="${API_PORT:-8000}"
export WEB_PORT="${WEB_PORT:-5173}"
export API_URL="http://127.0.0.1:$API_PORT"
command -v python3 >/dev/null || { echo "Install Python 3.11+."; exit 1; }
command -v npm >/dev/null || { echo "Install Node.js 20.19+ and npm."; exit 1; }
if [[ ! -x "$ROOT/.venv/bin/python" ]]; then
  python3 -m venv "$ROOT/.venv" || python3 -m venv --without-pip "$ROOT/.venv"
fi
if ! "$ROOT/.venv/bin/python" -m pip --version >/dev/null 2>&1; then
  python3 -m pip --python "$ROOT/.venv/bin/python" install pip
fi
"$ROOT/.venv/bin/python" -m pip install -q -r "$ROOT/backend/requirements.txt"
if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  npm --prefix "$ROOT/frontend" ci
fi
"$ROOT/.venv/bin/alembic" -c "$ROOT/backend/alembic.ini" upgrade head
PIDS=()
cleanup() {
  trap - EXIT INT TERM
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait || true
}
trap cleanup EXIT INT TERM
"$ROOT/.venv/bin/python" -m uvicorn app.main:app --app-dir "$ROOT/backend" --host 127.0.0.1 --port "$API_PORT" --reload --reload-dir "$ROOT/backend/app" &
PIDS+=("$!")
# Launch Vite directly so cleanup owns the actual server process.
node "$ROOT/frontend/node_modules/vite/bin/vite.js" "$ROOT/frontend" --host 127.0.0.1 --port "$WEB_PORT" &
PIDS+=("$!")
echo "Hearth is starting at http://127.0.0.1:$WEB_PORT"
echo "Default development password: budget-local-dev (unless APP_PASSWORD is configured)."
echo "Press Ctrl+C to stop both servers. Development binds to loopback only."
wait -n "${PIDS[@]}"
