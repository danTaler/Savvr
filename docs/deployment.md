# Deployment and recovery

## Local acceptance

Before VPS deployment, test exports from all four banks and the card provider, overlapping date ranges, account renames, salary/rental classification, loan allocations, and backup restoration. Confirm that transaction IDs remain stable. Identify the two unnamed banks and enter the real property names.

The default dev database is SQLite (`backend/data/budget.db`). Monetary values are stored as integer cents locally and PostgreSQL numeric values in production. Do not copy raw SQLite tables into PostgreSQL: re-import the CSVs and recreate metadata, or implement and verify a typed migration utility first.

## VPS setup

1. Provision a Linux VPS with Docker Engine and the current Compose plugin.
2. Point a domain's DNS at the VPS. Permit inbound ports 80/443, and restrict SSH appropriately. Do not publish the API or database ports.
3. Transfer the project without `.venv`, `node_modules`, local databases, `.env`, test artifacts, or sample financial files.
4. Create `.env` from the example. Set `DOMAIN` to the hostname without `https://`; use strong unique `APP_PASSWORD` (16+ characters), `SESSION_SECRET` (32+), and a URL-safe `POSTGRES_PASSWORD` (20+ alphanumeric, `_`, or `-`).
5. Generate independent random secrets with `openssl rand -hex 32`, protect `.env` with owner-only permissions, and avoid committing it. Bash values containing spaces or special characters must be quoted.
6. Run `bash scripts/prod.sh`. The script runs Docker Compose, waits for PostgreSQL, applies migrations through a one-shot service, and starts the API and Caddy frontend.
7. Open `https://YOUR_DOMAIN`, sign in, test a small import, and verify a repeat import saves zero duplicates.

Caddy obtains HTTPS certificates automatically. PostgreSQL data and Caddy certificates use named persistent volumes. `docker compose down` retains named volumes; **never use `down -v` against data you need**.

The container setup is for a single-owner deployment. There is no tenant isolation, public registration, subscription handling, or password recovery. Do not market or operate this MVP as a public multi-user SaaS.

## Operations

```bash
docker compose ps
docker compose logs --tail=100 api
bash scripts/backup.sh prod
```

Back up before schema upgrades. Schedule daily backups with cron/systemd timers and transfer encrypted copies off the server. Backup automation is not installed automatically. Keep a tested rollback and recovery procedure; application and migration files must match the backup schema.

For changes, run tests first, back up, then run `bash scripts/prod.sh` again. Never put production secrets into logs, frontend environment variables, or repository files.

## Restore a local backup

Stop the local app first. Preserve the current database directory rather than overwriting it.

```bash
mv backend/data "backend/data-before-restore-$(date +%s)"
mkdir -m 700 backend/data
cp backups/YOUR_BACKUP.sqlite3 backend/data/budget.db
chmod 600 backend/data/budget.db
bash scripts/dev.sh
```

This moves any existing WAL files along with the old database. Use a backup produced by the backup script, not a raw copy of an active SQLite database. Verify account counts, transaction counts, income sources, property links, and totals after restoration. The initial four-property seeding runs only when the properties table is empty.

## Restore PostgreSQL into a separate database

Validate a backup in a new database before changing live data:

```bash
docker compose exec -T db createdb -U budget budget_restore
docker compose exec -T db pg_restore -U budget -d budget_restore < backups/YOUR_BACKUP.dump
docker compose exec -T db psql -U budget -d budget_restore -c \
  'SELECT count(*) FROM transactions; SELECT count(*) FROM properties;'
```

Do not drop or overwrite the live database until the restore has been verified and maintenance downtime is approved. To switch the application to a restored database, update both `api` and `migrate` connection URLs in the Compose configuration, then redeploy with matching migrations.

## Security checklist

- Use a unique workspace password and session secret. Changing the password invalidates existing sessions; rotate the secret after suspected compromise.
- Only Caddy publishes ports. Never expose Vite, Uvicorn development mode, or PostgreSQL directly.
- Keep `.env`, databases, and backups restricted to the owner. Use disk encryption and encrypted off-site backups.
- Keep base images and Python/Node dependencies updated; rerun the test suite after upgrades.
- Basic in-process login throttling is included, but add perimeter controls/VPN access for sensitive deployments.
- CSV previews and raw normalized fields contain financial data. No data retention/deletion policy is automated yet.
- Test HTTPS, secure cookies, backup restore, PostgreSQL-specific locking, and concurrent imports on the VPS before live use.
