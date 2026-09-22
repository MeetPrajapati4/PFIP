"""Statement parsing engine.

Extracts a normalized transaction schema from uploaded bank statements:
    {date, description, amount (signed), balance}

CSV: pandas with column-name heuristics covering common bank export formats
     (separate debit/credit columns, single signed amount, Dr/Cr flag column).
PDF: pdfplumber table extraction with a regex line-parser fallback.
"""

import io
import logging
import re
from datetime import datetime, date

import pandas as pd

logger = logging.getLogger("pfip.parser")

DATE_FORMATS = [
    "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y", "%Y-%m-%d",
    "%d %b %Y", "%d-%b-%Y", "%d %B %Y", "%m/%d/%Y", "%b %d, %Y", "%d.%m.%Y",
]

_DATE_COLS = ["date", "txn date", "transaction date", "value date", "tran date", "post date"]
_DESC_COLS = ["description", "narration", "particulars", "details", "transaction details", "remarks", "transaction remarks"]
_DEBIT_COLS = ["debit", "withdrawal", "withdrawal amt", "withdrawal amt.", "debit amount", "dr", "dr amount", "withdrawals"]
_CREDIT_COLS = ["credit", "deposit", "deposit amt", "deposit amt.", "credit amount", "cr", "cr amount", "deposits"]
_AMOUNT_COLS = ["amount", "transaction amount", "amt", "txn amount"]
_BALANCE_COLS = ["balance", "closing balance", "running balance", "available balance", "bal"]
_TYPE_COLS = ["type", "dr/cr", "cr/dr", "transaction type", "txn type"]


class ParseError(Exception):
    pass


def parse_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip().replace("'", "")
    if not text or text.lower() in ("nan", "nat", ""):
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    try:
        parsed = pd.to_datetime(text, dayfirst=True, errors="coerce")
        return None if pd.isna(parsed) else parsed.date()
    except Exception:
        return None


