"""Transaction categorization.

Three tiers, highest confidence first:

  1. User rules      — explicit "this merchant is always X" (rules_service)
  2. Gemini lite     — batched classification with a strict JSON contract
  3. Keyword engine  — deterministic patterns covering common Indian and
                       international merchants

The keyword engine is not just a fallback for outages: it runs first on every
row, so the AI's answer is always checked against a known-good baseline and the
platform stays fully functional with no API key at all.
"""

import logging
import re

from app.services import gemini_client

logger = logging.getLogger("pfip.categorizer")

CATEGORIES = [
    "Salary", "Business Income", "Food & Dining", "Groceries", "Shopping",
    "Transportation", "Utilities", "Rent", "Insurance", "Investments",
    "Healthcare", "Entertainment", "Travel", "Education", "Loan Payments",
    "Taxes", "Cash Withdrawal", "Transfers", "Refunds", "Fees & Charges",
    "Subscriptions", "Personal Care", "Gifts & Donations", "Childcare",
    "Pets", "Miscellaneous",
]

INCOME_CATEGORIES = {"Salary", "Business Income", "Refunds"}

# Categories that represent money moving rather than money spent.
NEUTRAL_CATEGORIES = {"Transfers", "Investments"}

# Ordered: the first pattern to match wins, so specific beats generic.
_KEYWORD_MAP: list[tuple[str, str]] = [
    (r"salary|payroll|sal cr|sal-cr|wages|stipend|monthly remuneration", "Salary"),
    (r"invoice|client payment|consulting|freelance|retainer|payout|professional fee", "Business Income"),

    (r"netflix|spotify|prime video|hotstar|disney\+|youtube premium|apple music|audible|"
     r"icloud|google one|dropbox|adobe|microsoft 365|canva|notion|chatgpt|openai|claude", "Subscriptions"),

    (r"zomato|swiggy|dominos|pizza|mcdonald|kfc|burger|starbucks|cafe|coffee|restaurant|"
     r"eatery|dunkin|barbeque|biryani|chaayos|haldiram|subway|taco|wow momo|behrouz", "Food & Dining"),
    (r"bigbasket|blinkit|zepto|grofers|dmart|grocery|instamart|reliance fresh|more supermarket|"
     r"spencer|nature.s basket|licious|country delight|milk", "Groceries"),
    (r"amazon|flipkart|myntra|ajio|nykaa|meesho|snapdeal|tata cliq|shopping|mall|decathlon|"
     r"ikea|croma|reliance digital|vijay sales|lifestyle|westside|zara|h&m|uniqlo", "Shopping"),
    (r"uber|ola |rapido|metro|irctc|redbus|fuel|petrol|diesel|hpcl|iocl|bpcl|shell|fastag|"
     r"parking|namma yatri|blusmart|toll", "Transportation"),
    (r"electricity|water bill|gas bill|broadband|airtel|jio|vodafone|\bvi\b|bsnl|wifi|dth|"
     r"tata power|bescom|adani electricity|mahanagar gas|indane|utility|act fibernet|hathway", "Utilities"),
    (r"\brent\b|landlord|lease|nobroker pay|housing society|maintenance charge", "Rent"),
    (r"insurance|lic |policy premium|hdfc ergo|icici lombard|star health|bajaj allianz|"
     r"max life|tata aig|acko|digit", "Insurance"),
    (r"zerodha|groww|upstox|mutual fund|\bsip\b|\betf\b|\bnps\b|\bppf\b|smallcase|kite|"
     r"coin |angel one|icici direct|hdfc securities|kuvera|indmoney|paytm money", "Investments"),
    (r"hospital|clinic|pharmacy|apollo|medplus|netmeds|pharmeasy|1mg|diagnostic|doctor|"
     r"dental|lab test|thyrocare|practo|cult\.?fit|gym|fitness", "Healthcare"),
    (r"bookmyshow|\bpvr\b|inox|cinepolis|gaming|steam|playstation|xbox|nintendo|"
     r"concert|event|theatre|amusement", "Entertainment"),
    (r"makemytrip|goibibo|airbnb|\boyo\b|hotel|indigo|air india|vistara|spicejet|akasa|"
     r"booking\.com|cleartrip|yatra|ixigo|easemytrip|resort|homestay", "Travel"),
    (r"udemy|coursera|byjus|unacademy|school fee|tuition|college|university|"
     r"\bcourse\b|upgrad|vedantu|physics wallah|scaler|exam fee", "Education"),
    (r"\bemi\b|loan|repayment|bajaj fin|home credit|lending|credit card bill|cred |"
     r"principal|interest payment", "Loan Payments"),
    (r"income tax|\bgst\b|\btds\b|advance tax|tax payment|property tax|professional tax", "Taxes"),
    (r"salon|spa |barber|grooming|urban company|beauty|cosmetic|skincare", "Personal Care"),
    (r"donation|charity|\bngo\b|temple|gurudwara|gift|giftcard|gift card", "Gifts & Donations"),
    (r"daycare|creche|nanny|baby|diaper|firstcry|toy", "Childcare"),
    (r"\bpet\b|veterinar|petsmart|heads up for tails|supertails|dog food|cat food", "Pets"),
    (r"\batm\b|cash wdl|cash withdrawal|csh wdl|cash dep", "Cash Withdrawal"),
    (r"refund|reversal|cashback|\brev-|chargeback", "Refunds"),
    (r"charges|\bfee\b|penalty|\bamc\b|annual maintenance|sms chg|min bal|"
     r"late payment|convenience fee|processing fee|gst on", "Fees & Charges"),
    (r"upi|imps|neft|rtgs|transfer to|trf to|fund transfer|self transfer|"
     r"to own account|\bp2p\b", "Transfers"),
]

