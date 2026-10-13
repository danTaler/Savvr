import re


class BankAdapter:
    """Bank-specific hints never assign properties or confirm income."""

    name = "Other bank"
    aliases: tuple[str, ...] = ()

    def normalize_account(self, number: str) -> str:
        return re.sub(r"[\s-]", "", number.casefold())

    def account_kind(self, account_name: str) -> str:
        name = account_name.casefold()
        if any(word in name for word in ("mortgage", "loan")):
            return "loan"
        if "offset" in name:
            return "offset"
        if "credit card" in name:
            return "credit_card"
        return "bank"

    def property_transaction_hint(self, description: str, category: str) -> str:
        text = f"{description} {category}".casefold()
        if any(word in text for word in ("loan repayment", "ln repay", "mortgage repayment")):
            return "loan_repayment"
        if "transfer" in text:
            return "transfer"
        if any(word in text for word in ("rental income", "rent received")):
            return "rental"
        return ""

    def income_hint(self, description: str) -> str:
        if any(word in description.casefold() for word in ("salary", "payroll", "wages")):
            return "salary"
        return ""
