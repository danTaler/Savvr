import re

from .base import BankAdapter


class AmericanExpress(BankAdapter):
    name = "American Express"
    aliases = ("american express", "amex")

    def account_kind(self, account_name: str) -> str:
        return "credit_card"

    def extract_location(self, description: str) -> str:
        """Amex often pads a trailing locality; otherwise use its final word."""
        description = description.strip()
        segments = re.split(r"\s{2,}", description)
        if len(segments) > 1:
            candidate = segments[-1]
        else:
            words = description.split()
            candidate = words[-1] if len(words) > 1 else ""
        return candidate if candidate and any(c.isalpha() for c in candidate) else ""
