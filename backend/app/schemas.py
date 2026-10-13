from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Money = Annotated[Decimal, Field(ge=0, max_digits=18, decimal_places=2)]
Currency = Annotated[str, Field(pattern=r"^[A-Z]{3}$")]
IncomeKind = Literal["salary", "rental", "interest", "dividend", "other_income"]
TransactionKind = Literal[
    "expense", "salary", "rental", "interest", "dividend", "other_income",
    "transfer", "loan_repayment", "refund", "review",
]


class Input(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class Login(BaseModel):
    password: str = Field(max_length=256)


class ImportConfirmation(Input):
    mapping: dict[str, int | None]


class PropertyInput(Input):
    name: str = Field(min_length=1, max_length=120)
    address: str = Field(default="", max_length=300)
    notes: str = Field(default="", max_length=1000)


class LoanAllocation(Input):
    property_id: int
    share: Annotated[Decimal, Field(gt=0, le=100, decimal_places=4)]


class LoanInput(Input):
    name: str = Field(min_length=1, max_length=120)
    account_id: int
    offset_account_id: int | None = None
    balance: Money | None = None
    interest_rate: Annotated[Decimal, Field(ge=0, le=100, decimal_places=4)] | None = None
    balance_as_of: date | None = None
    allocations: list[LoanAllocation] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def validate_allocations(self):
        if sum(a.share for a in self.allocations) != 100:
            raise ValueError("Property allocations must total 100%.")
        if len({a.property_id for a in self.allocations}) != len(self.allocations):
            raise ValueError("Each property can appear only once.")
        if self.balance is not None and self.balance_as_of is None:
            raise ValueError("A manually entered balance needs an as-of date.")
        if self.offset_account_id == self.account_id:
            raise ValueError("The loan and offset account must differ.")
        return self


class IncomeInput(Input):
    name: str = Field(min_length=1, max_length=120)
    kind: IncomeKind
    property_id: int | None = None
    expected_monthly: Money | None = None
    currency: Currency = "AUD"

    @model_validator(mode="after")
    def rental_property(self):
        if self.kind == "rental" and self.property_id is None:
            raise ValueError("Rental income must be linked to a property.")
        return self


class TransactionInput(Input):
    kind: TransactionKind
    category: str = Field(min_length=1, max_length=160)
    property_id: int | None = None
    income_source_id: int | None = None
    included: bool
    notes: str = Field(default="", max_length=2000)


class BudgetInput(Input):
    category: str = Field(min_length=1, max_length=160)
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    currency: Currency = "AUD"
    amount: Money
