# Hearth Budget

A local-first personal budgeting web app for bank and credit card CSVs, four properties, loans, salary, and rental income. React + TypeScript frontend, FastAPI backend, SQLite for Docker-free development, PostgreSQL for the planned VPS deployment.

## Run locally

Requirements: Python 3.11+ with pip/venv, Node.js 20.19+ and npm, Bash.

```bash
bash scripts/dev.sh
```

Open **http://127.0.0.1:5173**. Default development password: **`budget-local-dev`**.

The script installs dependencies, applies Alembic migrations, and starts both servers on loopback. Ctrl+C stops both. The API runs at `http://127.0.0.1:8000`, with development docs at `/api/docs`. A restart retains all records in `backend/data/budget.db`. There is no Docker dependency for local development.

Optional settings go in a local `.env`, using `.env.example` as a guide. Set `APP_PASSWORD` to change the password. `API_PORT` and `WEB_PORT` override ports. Use a native PostgreSQL `DATABASE_URL` to test that database locally; the app does not automatically move SQLite data into PostgreSQL.

## First use

1. Go to **Imports** and upload a CSV, TSV, or TXT export.
2. Review row validation and confirm every account mapping. The supplied `fields.txt` is a valid headerless tab-separated example.
3. Confirm the import. New valid rows are saved; duplicates, conflicting changed rows, and invalid rows are skipped with counts.
4. Name your four properties under **Properties & loans**. Import loan accounts before linking them. Enter balance dates and rates manually.
5. Create salary, rental, interest, dividend, or other sources under **Income**.
6. Open transactions to assign income sources, properties, expense categories, and transfer classifications.
7. Set the reporting month and currency. The sample includes October 2025 and October 2026; Transactions has an **All dates** filter.
8. Set monthly category limits under **Budgets**.

The actual workspace starts empty except for four unnamed property slots. Browser and backend tests use isolated databases; no sample financial data is automatically imported.

## Import behavior

- Uses the 18-column order in `csv_columns.txt`; CSV headers are optional but must match that order when present.
- Accepts UTF-8 with or without BOM, comma or tab delimiters, quoted descriptions, and blank posted dates/types. Ignores empty columns after column 18, but rejects non-empty extras.
- Maximum 5 MB / 5,000 rows per file. Amounts have up to two decimal places, signed consistently with credit/debit. IDs are strings. All 18 normalized source fields are retained independently of app edits.
- Missing transaction IDs are rejected instead of guessing that identical purchases are duplicates.
- The unique transaction key is the confirmed account plus source transaction ID. Provider aliases and confirmed renamed-account mappings are remembered. IDs changing between exports cannot be deduplicated reliably; confirm ID stability with real overlapping exports.
- A changed row with an existing ID is held, never silently overwritten. Import history retains its proposed values and original preview status; its summary records the final result. Compare it with the saved transaction and resolve the source discrepancy. Updating imported amount/date from a conflicting export is not yet a UI feature.
- Every confirmation rechecks duplicates in a database transaction. SQLite write locking or PostgreSQL advisory locking serializes concurrent confirmations; database uniqueness provides another safeguard.
- New accounts are suggested from provider, normalized account number, account name, and currency. Masked identifiers can collide; confirmation is required. Existing account mappings cannot be silently reassigned. Account merging is not implemented.

## Financial rules

- Actual income must be explicitly classified and assigned to a source. Expected monthly income never contributes to actual totals.
- Credits, loan-account debits, and suspected transfers/repayments start in **Needs review**. Other debits initially count as expenses; classification is editable.
- Transfers, refunds, excluded transactions, and unreviewed transactions are not counted as income or expenses. Refund netting is not yet implemented, so expenses are gross rather than refund-adjusted.
- Recorded cash flow = confirmed income - expenses - confirmed property-loan repayments. It is a classified-transactions view, not a bank balance or a tax report.
- Property cash flow uses explicitly linked rental receipts, expenses, and repayments. Loan linking does not automatically classify transactions. Repayments are not split into principal/interest.
- Loans may have multiple property allocations totaling 100%. Recorded loan balances are allocated in exact cents without double-counting. Each transaction currently links to one property; split transactions and joint-owner accounting are future work.
- Loan balances, rates, and as-of dates are manual. CSV transactions alone do not establish current balances, gross rent, property values, or future due dates.
- Currencies are reported separately. No FX conversion is applied.

## Project structure

```text
frontend/src/
  components/       Shared dialogs and form editors
  pages/            Overview, imports, transactions, properties, income, budgets
  api.ts            Typed API client and display helpers
  types.ts          Shared frontend domain types
backend/app/
  banks/            Base adapter, CommBank, ING, Amex, two reserved bank adapters
  services/         Income validation and property/loan calculations
  imports.py        CSV validation, previews, mapping, idempotent confirmation
  models.py         Database entities
  schemas.py        API input validation
  auth.py           Personal workspace session authentication
  main.py           API routes and reporting
backend/migrations/ Versioned schema changes
backend/tests/      Isolated API and accounting tests
frontend/tests/     Isolated end-to-end browser tests
scripts/            Development, production, backup, and test startup
infra/              Dockerfiles and HTTPS reverse proxy configuration
```

The remaining two bank names are not known. `bank_three.py` and `bank_four.py` reserve their classes without inventing provider-specific behavior. Other providers still import through the shared adapter.

## Test

```bash
.venv/bin/pytest backend/tests -q
npm --prefix frontend run build
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:e2e
```

Browser tests launch temporary services on ports 5174/8001 and use a disposable SQLite database. They exercise uploads, duplicate prevention, income assignment, property editing, loan linking, budgets, persistence across page reloads, and mobile layout. Test screenshots are under `frontend/test-results/`.

## Backup

```bash
bash scripts/backup.sh local
# Once running on the VPS:
bash scripts/backup.sh prod
```

Local backups use SQLite's online backup API and verify database integrity. Production backups use `pg_dump` custom format. Files are private to the owner in `backups/`; schedule the command and copy encrypted backups off the VPS before live use. See [docs/deployment.md](docs/deployment.md) for restoration and deployment.

## Current scope and security

This is a **single-owner personal MVP**, not a public multi-tenant SaaS. It has password-protected HTTP-only sessions, same-origin write checks, basic login throttling, validation, masked account display, and no external bank connection. The default password is for loopback development only.

Multi-user workspace isolation, user registration/password recovery, subscriptions, detailed audit trails, classification rules, split transactions, scheduled income, and Gmail are not implemented. CSV originals and backups contain financial information; the database is not application-level encrypted. Use encrypted disks, restrict OS access, and protect backups. Do not expose development servers to the Internet.

VPS configuration is provided for testing after local acceptance. Docker/PostgreSQL deployment requires independent validation on the target VPS before importing production records. No commits or remote deployments are performed by the app setup.
