#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT="$(dirname "$(dirname "$(readlink -f "$0")")")"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  source "$ROOT/.env"
  set +a
fi
mkdir -p "$ROOT/backups"
case "${1:-local}" in
  local)
    PYTHONPATH="$ROOT/backend" "$ROOT/.venv/bin/python" -m app.backup "$ROOT/backups"
    ;;
  prod)
    FILE="$ROOT/backups/hearth-$(date -u +%Y%m%dT%H%M%S%NZ).dump"
    docker compose --project-directory "$ROOT" -f "$ROOT/compose.yaml" exec -T db pg_dump -U budget -Fc budget > "$FILE"
    echo "Backup created: $FILE"
    ;;
  *)
    echo "Usage: $0 [local|prod]"
    exit 1
    ;;
esac
