import csv
import io
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from app.banks.american_express import AmericanExpress
from app.imports import COLUMNS, fingerprint, parse_file


def csv_file(*rows, delimiter=",", headers=True):
    stream = io.StringIO(newline="")
    writer = csv.writer(stream, delimiter=delimiter)
    if headers:
        writer.writerow(COLUMNS)
    writer.writerows(rows)
    return stream.getvalue().encode()


def row(identifier="1", **overrides):
    data = dict(zip(COLUMNS, [
        identifier, "Grocery shop, weekly", "", "-50.25", "AUD", "2026-10-11", "",
        "xxxx1234", "Everyday", "debit", "", "CommBank", "Shop", "lifestyle",
        "Groceries", "", "", "TRUE",
    ]))
    data.update(overrides)
    return [data[column] for column in COLUMNS]


def preview(client, content):
    response = client.post("/api/imports/preview", files={"file": ("test.csv", content, "text/csv")})
    assert response.status_code == 200, response.text
    return response.json()


def confirm(client, batch, mapping=None):
    response = client.post(f"/api/imports/{batch['id']}/confirm", json={
        "mapping": mapping if mapping is not None else {a["key"]: a["account_id"] for a in batch["accounts"]},
    })
    assert response.status_code == 200, response.text
    return response.json()


def upload(client, *rows):
    return confirm(client, preview(client, csv_file(*rows)))


def test_csv_income_appears_in_breakdown_without_changing_classification(client):
    upload(client,
           row("salary", amount="4000", credit_debit="credit", category_name="Salary/Regular Income", budget_category="income"),
           row("transfer", amount="1000", credit_debit="credit", category_name="Transfer In", budget_category="income"))
    report = dashboard(client)
    assert report["income"] == "0"
    assert report["spending_breakdown"]["earning"] == "4000.00"
    assert report["spending_breakdown"]["provisional_income_count"] == 1
    assert all(t["kind"] == "review" for t in transactions(client))


def transactions(client):
    return client.get("/api/transactions").json()["items"]


def update(client, transaction, **overrides):
    body = {key: transaction[key] for key in ("kind", "category", "property_id", "income_source_id", "included", "notes")}
    body.update(overrides)
    return client.put(f"/api/transactions/{transaction['id']}", json=body)


def dashboard(client, currency="AUD"):
    response = client.get(f"/api/dashboard?month=2026-10&currency={currency}")
    assert response.status_code == 200, response.text
    return response.json()


def test_supplied_tab_sample(client):
    sample = Path(__file__).resolve().parents[2] / "fields.txt"
    batch = preview(client, sample.read_bytes())
    assert batch["summary"] == {"new": 5, "duplicate": 0, "changed": 0, "invalid": 0}
    assert len(batch["accounts"]) == 3
    assert confirm(client, batch)["imported"] == 5
    summary = dashboard(client)
    assert summary["spending"] == "52.50"
    assert summary["review_count"] == 1
    assert len(summary["properties"]) == 4
    assert len(client.get("/api/accounts").json()) == 3


def test_duplicate_files_overlaps_and_changed_rows(client):
    original = row()
    assert upload(client, original, original)["imported"] == 1
    batch = preview(client, csv_file(original, row("2"), row("1", amount="-55")))
    assert batch["summary"] == {"new": 1, "duplicate": 1, "changed": 1, "invalid": 0}
    result = confirm(client, batch)
    assert result == {"imported": 1, "duplicate": 1, "changed": 1, "invalid": 0}
    assert confirm(client, batch) == result
    assert len(transactions(client)) == 2


