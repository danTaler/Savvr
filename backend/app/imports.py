import csv
import hashlib
import io
import json
import re
from datetime import date
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .banks import get_bank, provider_key
from .models import Account, AccountAlias, ImportBatch, Transaction

COLUMNS = [
    "transaction_id", "description", "user_description", "amount", "currency",
    "transaction_date", "posted_date", "account_number", "account_name",
    "credit_debit", "transaction_type", "provider_name", "merchant_name",
    "budget_category", "category_name", "user_tags", "notes", "included",
]
MAX_ROWS = 5000
MAX_BYTES = 5 * 1024 * 1024


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def account_details(row: dict) -> dict:
    bank = get_bank(row["provider_name"])
    identity = digest([
        bank.normalize_account(row["account_number"]),
        row["account_name"].casefold(),
        row["currency"],
    ])
    return {
        "key": digest([provider_key(row["provider_name"]), identity]),
        "identity": identity,
        "provider": provider_key(row["provider_name"]),
        "number": row["account_number"],
        "name": row["account_name"],
        "currency": row["currency"],
        "kind": bank.account_kind(row["account_name"]),
    }


def validate(values: list[str]) -> dict:
    if len(values) > 18 and any(v.strip() for v in values[18:]):
        raise ValueError("Unexpected non-empty columns after column 18.")
    if len(values) < 18:
        raise ValueError(f"Expected 18 columns; found {len(values)}.")
    row = dict(zip(COLUMNS, (v.strip() for v in values[:18])))
    for key in ("transaction_id", "description", "account_number", "account_name", "provider_name"):
        if not row[key]:
            raise ValueError(f"{key} is required. Rows without stable IDs need manual resolution.")
    limits = {
        "transaction_id": 160, "description": 2000, "user_description": 2000,
        "account_number": 120, "account_name": 160, "provider_name": 120,
        "category_name": 160, "budget_category": 160, "notes": 2000,
    }
    for key, limit in limits.items():
        if len(row[key]) > limit:
            raise ValueError(f"{key} exceeds {limit} characters.")
    amount_text = row["amount"]
    if not re.fullmatch(r"[+-]?\d{1,16}(\.\d{1,2})?", amount_text):
        raise ValueError("amount must be a decimal with at most 2 decimal places.")
    try:
        amount = Decimal(amount_text)
    except InvalidOperation:
        raise ValueError("Invalid amount.") from None
    row["amount"] = str(amount.quantize(Decimal("0.01")))
    row["currency"] = row["currency"].upper()
    if not re.fullmatch(r"[A-Z]{3}", row["currency"]):
        raise ValueError("currency must be a three-letter code.")
    for field in ("transaction_date", "posted_date"):
        if field == "posted_date" and not row[field]:
            continue
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", row[field]):
            raise ValueError(f"{field} must use YYYY-MM-DD.")
        try:
            date.fromisoformat(row[field])
        except ValueError:
            raise ValueError(f"Invalid {field}.") from None
    direction = row["credit_debit"].lower()
    if direction not in ("credit", "debit"):
        raise ValueError("credit_debit must be credit or debit.")
    if (direction == "debit" and amount > 0) or (direction == "credit" and amount < 0):
        raise ValueError("amount sign conflicts with credit_debit.")
    row["credit_debit"] = direction
    if row["included"].lower() not in ("true", "false"):
        raise ValueError("included must be TRUE or FALSE.")
    row["included"] = row["included"].lower() == "true"
    return row


def fingerprint(row: dict) -> str:
    # Account labels may change when a user explicitly maps an export to an account.
    return digest({k: v for k, v in row.items() if k not in (
        "account_number", "account_name", "provider_name", "location",
    )})


def validate_amex(values: list[str]) -> dict:
    if len(values) != 6:
        raise ValueError(f"Expected 6 columns for Amex format; found {len(values)}.")
    raw_date, raw_posted, desc, card_member, acct_num, raw_amount = [v.strip() for v in values]
    
    def parse_date(d: str) -> str:
        if not d: return ""
        parts = d.split("/")
        if len(parts) == 3:
            return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
        return d

    t_date = parse_date(raw_date)
    p_date = parse_date(raw_posted)
    
    location = get_bank("American Express").extract_location(desc)

    try:
        amount = Decimal(raw_amount)
    except InvalidOperation:
        raise ValueError("Invalid amount.") from None
        
    # Amex positive is an expense, so we invert it for standard representation.
    amount = -amount
    direction = "debit" if amount <= 0 else "credit"
    
    tx_id_raw = f"{t_date}{desc}{amount}{acct_num}"
    tx_id = hashlib.sha256(tx_id_raw.encode()).hexdigest()[:32]
    
    standard_values = [
        tx_id,
        desc,
        "",
        str(amount.quantize(Decimal("0.01"))),
        "AUD",
        t_date,
        p_date,
        acct_num,
        f"American Express - {card_member}",
        direction,
        "",
        "American Express",
        "",
        "",
        "Uncategorised",
        "",
        "",
        "TRUE",
    ]
    row = validate(standard_values)
    row["location"] = location
    return row


