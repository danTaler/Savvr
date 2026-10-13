from .base import BankAdapter


class ING(BankAdapter):
    name = "ING"
    aliases = ("ing", "ing australia", "ing direct")

    def account_kind(self, account_name: str) -> str:
        if "residential mortgage" in account_name.casefold():
            return "loan"
        return super().account_kind(account_name)
