from .base import BankAdapter


class CommBank(BankAdapter):
    name = "CommBank"
    aliases = ("commbank", "commonwealth bank", "commonwealth bank of australia")

    def property_transaction_hint(self, description: str, category: str) -> str:
        if "ln repay" in description.casefold():
            return "loan_repayment"
        return super().property_transaction_hint(description, category)