def test_amex_format_upload(client):
    content = """Date,Date Processed,Description,Card Member,Account #,Amount
06/10/2026,07/10/2026,ALBION PLACE HOTEL 1954 SYDNEY,IDAN TALER,-51002,4.50
06/10/2026,06/10/2026,BUDGET DIRECT TOOWONG   TOOWONG,IDAN TALER,-51002,-89.95
06/10/2026,07/10/2026,TIANTIAN PTY LTD        Moorooka,DANA HOLTZMAN,-51010,21.10"""
    response = client.post("/api/imports/preview", files={"file": ("amex.csv", content.encode("utf-8"), "text/csv")})
    assert response.status_code == 200
    data = response.json()
    assert data["summary"]["new"] == 3
    assert data["summary"]["invalid"] == 0
    # Check the accounts
    assert len(data["accounts"]) == 2
    providers = {acc["name"] for acc in data["accounts"]}
    assert providers == {"American Express - IDAN TALER", "American Express - DANA HOLTZMAN"}

    # Check that expenses and credits are correctly mapped
    rows = data["rows"]
    hotel_row = next(r for r in rows if "ALBION" in r["data"]["description"])
    assert hotel_row["data"]["amount"] == "-4.50"
    assert hotel_row["data"]["credit_debit"] == "debit"
    assert hotel_row["data"]["location"] == "SYDNEY"

    refund_row = next(r for r in rows if "BUDGET DIRECT" in r["data"]["description"])
    assert refund_row["data"]["amount"] == "89.95"
    assert refund_row["data"]["credit_debit"] == "credit"
    assert refund_row["data"]["location"] == "TOOWONG"
    assert confirm(client, data)["imported"] == 3
    saved = transactions(client)
    assert next(t for t in saved if "ALBION" in t["description"])["location"] == "SYDNEY"
    assert confirm(client, preview(client, content.encode()))["duplicate"] == 3


@pytest.mark.parametrize(("description", "expected"), [
    ("ALBION PLACE HOTEL 1954 SYDNEY", "SYDNEY"),
    ("TIANTIAN PTY LTD        Moorooka", "Moorooka"),
    ("COLES ROCHEDALE 4386    ROCHEDALE", "ROCHEDALE"),
    ("POCKETSMITH POCKETSMITH DUNEDIN", "DUNEDIN"),
    ("EXAMPLE MERCHANT       SURFERS PARADISE", "SURFERS PARADISE"),
    ("MERCHANT 12345", ""),
    ("", ""),
])
def test_amex_location_extraction(description, expected):
    assert AmericanExpress().extract_location(description) == expected


def test_location_does_not_change_import_fingerprint():
    original = dict(zip(COLUMNS, row()))
    assert fingerprint(original) == fingerprint({**original, "location": "SYDNEY"})


def test_location_backfill_preserves_edits_and_duplicate_detection(client):
    from importlib import import_module

    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import select

    from app import main
    from app.imports import digest
    from app.models import Transaction

    content = b"""Date,Date Processed,Description,Card Member,Account #,Amount
06/10/2026,07/10/2026,ALBION PLACE HOTEL 1954 SYDNEY,IDAN TALER,-51002,4.50
"""
    confirm(client, preview(client, content))
    with main.SessionLocal() as db:
        transaction = db.scalar(select(Transaction))
        transaction.location = ""
        transaction.notes = "Keep this manual note"
        transaction.category = "Dining"
        transaction.fingerprint = digest({
            k: v for k, v in transaction.raw.items()
            if k not in {"account_number", "account_name", "provider_name"}
        })
        db.commit()
    migration = import_module("migrations.versions.b217ac8d903e_backfill_amex_locations")
    with main.SessionLocal().bind.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
    saved = transactions(client)[0]
    assert saved["location"] == "SYDNEY"
    assert saved["notes"] == "Keep this manual note"
    assert saved["category"] == "Dining"
    assert confirm(client, preview(client, content))["duplicate"] == 1


def test_user_edits_survive_reimport(client):
    upload(client, row())
    transaction = transactions(client)[0]
    assert update(client, transaction, category="Food", notes="My note").status_code == 200
    assert upload(client, row())["duplicate"] == 1
    transaction = transactions(client)[0]
    assert transaction["notes"] == "My note"
    raw = client.get(f"/api/transactions/{transaction['id']}").json()["raw"]
    assert raw["category_name"] == "Groceries"


def test_same_id_in_different_accounts_is_not_duplicate(client):
    result = upload(client, row(), row(account_number="xxxx9999"), row(provider_name="ING"))
    assert result["imported"] == 3