def parse_file(content: bytes) -> list[dict]:
    if not content or len(content) > MAX_BYTES:
        raise ValueError("Upload a non-empty file no larger than 5 MB.")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ValueError("Please export the file using UTF-8 encoding.") from None
    first_line = next((line for line in text.splitlines() if line.strip()), "")
    delimiter = "\t" if "\t" in first_line else ","
    reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter, strict=True)
    rows = []
    first = True
    format_type = "standard"
    try:
        for values in reader:
            if not any(v.strip() for v in values):
                continue
            if first:
                first = False
                header = [v.strip().lower() for v in values]
                if header[:6] == ["date", "date processed", "description", "card member", "account #", "amount"]:
                    format_type = "amex"
                    continue
                
                header = [v.strip().lower() for v in values[:18]]
                if "transaction_id" in header or "account_number" in header:
                    if header != COLUMNS or any(v.strip() for v in values[18:]):
                        raise ValueError("Headers must match the documented 18-column order.")
                    continue
            if len(rows) >= MAX_ROWS:
                raise ValueError("Maximum 5,000 transactions per upload.")
            try:
                data = validate_amex(values) if format_type == "amex" else validate(values)
                rows.append({"line": reader.line_num, "data": data, "error": None})
            except ValueError as error:
                rows.append({"line": reader.line_num, "data": None, "error": str(error)})
    except csv.Error as error:
        raise ValueError(f"Malformed CSV near line {reader.line_num}: {error}") from None
    if not rows:
        raise ValueError("No transactions found.")
    return rows


def find_account(db: Session, details: dict) -> Account | None:
    alias = db.scalar(select(AccountAlias).where(
        AccountAlias.provider == details["provider"], AccountAlias.identity == details["identity"],
    ))
    if alias:
        return db.get(Account, alias.account_id)
    return db.scalar(select(Account).where(
        Account.provider == details["provider"], Account.identity == details["identity"],
    ))


def preview(db: Session, content: bytes, filename: str) -> dict:
    parsed = parse_file(content)
    accounts = {}
    seen = {}
    counts = dict(new=0, duplicate=0, changed=0, invalid=0)
    for item in parsed:
        row = item["data"]
        if row is None:
            item["status"] = "invalid"
        else:
            details = account_details(row)
            existing_account = find_account(db, details)
            accounts[details["key"]] = {**details, "account_id": existing_account.id if existing_account else None}
            item["account_key"] = details["key"]
            key = (existing_account.id if existing_account else details["key"], row["transaction_id"])
            fp = fingerprint(row)
            existing = db.scalar(select(Transaction).where(
                Transaction.account_id == existing_account.id,
                Transaction.external_id == row["transaction_id"],
            )) if existing_account else None
            prior = existing.fingerprint if existing else seen.get(key)
            item["status"] = "new" if prior is None else ("duplicate" if prior == fp else "changed")
            seen.setdefault(key, fp)
        counts[item["status"]] += 1
    batch = ImportBatch(
        filename=filename[:255], digest=hashlib.sha256(content).hexdigest(),
        rows=parsed, summary=counts,
    )
    db.add(batch)
    db.commit()
    return {"id": batch.id, "rows": parsed, "accounts": list(accounts.values()), "summary": counts}


def commit_import(db: Session, batch_id: int, mapping: dict[str, int | None]) -> dict:
    # Serializes confirmations per database, including concurrent overlapping uploads.
    if db.bind.dialect.name == "sqlite":
        from sqlalchemy import text
        db.execute(text("BEGIN IMMEDIATE"))
    else:
        from sqlalchemy import text
        db.execute(text("SELECT pg_advisory_xact_lock(731924)"))
    batch = db.get(ImportBatch, batch_id)
    if not batch:
        raise ValueError("Import not found.")
    if batch.status == "committed":
        return batch.summary
    accounts = {}
    counts = dict(imported=0, duplicate=0, changed=0, invalid=0)
    for item in batch.rows:
        row = item["data"]
        if row is None:
            counts["invalid"] += 1
            continue
        details = account_details(row)
        key = details["key"]
        if key not in mapping:
            raise ValueError("Confirm the mapping for every account.")
        if key not in accounts:
            known_account = find_account(db, details)
            if mapping[key] is not None:
                account = db.get(Account, mapping[key])
                if not account or account.provider != details["provider"] or account.currency != details["currency"]:
                    raise ValueError("Mapped accounts must have the same provider and currency.")
                if known_account and known_account.id != account.id:
                    raise ValueError("This export is already mapped to another account. Account merging requires manual reconciliation.")
            else:
                account = known_account
                if account is None:
                    account = Account(**{k: v for k, v in details.items() if k != "key"})
                    db.add(account)
                    db.flush()
            if known_account is None and account.identity != details["identity"]:
                db.add(AccountAlias(provider=details["provider"], identity=details["identity"], account_id=account.id))
                db.flush()
            accounts[key] = account
        account = accounts[key]
        existing = db.scalar(select(Transaction).where(
            Transaction.account_id == account.id,
            Transaction.external_id == row["transaction_id"],
        ))
        fp = fingerprint(row)
        if existing:
            counts["duplicate" if existing.fingerprint == fp else "changed"] += 1
            continue
        bank = get_bank(row["provider_name"])
        hint = bank.property_transaction_hint(row["description"], row["category_name"])
        hint = hint or bank.income_hint(row["description"])
        amount = Decimal(row["amount"])
        kind = "review" if amount >= 0 or hint or account.kind == "loan" else "expense"
        db.add(Transaction(
            account_id=account.id, external_id=row["transaction_id"], import_id=batch.id,
            description=row["user_description"] or row["description"],
            amount=amount, currency=row["currency"],
            transaction_date=date.fromisoformat(row["transaction_date"]),
            posted_date=date.fromisoformat(row["posted_date"]) if row["posted_date"] else None,
            category=row["category_name"] or "Uncategorised",
            budget_category=row["budget_category"], kind=kind, suggestion=hint,
            included=row["included"], notes=row["notes"], location=row.get("location", ""), fingerprint=fp, raw=row,
        ))
        db.flush()
        counts["imported"] += 1
    batch.status = "committed"
    batch.summary = counts
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ValueError("An overlapping import was saved. Preview this file again.") from None
    return counts