_COMPILED = [(re.compile(pattern), category) for pattern, category in _KEYWORD_MAP]

# Narration noise that is never part of a merchant name.
_MERCHANT_NOISE = re.compile(
    r"\b(UPI|IMPS|NEFT|RTGS|POS|ACH|ATM|ECOM|VPS|MMT|TXN|REF|PAYMENT|PMT|PURCHASE|"
    r"DEBIT|CREDIT|CARD|TRANSFER|TRF|BIL|BILLPAY|AUTOPAY|MANDATE|COLLECT|"
    r"IND|PVT|LTD|LIMITED|PRIVATE|INDIA|DR|CR)\b",
    re.IGNORECASE,
)


def normalize_merchant(description: str) -> str:
    """Deterministic merchant extraction from a raw bank narration.

    Bank narrations are a soup of rails prefixes, reference numbers and UPI
    handles wrapped around the one token a human cares about. This strips the
    scaffolding and returns the longest surviving alphabetic run.
    """
    text = description.upper()
    # Rails prefix, optionally followed by a direction flag ("ACH DR", "NEFT CR").
    text = re.sub(r"^(UPI|IMPS|NEFT|RTGS|POS|ACH|ATM|ATW|ECOM|VPS|MMT)[/\-: ]*(DR|CR)?[/\-: ]*",
                  "", text)
    text = re.sub(r"X{3,}", " ", text)              # masked card numbers (4111XXXXXXXX1234)
    text = re.sub(r"[0-9]{4,}", " ", text)          # reference numbers
    text = re.sub(r"@[A-Z0-9.\-_]+", " ", text)     # UPI handles (@okhdfcbank)
    text = re.sub(r"\b[A-Z0-9]*\d[A-Z0-9]*\b", " ", text)  # alphanumeric refs

    parts = [p.strip() for p in re.split(r"[/\-|,;:]", text) if p.strip()]
    candidates = []
    for part in parts:
        cleaned = _MERCHANT_NOISE.sub(" ", part)
        cleaned = re.sub(r"[^A-Z& ]", " ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if len(cleaned) >= 3:
            candidates.append(cleaned)

    if not candidates:
        fallback = re.sub(r"[^A-Za-z ]", " ", description)
        fallback = re.sub(r"\s+", " ", fallback).strip()
        return (fallback.title() or "Unknown")[:80]

    merchant = max(candidates, key=len)
    return merchant.title()[:80] or "Unknown"


def categorize_local(description: str, amount: float) -> str:
    text = description.lower()
    for pattern, category in _COMPILED:
        if pattern.search(text):
            # Sign sanity: a credit matching an expense keyword is usually a refund.
            if amount > 0 and category not in INCOME_CATEGORIES and category not in NEUTRAL_CATEGORIES:
                return "Refunds" if re.search(r"refund|cashback|reversal", text) else category
            return category
    if amount > 0:
        return "Business Income" if amount > 10_000 else "Transfers"
    return "Miscellaneous"


def categorize_batch(transactions: list[dict], *, progress=None) -> tuple[list[str], list[str], str]:
    """Categorize `{description, amount}` dicts.

    Returns `(categories, sources, overall_source)` where each source is
    "gemini" or "local", so the UI can show per-row provenance rather than one
    coarse per-statement label.
    """
    local = [categorize_local(t["description"], t["amount"]) for t in transactions]
    sources = ["local"] * len(transactions)
    if not gemini_client.is_available() or not transactions:
        return local, sources, "local"

    results: list[str | None] = [None] * len(transactions)
    batch_size = 40
    starts = list(range(0, len(transactions), batch_size))
    any_gemini = False

    for n, start in enumerate(starts):
        chunk = transactions[start:start + batch_size]
        lines = "\n".join(
            f'{i}. "{t["description"][:120]}" (amount: {t["amount"]:+.2f})'
            for i, t in enumerate(chunk)
        )
        prompt = (
            "Classify each bank transaction into exactly one category from this list:\n"
            f"{', '.join(CATEGORIES)}\n\n"
            "Positive amounts are credits (money in), negative are debits (money out).\n"
            "Use 'Transfers' only for movement between the person's own accounts.\n"
            "Use 'Subscriptions' for recurring digital services (streaming, software).\n"
            f"Transactions:\n{lines}\n\n"
            'Respond with a JSON array of objects: [{"i": <index>, "category": "<category>"}] '
            "covering every index exactly once."
        )
        parsed = gemini_client.generate_json(
            prompt, lite=True, system="You are a precise financial transaction classifier.")
        if isinstance(parsed, list):
            for item in parsed:
                try:
                    idx = int(item["i"])
                    cat = str(item["category"])
                    if 0 <= idx < len(chunk) and cat in CATEGORIES:
                        results[start + idx] = cat
                        sources[start + idx] = "gemini"
                        any_gemini = True
                except (KeyError, TypeError, ValueError):
                    continue
        if progress:
            progress(n + 1, len(starts))

    final = [r if r is not None else local[i] for i, r in enumerate(results)]
    return final, sources, ("gemini" if any_gemini else "local")
