import calendar
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import COOKIE, PRODUCTION, authenticate, check_password, serializer
from .database import SessionLocal, get_db
from .imports import MAX_BYTES, commit_import, preview
from .models import Account, Budget, ImportBatch, IncomeSource, Loan, LoanProperty, Property, Transaction
from .schemas import BudgetInput, ImportConfirmation, IncomeInput, LoanInput, Login, PropertyInput, TransactionInput
from .services.cash_flow import spending_breakdown
from .services.incomes import INCOME_KINDS, assign_transaction, income_totals
from .services.properties import allocated_balances, property_totals, save_loan


def encode(value):
    return jsonable_encoder(value, custom_encoder={Decimal: str})


def record(model, exclude=()):
    return encode({c.key: getattr(model, c.key) for c in inspect(model).mapper.column_attrs if c.key not in exclude})


def require(db, model, identifier):
    item = db.get(model, identifier)
    if not item:
        raise HTTPException(404, "Record not found.")
    return item


def save(db):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A conflicting record already exists.") from None


def month_dates(month):
    try:
        start = date.fromisoformat(f"{month}-01")
    except ValueError:
        raise HTTPException(422, "Invalid month.") from None
    end = date(start.year, start.month, calendar.monthrange(start.year, start.month)[1])
    return start, end


@asynccontextmanager
async def lifespan(_):
    with SessionLocal() as db:
        if db.scalar(select(func.count()).select_from(Property)) == 0:
            db.add_all(Property(name=f"Property {i}") for i in range(1, 5))
            db.commit()
    yield


app = FastAPI(title="Hearth Budget API", lifespan=lifespan, docs_url=None if PRODUCTION else "/api/docs")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if origin and urlparse(origin).netloc != request.headers.get("host"):
            return Response("Cross-origin requests are not allowed.", status_code=403)
        try:
            if int(request.headers.get("content-length", "0")) > MAX_BYTES + 65536:
                return Response("Upload is too large.", status_code=413)
        except ValueError:
            return Response("Invalid content length.", status_code=400)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    db.execute(select(1))
    return {"status": "ok"}


@app.post("/api/auth/login")
def login(values: Login, request: Request, response: Response):
    check_password(request, values.password)
    response.set_cookie(
        COOKIE, serializer.dumps("owner"), httponly=True, secure=PRODUCTION,
        samesite="strict", max_age=43200, path="/",
    )
    return {"authenticated": True}


@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE, path="/")
    return {"authenticated": False}


api = APIRouter(prefix="/api", dependencies=[Depends(authenticate)])


@api.get("/session")
def session():
    return {"name": "Personal workspace", "mode": "production" if PRODUCTION else "development"}


@api.get("/accounts")
def accounts(db: Session = Depends(get_db)):
    result = []
    for account in db.scalars(select(Account).order_by(Account.provider, Account.name)):
        data = record(account, ("identity",))
        data["number"] = "**** " + account.number[-4:]
        data["transaction_count"] = db.scalar(select(func.count()).select_from(Transaction).where(Transaction.account_id == account.id))
        result.append(data)
    return result


