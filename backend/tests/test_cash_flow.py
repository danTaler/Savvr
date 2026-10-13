from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.services.cash_flow import spending_breakdown


def transaction(amount, kind, category, included=True):
    return SimpleNamespace(amount=Decimal(amount), kind=kind, category=category, included=included)


def test_categories_and_repayments_reconcile():
    report = spending_breakdown([
        transaction("4000", "salary", "Salary"),
        transaction("2000", "rental", "Rent"),
        transaction("-100", "expense", "Groceries"),
        transaction("-50.25", "expense", "Groceries"),
        transaction("-500", "loan_repayment", "Transfer Between Accounts"),
        transaction("1000", "transfer", "Transfer"),
        transaction("25", "refund", "Refund"),
        transaction("-100", "review", "Uncategorised"),
        transaction("-200", "expense", "Excluded", False),
    ])
    assert report["income_categories"] == [
        {"name": "Salary", "amount": Decimal("4000")},
        {"name": "Rent", "amount": Decimal("2000")},
    ]
    assert report["expense_categories"] == [
        {"name": "Property loan repayments", "amount": Decimal("500")},
        {"name": "Groceries", "amount": Decimal("150.25")},
    ]
    assert report["earning"] == Decimal("6000")
    assert report["spending"] == Decimal("650.25")
    assert report["difference"] == Decimal("5349.75")
    assert report["savings_rate"] == Decimal("89.2")


@pytest.mark.parametrize(("rows", "difference", "rate"), [
    ([], "0", None),
    ([transaction("-100", "expense", "Food")], "-100", None),
    ([transaction("100", "salary", "Salary")], "100", Decimal("100.0")),
    ([transaction("100", "salary", "Salary"), transaction("-150", "expense", "Food")], "-50", Decimal("-50.0")),
])
def test_empty_income_only_and_shortfall(rows, difference, rate):
    report = spending_breakdown(rows)
    assert report["difference"] == Decimal(difference)
    assert report["savings_rate"] == rate


def test_imported_income_categories_show_without_counting_other_credits():
    report = spending_breakdown([
        transaction("4000", "review", "Salary/Regular Income"),
        transaction("20", "review", "Interest Income"),
        transaction("1000", "review", "Rental Income"),
        transaction("1500", "review", "Transfer In"),
        transaction("1500", "review", "Transfer Between Accounts"),
        transaction("50000", "review", "Mortgage"),
        transaction("100", "review", "Refunds/Adjustments"),
        transaction("100", "review", "Deposits"),
        transaction("100", "review", "Uncategorised"),
        transaction("200", "transfer", "Salary"),
        transaction("100", "refund", "Other Income"),
        transaction("300", "review", "Salary", False),
        transaction("-50", "review", "Salary"),
    ])
    assert report["earning"] == Decimal("5020")
    assert report["provisional_income_count"] == 3
    assert [c["name"] for c in report["income_categories"]] == [
        "Salary/Regular Income", "Rental Income", "Interest Income",
    ]