def parse_amount(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return None if pd.isna(value) else float(value)
    text = str(value).strip()
    if not text or text.lower() in ("nan", "-", "--", ""):
        return None
    negative = text.startswith("(") and text.endswith(")")
    text = re.sub(r"[^\d.\-]", "", text)
    if not text or text in ("-", "."):
        return None
    try:
        amount = float(text)
        return -amount if negative else amount
    except ValueError:
        return None


def _find_col(columns: list[str], names: list[str]) -> str | None:
    lowered = {c.lower().strip(): c for c in columns}
    for name in names:
        if name in lowered:
            return lowered[name]
    for name in names:
        for low, original in lowered.items():
            if name in low:
                return original
    return None


def parse_csv(content: bytes) -> list[dict]:
    text = content.decode("utf-8-sig", errors="replace")
    # Some bank CSVs prepend metadata lines before the real header — locate it.
    lines = text.splitlines()
    header_idx = 0
    for i, line in enumerate(lines[:30]):
        low = line.lower()
        if any(d in low for d in ("date",)) and any(k in low for k in ("narration", "description", "particulars", "debit", "credit", "amount", "details")):
            header_idx = i
            break
    df = pd.read_csv(io.StringIO("\n".join(lines[header_idx:])), dtype=str, skip_blank_lines=True)
    df.columns = [str(c).strip() for c in df.columns]
    cols = list(df.columns)

    date_col = _find_col(cols, _DATE_COLS)
    desc_col = _find_col(cols, _DESC_COLS)
    debit_col = _find_col(cols, _DEBIT_COLS)
    credit_col = _find_col(cols, _CREDIT_COLS)
    amount_col = _find_col(cols, _AMOUNT_COLS)
    balance_col = _find_col(cols, _BALANCE_COLS)
    type_col = _find_col(cols, _TYPE_COLS)

    if date_col is None or desc_col is None:
        raise ParseError("Could not detect date/description columns in CSV. "
                         f"Found columns: {', '.join(cols)}")

    rows: list[dict] = []
    for _, row in df.iterrows():
        txn_date = parse_date(row.get(date_col))
        if txn_date is None:
            continue
        description = str(row.get(desc_col, "")).strip()
        if not description or description.lower() == "nan":
            continue

        amount: float | None = None
        if debit_col or credit_col:
            debit = parse_amount(row.get(debit_col)) if debit_col else None
            credit = parse_amount(row.get(credit_col)) if credit_col else None
            if debit and debit != 0:
                amount = -abs(debit)
            elif credit and credit != 0:
                amount = abs(credit)
        if amount is None and amount_col:
            raw = parse_amount(row.get(amount_col))
            if raw is not None:
                if type_col:
                    flag = str(row.get(type_col, "")).strip().lower()
                    if flag.startswith(("dr", "d", "debit", "w")):
                        raw = -abs(raw)
                    elif flag.startswith(("cr", "c", "credit")):
                        raw = abs(raw)
                amount = raw
        if amount is None or amount == 0:
            continue

        rows.append({
            "date": txn_date,
            "description": description,
            "amount": round(amount, 2),
            "balance": parse_amount(row.get(balance_col)) if balance_col else None,
        })

    if not rows:
        raise ParseError("No transactions found in CSV.")
    return rows


# Matches lines like: 04/01/2025 UPI/ZOMATO/... 450.00 12,345.67
_PDF_LINE = re.compile(
    r"^(?P<date>\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{1,2}\s+\w{3}\s+\d{4})\s+"
    r"(?P<desc>.+?)\s+"
    r"(?P<amt1>-?[\d,]+\.\d{2})"
    r"(?:\s+(?P<amt2>-?[\d,]+\.\d{2}))?"
    r"(?:\s+(?P<amt3>-?[\d,]+\.\d{2}))?\s*$"
)

_DEBIT_HINTS = re.compile(r"\b(dr|debit|wdl|withdrawal|paid|purchase|pos|atm)\b", re.IGNORECASE)


def parse_pdf(content: bytes) -> list[dict]:
    import pdfplumber

    rows: list[dict] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        # Attempt 1: structured tables
        for page in pdf.pages:
            for table in page.extract_tables() or []:
                rows.extend(_rows_from_table(table))
        # Attempt 2: regex over raw text lines
        if not rows:
            for page in pdf.pages:
                text = page.extract_text() or ""
                rows.extend(_rows_from_text(text))

    if not rows:
        raise ParseError("Could not extract transactions from this PDF. "
                         "If the statement is scanned (image-based), OCR support is on the roadmap — "
                         "try the CSV export from your bank instead.")
    return rows


def _rows_from_table(table: list[list]) -> list[dict]:
    if not table or len(table) < 2:
        return []
    header = [str(h or "").strip() for h in table[0]]
    df = pd.DataFrame(table[1:], columns=header)
    try:
        buffer = io.StringIO()
        df.to_csv(buffer, index=False)
        return parse_csv(buffer.getvalue().encode())
    except ParseError:
        return []


def _rows_from_text(text: str) -> list[dict]:
    raw_lines: list[dict] = []
    for line in text.splitlines():
        match = _PDF_LINE.match(line.strip())
        if not match:
            continue
        txn_date = parse_date(match.group("date"))
        if txn_date is None:
            continue
        description = match.group("desc").strip()
        amounts = [parse_amount(match.group(g)) for g in ("amt1", "amt2", "amt3")]
        amounts = [a for a in amounts if a is not None]
        if not amounts:
            continue

        balance = amounts[-1] if len(amounts) >= 2 else None
        amount = amounts[0]
        raw_lines.append({
            "date": txn_date,
            "description": description,
            "amount": amount,
            "balance": balance,
            "has_debit_hint": bool(_DEBIT_HINTS.search(description)),
            "single_amount": len(amounts) == 1,
        })

    if not raw_lines:
        return []

    # Detect if transactions appear in reverse-chronological order (newest first)
    is_reverse = len(raw_lines) >= 2 and raw_lines[0]["date"] > raw_lines[-1]["date"]
    order = list(reversed(range(len(raw_lines)))) if is_reverse else list(range(len(raw_lines)))

    prev_balance: float | None = None
    resolved_amounts: dict[int, float] = {}
    for idx in order:
        item = raw_lines[idx]
        amt = item["amount"]
        bal = item["balance"]
        if bal is not None and prev_balance is not None:
            amt = abs(amt) if bal > prev_balance else -abs(amt)
        elif item["has_debit_hint"] or item["single_amount"]:
            amt = -abs(amt)
        if bal is not None:
            prev_balance = bal
        resolved_amounts[idx] = amt

    rows: list[dict] = []
    for idx, item in enumerate(raw_lines):
        amt = resolved_amounts.get(idx, -abs(item["amount"]))
        rows.append({"date": item["date"], "description": item["description"],
                     "amount": round(amt, 2), "balance": item["balance"]})
    return rows


def detect_bank_name(content: bytes, filename: str) -> str:
    known = ["HDFC", "ICICI", "SBI", "State Bank", "Axis", "Kotak", "IDFC", "Yes Bank",
             "IndusInd", "PNB", "Bank of Baroda", "Canara", "Federal", "Chase",
             "Bank of America", "Wells Fargo", "Citi", "HSBC", "Standard Chartered"]
    sample = ""
    try:
        sample = content[:4000].decode("utf-8", errors="ignore")
    except Exception:
        pass
    haystack = f"{filename} {sample}".lower()
    for bank in known:
        if bank.lower() in haystack:
            return f"{bank} Bank" if "bank" not in bank.lower() else bank
    return "Unknown Bank"


def parse_statement(content: bytes, filename: str) -> list[dict]:
    name = filename.lower()
    if name.endswith(".csv"):
        return parse_csv(content)
    if name.endswith(".pdf"):
        return parse_pdf(content)
    raise ParseError("Unsupported file type. Upload a .pdf or .csv bank statement.")