@api.post("/imports/preview")
async def import_preview(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        content = await file.read(MAX_BYTES + 1)
        return preview(db, content, Path(file.filename or "upload.csv").name)
    except ValueError as error:
        db.rollback()
        raise HTTPException(422, str(error)) from None
    finally:
        await file.close()


@api.post("/imports/{identifier}/confirm")
def confirm(identifier: int, values: ImportConfirmation, db: Session = Depends(get_db)):
    try:
        return commit_import(db, identifier, values.mapping)
    except ValueError as error:
        db.rollback()
        raise HTTPException(422, str(error)) from None


@api.get("/imports")
def imports(db: Session = Depends(get_db)):
    return [record(b, ("rows", "digest")) for b in db.scalars(select(ImportBatch).order_by(ImportBatch.id.desc()).limit(100))]


@api.get("/imports/{identifier}")
def import_details(identifier: int, db: Session = Depends(get_db)):
    batch = require(db, ImportBatch, identifier)
    return record(batch, ("digest",))


@api.get("/transactions")
def transactions(
    month: str | None = None, currency: str | None = None, account_id: int | None = None,
    kind: str | None = None, property_id: int | None = None, search: str = Query("", max_length=200),
    page: int = Query(1, ge=1), db: Session = Depends(get_db),
):
    query = select(Transaction)
    if month:
        start, end = month_dates(month)
        query = query.where(Transaction.transaction_date.between(start, end))
    for column, value in [(Transaction.currency, currency), (Transaction.account_id, account_id),
                          (Transaction.kind, kind), (Transaction.property_id, property_id)]:
        if value is not None:
            query = query.where(column == value)
    if search:
        query = query.where(Transaction.description.icontains(search, autoescape=True))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(Transaction.transaction_date.desc(), Transaction.id.desc()).offset((page - 1) * 50).limit(50))
    return {"total": total, "items": [record(t, ("raw", "fingerprint")) for t in rows]}


@api.get("/transactions/{identifier}")
def transaction_details(identifier: int, db: Session = Depends(get_db)):
    return record(require(db, Transaction, identifier), ("fingerprint",))


@api.put("/transactions/{identifier}")
def update_transaction(identifier: int, values: TransactionInput, db: Session = Depends(get_db)):
    transaction = require(db, Transaction, identifier)
    assign_transaction(db, transaction, values)
    save(db)
    return record(transaction, ("raw", "fingerprint"))


@api.get("/properties")
def properties(db: Session = Depends(get_db)):
    return [record(p) for p in db.scalars(select(Property).order_by(Property.id))]


@api.put("/properties/{identifier}")
def update_property(identifier: int, values: PropertyInput, db: Session = Depends(get_db)):
    item = require(db, Property, identifier)
    for key, value in values.model_dump().items():
        setattr(item, key, value)
    save(db)
    return record(item)


@api.get("/loans")
def loans(db: Session = Depends(get_db)):
    return [{
        **record(loan),
        "allocations": [record(a) for a in db.scalars(select(LoanProperty).where(LoanProperty.loan_id == loan.id))],
    } for loan in db.scalars(select(Loan).order_by(Loan.id))]


@api.post("/loans")
def create_loan(values: LoanInput, db: Session = Depends(get_db)):
    loan = save_loan(db, values)
    save(db)
    return record(loan)


@api.put("/loans/{identifier}")
def update_loan(identifier: int, values: LoanInput, db: Session = Depends(get_db)):
    loan = save_loan(db, values, require(db, Loan, identifier))
    save(db)
    return record(loan)


@api.get("/incomes")
def incomes(db: Session = Depends(get_db)):
    return [record(s) for s in db.scalars(select(IncomeSource).order_by(IncomeSource.id))]


@api.post("/incomes")
def create_income(values: IncomeInput, db: Session = Depends(get_db)):
    if values.property_id:
        require(db, Property, values.property_id)
    item = IncomeSource(**values.model_dump())
    db.add(item)
    save(db)
    return record(item)


@api.put("/incomes/{identifier}")
def update_income(identifier: int, values: IncomeInput, db: Session = Depends(get_db)):
    item = require(db, IncomeSource, identifier)
    if values.property_id:
        require(db, Property, values.property_id)
    used = db.scalar(select(Transaction.id).where(Transaction.income_source_id == item.id).limit(1))
    if used and any(getattr(item, key) != getattr(values, key) for key in ("kind", "property_id", "currency")):
        raise HTTPException(409, "This source has transactions. Create another source to change its type, currency, or property.")
    for key, value in values.model_dump().items():
        setattr(item, key, value)
    save(db)
    return record(item)


@api.post("/budgets")
def create_budget(values: BudgetInput, db: Session = Depends(get_db)):
    month_dates(values.month)
    existing = db.scalar(select(Budget).where(
        Budget.month == values.month, Budget.currency == values.currency, Budget.category == values.category,
    ))
    if existing:
        existing.amount = values.amount
    else:
        existing = Budget(**values.model_dump())
        db.add(existing)
    save(db)
    return record(existing)


