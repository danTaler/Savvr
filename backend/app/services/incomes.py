from decimal import Decimal

from fastapi import HTTPException

from ..models import IncomeSource, Property, Transaction
from ..schemas import TransactionInput

INCOME_KINDS = {"salary", "rental", "interest", "dividend", "other_income"}


def assign_transaction(db, transaction: Transaction, values: TransactionInput):
    if values.kind in INCOME_KINDS and transaction.amount <= 0:
        raise HTTPException(422, "Income must be a positive received amount.")
    if values.kind in {"expense", "loan_repayment"} and transaction.amount >= 0:
        raise HTTPException(422, "Expenses and repayments must be negative amounts.")
    if values.kind == "refund" and transaction.amount <= 0:
        raise HTTPException(422, "Refunds must be positive amounts.")
    if values.property_id and not db.get(Property, values.property_id):
        raise HTTPException(422, "Property not found.")
    source = db.get(IncomeSource, values.income_source_id) if values.income_source_id else None
    if values.kind in INCOME_KINDS:
        if not source or source.kind != values.kind:
            raise HTTPException(422, "Choose an income source matching the income type.")
        if source.currency != transaction.currency:
            raise HTTPException(422, "Income source and transaction currencies must match.")
        if source.property_id != values.property_id:
            raise HTTPException(422, "Use the property assigned to this income source.")
    elif values.income_source_id is not None:
        raise HTTPException(422, "Only income transactions can have an income source.")
    if values.kind == "rental" and not values.property_id:
        raise HTTPException(422, "Rental income requires a property.")
    if values.kind == "loan_repayment" and not values.property_id:
        raise HTTPException(422, "Property loan repayments require a property.")
    for key, value in values.model_dump().items():
        setattr(transaction, key, value)


def income_totals(transactions) -> dict:
    totals = {kind: Decimal("0") for kind in INCOME_KINDS}
    for transaction in transactions:
        if transaction.included and transaction.kind in totals:
            totals[transaction.kind] += transaction.amount
    return totals
