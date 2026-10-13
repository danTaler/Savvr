from decimal import Decimal

from .incomes import INCOME_KINDS


def is_imported_income(transaction):
    """Use explicit income categories for the chart, never generic credits."""
    category = transaction.category.strip().casefold()
    return (
        transaction.kind == "review"
        and transaction.amount > 0
        and category in {
            "salary", "salary/regular income", "salary / regular income",
            "wages", "rental income", "rent received", "interest income",
            "dividend", "dividends", "dividend income", "other income", "rewards",
        }
    )


def spending_breakdown(transactions):
    income_categories = {}
    expense_categories = {}
    provisional_count = 0
    for transaction in transactions:
        if not transaction.included:
            continue
        provisional = is_imported_income(transaction)
        if transaction.kind in INCOME_KINDS or provisional:
            provisional_count += int(provisional)
            income_categories[transaction.category] = income_categories.get(
                transaction.category, Decimal("0"),
            ) + transaction.amount
        elif transaction.kind in {"expense", "loan_repayment"}:
            # Keep repayments distinct even when the source category says transfer.
            category = "Property loan repayments" if transaction.kind == "loan_repayment" else transaction.category
            expense_categories[category] = expense_categories.get(category, Decimal("0")) - transaction.amount

    earning = sum(income_categories.values(), Decimal("0"))
    spending = sum(expense_categories.values(), Decimal("0"))
    difference = earning - spending

    def categories(values):
        return [
            {"name": name, "amount": amount}
            for name, amount in sorted(values.items(), key=lambda item: (-item[1], item[0]))
            if amount > 0
        ]

    return {
        "income_categories": categories(income_categories),
        "expense_categories": categories(expense_categories),
        "earning": earning, "spending": spending, "difference": difference,
        "savings_rate": (difference / earning * 100).quantize(Decimal("0.1")) if earning else None,
        "provisional_income_count": provisional_count,
    }
