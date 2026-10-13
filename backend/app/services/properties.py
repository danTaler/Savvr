from decimal import Decimal, ROUND_DOWN

from fastapi import HTTPException
from sqlalchemy import delete, select

from ..models import Account, Loan, LoanProperty, Property


def save_loan(db, values, loan=None):
    account = db.get(Account, values.account_id)
    if not account:
        raise HTTPException(422, "Import the loan account before linking it.")
    if account.kind == "credit_card":
        raise HTTPException(422, "A credit card cannot be a property loan account.")
    offset = db.get(Account, values.offset_account_id) if values.offset_account_id else None
    if values.offset_account_id and (
        not offset or offset.currency != account.currency or offset.kind in {"loan", "credit_card"}
    ):
        raise HTTPException(422, "Choose a bank or offset account with the same currency.")
    for allocation in values.allocations:
        if not db.get(Property, allocation.property_id):
            raise HTTPException(422, "Property not found.")
    other = db.scalar(select(Loan).where(Loan.account_id == values.account_id))
    if other and (not loan or other.id != loan.id):
        raise HTTPException(409, "This account is already linked to a loan.")
    if loan is None:
        loan = Loan()
        db.add(loan)
    for key, value in values.model_dump(exclude={"allocations"}).items():
        setattr(loan, key, value)
    db.flush()
    db.execute(delete(LoanProperty).where(LoanProperty.loan_id == loan.id))
    for allocation in values.allocations:
        db.add(LoanProperty(loan_id=loan.id, **allocation.model_dump()))
    return loan


def property_totals(transactions, property_id):
    linked = [t for t in transactions if t.property_id == property_id and t.included]
    rental = sum((t.amount for t in linked if t.kind == "rental"), Decimal("0"))
    expenses = -sum((t.amount for t in linked if t.kind == "expense"), Decimal("0"))
    repayments = -sum((t.amount for t in linked if t.kind == "loan_repayment"), Decimal("0"))
    return {
        "rental": rental,
        "expenses": expenses,
        "repayments": repayments,
        "cash_flow": rental - expenses - repayments,
    }


def allocated_balances(db):
    """Allocate whole cents with largest remainders so shares sum to each loan."""
    result = {}
    for loan in db.scalars(select(Loan).where(Loan.balance.is_not(None))):
        links = list(db.scalars(select(LoanProperty).where(LoanProperty.loan_id == loan.id).order_by(LoanProperty.property_id)))
        exact = [loan.balance * link.share / 100 for link in links]
        amounts = [value.quantize(Decimal("0.01"), rounding=ROUND_DOWN) for value in exact]
        remainder = int((loan.balance - sum(amounts, Decimal("0"))) * 100)
        ranked = sorted(range(len(links)), key=lambda i: exact[i] - amounts[i], reverse=True)
        for index in ranked[:remainder]:
            amounts[index] += Decimal("0.01")
        for link, amount in zip(links, amounts):
            result[(loan.id, link.property_id)] = amount
    return result
