from .american_express import AmericanExpress
from .bank_four import BankFour
from .bank_three import BankThree
from .base import BankAdapter
from .commbank import CommBank
from .ing import ING

ADAPTERS = (CommBank(), ING(), AmericanExpress(), BankThree(), BankFour())


def get_bank(provider: str) -> BankAdapter:
    return next(
        (bank for bank in ADAPTERS if provider.strip().casefold() in bank.aliases),
        BankAdapter(),
    )


def provider_key(provider: str) -> str:
    bank = get_bank(provider)
    return bank.name if bank.aliases else provider.strip().casefold()