@api.delete("/budgets/{identifier}", status_code=204)
def delete_budget(identifier: int, db: Session = Depends(get_db)):
    db.delete(require(db, Budget, identifier))
    save(db)


@api.get("/dashboard")
def dashboard(month: str, currency: str = Query("AUD", pattern=r"^[A-Z]{3}$"), db: Session = Depends(get_db)):
    start, end = month_dates(month)
    monthly = list(db.scalars(select(Transaction).where(
        Transaction.transaction_date.between(start, end), Transaction.currency == currency,
    )))
    included = [t for t in monthly if t.included]
    by_kind = income_totals(included)
    income = sum(by_kind.values(), Decimal("0"))
    spending = -sum((t.amount for t in included if t.kind == "expense"), Decimal("0"))
    repayments = -sum((t.amount for t in included if t.kind == "loan_repayment"), Decimal("0"))
    categories = {}
    for transaction in included:
        if transaction.kind == "expense":
            categories[transaction.category] = categories.get(transaction.category, Decimal("0")) - transaction.amount
    budgets = [{
        **record(b), "spent": categories.get(b.category, Decimal("0")),
    } for b in db.scalars(select(Budget).where(Budget.month == month, Budget.currency == currency))]
    sources = [{
        **record(source),
        "received": sum((t.amount for t in included if t.income_source_id == source.id and t.kind in INCOME_KINDS), Decimal("0")),
    } for source in db.scalars(select(IncomeSource).where(IncomeSource.currency == currency))]
    property_rows = []
    balances = allocated_balances(db)
    for prop in db.scalars(select(Property).order_by(Property.id)):
        links = list(db.execute(select(LoanProperty, Loan, Account).join(
            Loan, LoanProperty.loan_id == Loan.id,
        ).join(Account, Loan.account_id == Account.id).where(LoanProperty.property_id == prop.id)))
        in_currency = [(link, loan, account) for link, loan, account in links if account.currency == currency]
        known = [balances[(loan.id, prop.id)] for _, loan, _ in in_currency if loan.balance is not None]
        property_rows.append({
            **record(prop), **property_totals(included, prop.id),
            "loan_count": len(links), "currency_loan_count": len(in_currency),
            "known_balance_count": len(known),
            "allocated_balance": sum(known, Decimal("0")) if known else None,
            "banks": sorted({account.provider for _, _, account in links}),
        })
    trend = []
    for offset in range(5, -1, -1):
        index = start.year * 12 + start.month - 1 - offset
        trend_month = f"{index // 12:04d}-{index % 12 + 1:02d}"
        trend_start, trend_end = month_dates(trend_month)
        rows = list(db.scalars(select(Transaction).where(
            Transaction.transaction_date.between(trend_start, trend_end),
            Transaction.currency == currency, Transaction.included.is_(True),
        )))
        trend.append({
            "month": trend_month,
            "income": sum(income_totals(rows).values(), Decimal("0")),
            "spending": -sum((t.amount for t in rows if t.kind == "expense"), Decimal("0")),
        })
    return encode({
        "month": month, "currency": currency, "income": income, "spending": spending,
        "repayments": repayments, "cash_flow": income - spending - repayments,
        "review_count": sum(t.kind == "review" for t in included),
        "transaction_count": len(monthly),
        "total_transactions": db.scalar(select(func.count()).select_from(Transaction)),
        "account_count": db.scalar(select(func.count()).select_from(Account)),
        "currencies": sorted(set(db.scalars(select(Account.currency).distinct())) | {"AUD"}),
        "income_by_kind": by_kind, "sources": sources, "properties": property_rows,
        "categories": [{"name": key, "amount": value} for key, value in sorted(categories.items(), key=lambda item: -item[1])],
        "budgets": budgets, "trend": trend,
        "spending_breakdown": spending_breakdown(monthly),
    })


app.include_router(api)