def test_explicit_mapping_handles_renamed_accounts(client):
    upload(client, row())
    account = client.get("/api/accounts").json()[0]
    batch = preview(client, csv_file(row(account_name="Renamed everyday")))
    assert confirm(client, batch, {batch["accounts"][0]["key"]: account["id"]})["duplicate"] == 1
    assert len(client.get("/api/accounts").json()) == 1
    repeated = preview(client, csv_file(row(account_name="Renamed everyday")))
    assert repeated["accounts"][0]["account_id"] == account["id"]
    assert repeated["summary"]["duplicate"] == 1
    assert confirm(client, repeated)["duplicate"] == 1


def test_bad_mapping_rolls_back_entire_batch(client):
    batch = preview(client, csv_file(row(), row("2", provider_name="ING")))
    response = client.post(f"/api/imports/{batch['id']}/confirm", json={"mapping": {
        batch["accounts"][0]["key"]: None, batch["accounts"][1]["key"]: 99999,
    }})
    assert response.status_code == 422
    assert client.get("/api/accounts").json() == []
    assert transactions(client) == []


@pytest.mark.parametrize("override", [
    {"amount": "50"}, {"amount": "-0.001"}, {"amount": "NaN"}, {"currency": ""},
    {"transaction_id": ""}, {"transaction_date": "11/10/2026"}, {"posted_date": "2026-02-30"},
    {"included": "yes"}, {"credit_debit": "unknown"},
])
def test_invalid_rows_are_reported(client, override):
    batch = preview(client, csv_file(row(**override), row("valid")))
    assert batch["summary"]["invalid"] == 1
    result = confirm(client, batch)
    assert result["invalid"] == 1 and result["imported"] == 1


def test_headers_extra_columns_and_encoding():
    assert len(parse_file(csv_file(row() + [""] * 8, delimiter="\t", headers=False))) == 1
    assert parse_file(csv_file(row() + ["extra"]))[0]["error"]
    with pytest.raises(ValueError, match="Headers"):
        parse_file((",".join(reversed(COLUMNS)) + "\n").encode())
    with pytest.raises(ValueError, match="UTF-8"):
        parse_file(b"\xff\xff")
    with pytest.raises(ValueError, match="No transactions"):
        parse_file(csv_file())


def test_exact_cents_at_large_values(client):
    upload(client, row(amount="-9999999999999999.99"))
    assert transactions(client)[0]["amount"] == "-9999999999999999.99"
    assert dashboard(client)["spending"] == "9999999999999999.99"


def test_income_property_and_currency_validation(client):
    upload(client,
           row("salary", amount="5000", credit_debit="credit", description="PAYROLL"),
           row("rent", amount="2000", credit_debit="credit", description="Rent received"),
           row("foreign", amount="100", credit_debit="credit", currency="USD"))
    salary = client.post("/api/incomes", json={"name": "Employer", "kind": "salary", "expected_monthly": "6000"}).json()
    rental = client.post("/api/incomes", json={"name": "Property rent", "kind": "rental", "property_id": 1}).json()
    txs = {t["external_id"]: t for t in transactions(client)}
    assert dashboard(client)["income"] == "0"
    assert update(client, txs["salary"], kind="salary", income_source_id=salary["id"]).status_code == 200
    assert update(client, txs["rent"], kind="rental", income_source_id=rental["id"], property_id=2).status_code == 422
    assert update(client, txs["rent"], kind="rental", income_source_id=rental["id"], property_id=1).status_code == 200
    assert update(client, txs["foreign"], kind="salary", income_source_id=salary["id"]).status_code == 422
    summary = dashboard(client)
    assert summary["income"] == "7000.00"
    assert summary["spending_breakdown"]["earning"] == "7000.00"
    assert summary["spending_breakdown"]["savings_rate"] == "100.0"
    assert client.get("/api/dashboard?month=2026-09&currency=AUD").json()["spending_breakdown"]["earning"] == "0"
    assert summary["properties"][0]["rental"] == "2000.00"
    assert summary["sources"][0]["expected_monthly"] == "6000.00"
    assert dashboard(client, "USD")["income"] == "0"
    assert dashboard(client, "USD")["spending_breakdown"]["income_categories"] == []
    assert client.put(f"/api/incomes/{salary['id']}", json={"name": "Employer", "kind": "interest"}).status_code == 409


