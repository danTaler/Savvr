#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(dirname "$(dirname "$(readlink -f "$0")")")"
[[ -f "$ROOT/.env" ]] || { echo "Create .env using .env.example and configure production secrets and DOMAIN."; exit 1; }
command -v docker >/dev/null || { echo "Install Docker Engine and the Docker Compose plugin."; exit 1; }
set -a
source "$ROOT/.env"
set +a
APP_PASSWORD="${APP_PASSWORD:-}"
SESSION_SECRET="${SESSION_SECRET:-}"
[[ ${#APP_PASSWORD} -ge 16 && "$APP_PASSWORD" != "budget-local-dev" ]] || { echo "APP_PASSWORD must be a unique 16+ character password."; exit 1; }
[[ ${#SESSION_SECRET} -ge 32 ]] || { echo "SESSION_SECRET must contain at least 32 characters."; exit 1; }
[[ -n "${DOMAIN:-}" && -n "${POSTGRES_PASSWORD:-}" ]] || { echo "Set DOMAIN and POSTGRES_PASSWORD."; exit 1; }
[[ "$POSTGRES_PASSWORD" =~ ^[A-Za-z0-9_-]{20,}$ ]] || { echo "Use a URL-safe POSTGRES_PASSWORD with 20+ characters (for example, a random hex secret)."; exit 1; }
docker compose --project-directory "$ROOT" -f "$ROOT/compose.yaml" config --quiet
docker compose --project-directory "$ROOT" -f "$ROOT/compose.yaml" up --build -d --wait
echo "Hearth is running at https://$DOMAIN"