def test_transfer_refund_and_excluded_not_income_or_spending(client):
    upload(client, row("transfer", description="Transfer", amount="-100"), row("excluded", included="FALSE"),
           row("refund", amount="20", credit_debit="credit"))
    txs = {t["external_id"]: t for t in transactions(client)}
    assert update(client, txs["transfer"], kind="transfer").status_code == 200
    assert update(client, txs["refund"], kind="refund").status_code == 200
    assert dashboard(client)["income"] == "0"
    assert dashboard(client)["spending"] == "0"


def test_property_loans_allocations_and_balance_dates(client):
    upload(client, row(account_name="Residential mortgage", provider_name="ING"))
    account = client.get("/api/accounts").json()[0]
    payload = {"name": "Shared loan", "account_id": account["id"], "balance": "600000.50",
               "balance_as_of": "2026-10-12", "interest_rate": "5.89",
               "allocations": [{"property_id": 1, "share": "60"}, {"property_id": 2, "share": "40"}]}
    response = client.post("/api/loans", json=payload)
    assert response.status_code == 200, response.text
    properties = dashboard(client)["properties"]
    assert properties[0]["allocated_balance"] == "360000.30"
    assert properties[1]["allocated_balance"] == "240000.20"
    assert client.post("/api/loans", json=payload).status_code == 409
    assert client.post("/api/loans", json={**payload, "balance_as_of": None}).status_code == 422
    assert client.post("/api/loans", json={**payload, "allocations": [{"property_id": 1, "share": "30"}]}).status_code == 422
    assert client.put("/api/properties/1", json={"name": "North house", "address": "Private address"}).status_code == 200
    assert dashboard(client)["properties"][0]["name"] == "North house"


def test_budget_upsert_and_expense_totals(client):
    upload(client, row())
    payload = {"category": "Groceries", "month": "2026-10", "amount": "200", "currency": "AUD"}
    budget = client.post("/api/budgets", json=payload).json()
    client.post("/api/budgets", json={**payload, "amount": "300"})
    budgets = dashboard(client)["budgets"]
    assert len(budgets) == 1
    assert budgets[0]["spent"] == "50.25"
    assert budgets[0]["amount"] == "300.00"
    assert client.delete(f"/api/budgets/{budget['id']}").status_code == 204
    assert dashboard(client)["budgets"] == []


def test_concurrent_confirmations_are_idempotent(client):
    batch = preview(client, csv_file(row()))
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: confirm(client, batch), range(2)))
    assert results[0] == results[1]
    assert len(transactions(client)) == 1


def test_auth_and_origin_protection(client):
    assert client.post("/api/incomes", json={}, headers={"origin": "https://untrusted.example"}).status_code == 403
    client.post("/api/auth/logout")
    assert client.get("/api/accounts").status_code == 401
    for _ in range(5):
        assert client.post("/api/auth/login", json={"password": "wrong"}).status_code == 401
    assert client.post("/api/auth/login", json={"password": "wrong"}).status_code == 429


def test_filters_and_upload_limits(client):
    upload(client, row("oct"), row("sep", transaction_date="2026-09-01"))
    assert client.get("/api/transactions?month=2026-10").json()["total"] == 1
    assert client.get("/api/transactions?search=weekly").json()["total"] == 2
    assert client.get("/api/transactions?search=%25").json()["total"] == 0
    assert client.post("/api/imports/preview", files={"file": ("huge.csv", b"x" * (5 * 1024 * 1024 + 1))}).status_code == 422
    assert client.get("/api/dashboard?month=invalid").status_code == 422


def test_allocation_rounding_preserves_total(client):
    upload(client, row(account_name="Mortgage"))
    account = client.get("/api/accounts").json()[0]
    response = client.post("/api/loans", json={
        "name": "Small balance", "account_id": account["id"],
        "balance": "0.01", "balance_as_of": "2026-10-12",
        "allocations": [{"property_id": 1, "share": 50}, {"property_id": 2, "share": 50}],
    })
    assert response.status_code == 200
    properties = dashboard(client)["properties"]
    assert properties[0]["allocated_balance"] == "0.01"
    assert properties[1]["allocated_balance"] == "0.00"
