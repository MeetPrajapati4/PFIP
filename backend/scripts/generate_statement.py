#!/usr/bin/env python
"""Generate a realistic bank statement CSV for testing PFIP end to end.

This is a developer tool, not a product feature. It writes files in the exact
shape real Indian banks export — HDFC, ICICI and SBI each format their CSVs
differently, and every one of those differences (separate withdrawal/deposit
columns vs. a signed amount, `DD/MM/YY` vs. `DD-MMM-YYYY`, metadata rows above
the header) is a thing the parser has to survive. Generating all three formats
means the upload path is exercised the way production will actually hit it.

The financial behaviour underneath is modelled, not random: a salaried
professional with fixed obligations on fixed days, subscriptions that renew on
their own cadence and occasionally get a price rise, groceries and food that
follow a weekday/weekend rhythm, seasonal spikes (festival shopping, summer
travel), and a handful of realistic one-offs. That gives the analytics,
recurring detection, anomaly model and forecast something true to chew on.

Usage:
    python scripts/generate_statement.py                       # 18 months, HDFC
    python scripts/generate_statement.py --format icici --months 24
    python scripts/generate_statement.py --profile freelancer --out my.csv
    python scripts/generate_statement.py --all                 # one of each
"""

from __future__ import annotations

import argparse
import csv
import random
import sys
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

# --------------------------------------------------------------------------
# Merchant catalogue
# --------------------------------------------------------------------------

FOOD = [
    ("UPI/{ref}/ZOMATO ONLINE ORDER/YESB", 220, 900),
    ("UPI/{ref}/SWIGGY FOOD ORDER/HDFC", 180, 850),
    ("POS {card} STARBUCKS COFFEE INDIA", 280, 620),
    ("UPI/{ref}/DOMINOS PIZZA IND/ICIC", 350, 1100),
    ("POS {card} THIRD WAVE COFFEE", 200, 480),
    ("UPI/{ref}/BEHROUZ BIRYANI/PAYTM", 400, 1200),
    ("POS {card} CHAAYOS TEA CAFE", 150, 420),
    ("UPI/{ref}/BARBEQUE NATION HOSP/HDFC", 1400, 3600),
    ("POS {card} MCDONALDS INDIA PVT", 220, 700),
    ("UPI/{ref}/WOW MOMO FOODS/AXIS", 180, 560),
]

GROCERY = [
    ("UPI/{ref}/BLINKIT GROCERY/HDFC", 320, 1900),
    ("UPI/{ref}/BIGBASKET SUPERMKT/ICIC", 900, 4200),
    ("POS {card} DMART AVENUE SUPERMARTS", 1200, 5200),
    ("UPI/{ref}/ZEPTO NOW/YESB", 240, 1400),
    ("UPI/{ref}/LICIOUS MEAT DELIVERY/HDFC", 600, 1800),
    ("UPI/{ref}/COUNTRY DELIGHT MILK/AXIS", 450, 900),
]

SHOPPING = [
    ("POS {card} AMAZON SELLER SERVICES", 500, 7500),
    ("UPI/{ref}/FLIPKART INTERNET/HDFC", 700, 9000),
    ("POS {card} MYNTRA DESIGNS PVT LTD", 900, 5500),
    ("POS {card} DECATHLON SPORTS INDIA", 1200, 6000),
    ("POS {card} IKEA INDIA PVT LTD", 1800, 12000),
    ("UPI/{ref}/NYKAA ECOMM/ICIC", 600, 3200),
]

TRANSPORT = [
    ("UPI/{ref}/UBER INDIA SYSTEMS/HDFC", 120, 780),
    ("UPI/{ref}/OLA CABS ANI TECH/PAYTM", 140, 820),
    ("POS {card} HPCL PETROL PUMP", 1500, 4200),
    ("UPI/{ref}/RAPIDO BIKE TAXI/YESB", 60, 260),
    ("UPI/{ref}/NAMMA YATRI/AXIS", 90, 420),
    ("POS {card} IRCTC RAIL TICKET BOOKING", 450, 2800),
    ("UPI/{ref}/PAYTM FASTAG RECHARGE/PYTM", 500, 1000),
]

ENTERTAINMENT = [
    ("UPI/{ref}/BOOKMYSHOW TICKETS/HDFC", 350, 1600),
    ("POS {card} PVR CINEMAS LTD", 400, 1400),
    ("POS {card} STEAM GAMES VALVE CORP", 500, 3200),
]

HEALTH = [
    ("UPI/{ref}/APOLLO PHARMACY/HDFC", 220, 1800),
    ("UPI/{ref}/PHARMEASY ONLINE/ICIC", 300, 2200),
    ("POS {card} CULT FIT FITNESS", 1500, 2500),
    ("POS {card} PRACTO CONSULT", 500, 1500),
]

PERSONAL = [
    ("UPI/{ref}/URBAN COMPANY SALON/HDFC", 500, 2200),
    ("POS {card} LAKME SALON", 700, 2800),
]

# (narration, amount, day-of-month, cadence in months)
SUBSCRIPTIONS = [
    ("ACH DR NETFLIX ENTERTAINMENT SVC", 649, 7, 1),
    ("ACH DR SPOTIFY INDIA PREMIUM", 149, 11, 1),
    ("UPI/AUTOPAY/AIRTEL BROADBAND BILL/AIRT", 1199, 5, 1),
    ("UPI/AUTOPAY/JIO POSTPAID BILL/RJIO", 599, 14, 1),
    ("ACH DR GOOGLE ONE STORAGE", 210, 19, 1),
    ("ACH DR AMAZON PRIME MEMBERSHIP", 1499, 22, 12),
    ("ACH DR HDFC ERGO HEALTH INSURANCE PREM", 2450, 9, 1),
    ("ACH DR ADOBE CREATIVE CLOUD", 1675, 16, 1),
]


@dataclass
class Profile:
    """A financial persona. Everything downstream derives from these numbers."""

    key: str
    name: str
    opening_balance: float
    salary: float
    salary_narration: str
    rent: float
    emi: float | None
    sip: float
    salary_day: int = 1
    # Multiplier applied to every discretionary amount — a bigger earner spends more.
    lifestyle: float = 1.0
    irregular_income: bool = False
    # Salaried people pay tax via TDS; the self-employed pay it themselves.
    pays_advance_tax: bool = False
    extras: list[str] = field(default_factory=list)


PROFILES = {
    "salaried": Profile(
        key="salaried",
        name="Salaried professional, Bengaluru",
        opening_balance=214_500.0,
        salary=185_000.0,
        salary_narration="NEFT CR-HDFC0000123-ACME TECHNOLOGIES PVT LTD-SALARY {month}",
        rent=34_000.0,
        emi=21_500.0,
        sip=20_000.0,
        lifestyle=1.0,
    ),
    "freelancer": Profile(
        key="freelancer",
        name="Independent consultant, variable income",
        opening_balance=143_000.0,
        salary=0.0,
        salary_narration="",
        rent=28_000.0,
        emi=None,
        sip=12_000.0,
        lifestyle=0.85,
        irregular_income=True,
        pays_advance_tax=True,
    ),
    "family": Profile(
        key="family",
        name="Dual-income household with a child",
        opening_balance=386_000.0,
        salary=310_000.0,
        salary_narration="NEFT CR-ICIC0000456-NORTHSTAR ANALYTICS LLP-SALARY {month}",
        rent=52_000.0,
        emi=38_000.0,
        sip=35_000.0,
        lifestyle=1.35,
        extras=["childcare", "education"],
    ),
}

MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
              "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


class StatementBuilder:
    def __init__(self, profile: Profile, months: int, seed: int, end: date):
        self.profile = profile
        self.months = months
        self.rng = random.Random(seed)
        self.end = end
        self.rows: list[dict] = []

    # -- helpers ---------------------------------------------------------
    def _ref(self) -> str:
        return str(self.rng.randint(100_000_000_000, 999_999_999_999))

    def _card(self) -> str:
        return f"{self.rng.randint(4000, 5599)}XXXXXXXX{self.rng.randint(1000, 9999)}"

    def _narration(self, template: str) -> str:
        return template.format(ref=self._ref(), card=self._card())

    def _add(self, when: date, narration: str, amount: float) -> None:
        if when > self.end:
            return
        self.rows.append({"date": when, "narration": narration, "amount": round(amount, 2)})

    def _spend(self, when: date, catalogue: list[tuple[str, int, int]], scale: float = 1.0) -> None:
        template, low, high = self.rng.choice(catalogue)
        amount = self.rng.uniform(low, high) * self.profile.lifestyle * scale
        self._add(when, self._narration(template), -amount)

    def _month_starts(self) -> list[date]:
        """First day of each month in the window, oldest first."""
        starts = []
        y, m = self.end.year, self.end.month
        for _ in range(self.months):
            starts.append(date(y, m, 1))
            m -= 1
            if m == 0:
                m, y = 12, y - 1
        return list(reversed(starts))

    def _day(self, anchor: date, day: int) -> date:
        """A safe date within `anchor`'s month."""
        last = 28 if anchor.month == 2 else 30 if anchor.month in (4, 6, 9, 11) else 31
        return date(anchor.year, anchor.month, min(day, last))

    # -- generation ------------------------------------------------------
    def build(self) -> list[dict]:
        p = self.profile
        starts = self._month_starts()
        # Subscription prices creep up over time, like they do in life.
        sub_prices = {s[0]: float(s[1]) for s in SUBSCRIPTIONS}

        for index, anchor in enumerate(starts):
            month_label = f"{MONTH_ABBR[anchor.month - 1]}{anchor.year % 100:02d}"
            seasonal = self._seasonal_factor(anchor.month)

            self._income(anchor, month_label, index)
            self._fixed_obligations(anchor, month_label)
            self._subscriptions(anchor, sub_prices, index)
            self._variable_spend(anchor, seasonal)
            self._one_offs(anchor, index, len(starts))

        self.rows.sort(key=lambda r: (r["date"], r["narration"]))
        self._apply_running_balance()
        return self.rows

    def _seasonal_factor(self, month: int) -> float:
        """Oct/Nov festival season and April/May travel season cost more."""
        return {10: 1.35, 11: 1.25, 4: 1.15, 5: 1.20, 12: 1.18}.get(month, 1.0)

    def _income(self, anchor: date, month_label: str, index: int) -> None:
        p = self.profile
        if p.irregular_income:
            # 2-3 client invoices a month, lumpy amounts, lumpy timing — and
            # the occasional dry month, which is the whole point of modelling
            # a freelancer at all.
            invoices = self.rng.choices([1, 2, 3], weights=[1, 4, 4])[0]
            for _ in range(invoices):
                amount = self.rng.choice([55_000, 75_000, 95_000, 130_000, 40_000])
                amount *= self.rng.uniform(0.9, 1.1)
                day = self.rng.randint(3, 26)
                client = self.rng.choice(
                    ["MERIDIAN LABS", "BLUEPRINT STUDIO", "NORTHWIND SAAS", "KETTLE & CO"])
                self._add(self._day(anchor, day),
                          f"IMPS CR-{self._ref()[:9]}-{client}-INVOICE SETTLEMENT", amount)
        else:
            # A modest raise partway through the window keeps YoY growth honest.
            raise_factor = 1.0 + (0.08 if index >= self.months // 2 else 0.0)
            salary = p.salary * raise_factor * self.rng.uniform(0.995, 1.005)
            self._add(self._day(anchor, p.salary_day),
                      p.salary_narration.format(month=month_label), salary)
            if self.rng.random() < 0.22:
                self._add(self._day(anchor, self.rng.randint(10, 22)),
                          f"IMPS CR-{self._ref()[:9]}-PERFORMANCE INCENTIVE PAYOUT",
                          self.rng.uniform(15_000, 42_000))

        # Small refunds happen to everyone.
        if self.rng.random() < 0.45:
            self._add(self._day(anchor, self.rng.randint(8, 26)),
                      f"UPI/{self._ref()}/AMAZON SELLER SERV REFUND/HDFC",
                      self.rng.uniform(400, 3_200))

    def _fixed_obligations(self, anchor: date, month_label: str) -> None:
        p = self.profile
        self._add(self._day(anchor, 2),
                  f"UPI/{self._ref()}/NOBROKER PAY RENT LANDLORD/HDFC", -p.rent)
        if p.emi:
            self._add(self._day(anchor, 5),
                      f"ACH DR HDFC BANK HOME LOAN EMI {month_label}", -p.emi)
        self._add(self._day(anchor, 6),
                  f"UPI/{self._ref()}/ZERODHA BROKING MF SIP/ZERO", -p.sip)
        self._add(self._day(anchor, 8),
                  f"UPI/AUTOPAY/BESCOM ELECTRICITY BILL/BESC",
                  -self.rng.uniform(1_450, 3_400) * p.lifestyle)
        self._add(self._day(anchor, 12),
                  f"UPI/{self._ref()}/MAHANAGAR GAS BILL PAY/MGAS",
                  -self.rng.uniform(600, 1_150))

        if "childcare" in p.extras:
            self._add(self._day(anchor, 4),
                      "ACH DR LITTLE SCHOLARS DAYCARE MONTHLY FEE", -18_500)
        if "education" in p.extras and anchor.month in (4, 7, 10, 1):
            self._add(self._day(anchor, 10),
                      "NEFT DR-GREENWOOD HIGH SCHOOL-TERM FEE", -46_000)

        # A credit-card bill covering the spending that never touches this
        # account. Kept modest on purpose — the POS lines below already
        # represent the card-visible spend, and double-counting both would
        # make the savings rate nonsense.
        if self.rng.random() < 0.75:
            self._add(self._day(anchor, self.rng.randint(15, 24)),
                      f"UPI/{self._ref()}/CRED CLUB CREDIT CARD BILL/AXIS",
                      -self.rng.uniform(5_500, 14_000) * p.lifestyle)

    def _subscriptions(self, anchor: date, sub_prices: dict[str, float], index: int) -> None:
        for narration, _, day, cadence in SUBSCRIPTIONS:
            if cadence == 12 and index % 12 != 3:
                continue
            price = sub_prices[narration]
            # ~4% chance per month of a price rise, compounding — how they creep.
            if self.rng.random() < 0.04:
                price = round(price * self.rng.uniform(1.10, 1.25))
                sub_prices[narration] = price
            self._add(self._day(anchor, day), narration, -price)

    def _variable_spend(self, anchor: date, seasonal: float) -> None:
        p = self.profile
        last_day = (self._day(anchor, 31)).day

        for day in range(1, last_day + 1):
            when = date(anchor.year, anchor.month, day)
            if when > self.end:
                break
            weekend = when.weekday() >= 5
            # Eating out clusters on weekends; groceries on weekend mornings.
            food_chance = 0.62 if weekend else 0.34
            if self.rng.random() < food_chance:
                self._spend(when, FOOD, 1.3 if weekend else 1.0)
            if self.rng.random() < (0.30 if weekend else 0.12):
                self._spend(when, GROCERY)
            if self.rng.random() < 0.30:
                self._spend(when, TRANSPORT)
            if self.rng.random() < (0.10 * seasonal):
                self._spend(when, SHOPPING, seasonal)
            if weekend and self.rng.random() < 0.16:
                self._spend(when, ENTERTAINMENT)
            if self.rng.random() < 0.05:
                self._spend(when, HEALTH)
            if self.rng.random() < 0.04:
                self._spend(when, PERSONAL)

        # Month-end sweep into a linked savings/investment account. Real
        # statements are full of these, and they're exactly what the Transfers
        # category exists to keep out of the spending figures. Skipped for
        # irregular income — you don't sweep a balance you might need next week.
        if not p.irregular_income and self.rng.random() < 0.7:
            self._add(self._day(anchor, self.rng.randint(26, 28)),
                      f"IMPS DR-{self._ref()[:9]}-SELF TRANSFER TO SAVINGS AC",
                      -self.rng.uniform(20_000, 55_000) * p.lifestyle)

        # Cash still exists.
        for _ in range(self.rng.randint(1, 2)):
            self._add(self._day(anchor, self.rng.randint(5, 26)),
                      f"ATW-{self._card()}-HDFC BANK ATM CASH WITHDRAWAL",
                      -self.rng.choice([2_000, 3_000, 5_000, 10_000]))

        # Bank fees: small, annoying, and exactly what people want flagged.
        if self.rng.random() < 0.25:
            self._add(self._day(anchor, self.rng.randint(1, 28)),
                      "SMS ALERT CHARGES INCL GST", -self.rng.choice([17.70, 23.60]))
        if self.rng.random() < 0.10:
            self._add(self._day(anchor, self.rng.randint(1, 28)),
                      "ATM CASH WDL CHARGE EXCEEDING FREE LIMIT INCL GST", -25.96)

    def _one_offs(self, anchor: date, index: int, total: int) -> None:
        """Large, memorable purchases — the anomaly detector's reason to exist."""
        rng = self.rng
        age = total - index  # months back from the end of the window

        if age == 3 and rng.random() < 0.9:
            self._add(self._day(anchor, 14),
                      f"POS {self._card()} MAKEMYTRIP FLIGHT BOOKING BLR-GOI", -38_400)
            self._add(self._day(anchor, 15),
                      f"POS {self._card()} TAJ RESORTS HOTEL BOOKING", -46_800)
        if age == 8 and rng.random() < 0.9:
            self._add(self._day(anchor, 12),
                      f"POS {self._card()} CROMA ELECTRONICS APPLE MACBOOK", -1_64_900)
        if age == 6:
            # A genuine duplicate charge for the duplicate detector.
            amount = -1_249.0
            self._add(self._day(anchor, 18), f"UPI/{self._ref()}/SWIGGY FOOD ORDER/HDFC", amount)
            self._add(self._day(anchor, 18), f"UPI/{self._ref()}/SWIGGY FOOD ORDER/HDFC", amount)
        if age == 11 and rng.random() < 0.8:
            self._add(self._day(anchor, 20),
                      "NEFT DR-DR MEHTA MULTISPECIALITY-MEDICAL PROCEDURE", -72_000)
        if anchor.month == 10 and rng.random() < 0.85:
            self._add(self._day(anchor, 22),
                      f"POS {self._card()} TANISHQ JEWELLERY DIWALI", -rng.uniform(24_000, 52_000))
        if self.profile.pays_advance_tax and anchor.month in (3, 6, 9, 12):
            self._add(self._day(anchor, 14),
                      "NEFT DR-INCOME TAX DEPT-ADVANCE TAX INSTALMENT",
                      -rng.uniform(45_000, 85_000))

    def _apply_running_balance(self) -> None:
        balance = self.profile.opening_balance
        for row in self.rows:
            balance = round(balance + row["amount"], 2)
            row["balance"] = balance


# --------------------------------------------------------------------------
# Bank-specific writers
# --------------------------------------------------------------------------

def write_hdfc(rows: list[dict], path: Path, profile: Profile) -> None:
    """HDFC: metadata preamble, DD/MM/YY dates, separate withdrawal/deposit."""
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["HDFC BANK LTD"])
        w.writerow([f"Statement of account for {profile.name}"])
        w.writerow(["Account No", f"50100{random.Random(7).randint(1000000, 9999999)}"])
        w.writerow(["Account Type", "SAVINGS ACCOUNT"])
        w.writerow([])
        w.writerow(["Date", "Narration", "Chq./Ref.No.", "Value Dt",
                    "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"])
        for r in rows:
            d = r["date"].strftime("%d/%m/%y")
            debit = f"{-r['amount']:.2f}" if r["amount"] < 0 else ""
            credit = f"{r['amount']:.2f}" if r["amount"] > 0 else ""
            w.writerow([d, r["narration"], "", d, debit, credit, f"{r['balance']:.2f}"])


def write_icici(rows: list[dict], path: Path, profile: Profile) -> None:
    """ICICI: DD-MMM-YYYY dates, a Dr/Cr flag column, single amount column."""
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["Transaction Date", "Value Date", "Transaction Remarks",
                    "Cheque Number", "Type", "Transaction Amount", "Balance"])
        for r in rows:
            d = r["date"].strftime("%d-%b-%Y").upper()
            w.writerow([d, d, r["narration"], "",
                        "DR" if r["amount"] < 0 else "CR",
                        f"{abs(r['amount']):.2f}", f"{r['balance']:.2f}"])


def write_sbi(rows: list[dict], path: Path, profile: Profile) -> None:
    """SBI: tab-ish spacing, DD MMM YYYY dates, Debit/Credit columns."""
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["Account Name", profile.name.upper()])
        w.writerow(["Account Number", "_" * 6 + str(random.Random(3).randint(1000, 9999))])
        w.writerow([])
        w.writerow(["Txn Date", "Value Date", "Description", "Ref No./Cheque No.",
                    "Debit", "Credit", "Balance"])
        for r in rows:
            d = r["date"].strftime("%d %b %Y")
            debit = f"{-r['amount']:.2f}" if r["amount"] < 0 else ""
            credit = f"{r['amount']:.2f}" if r["amount"] > 0 else ""
            w.writerow([d, d, r["narration"], "", debit, credit, f"{r['balance']:.2f}"])


def write_generic(rows: list[dict], path: Path, profile: Profile) -> None:
    """The simplest shape a parser should handle: ISO dates, signed amount."""
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["Date", "Description", "Amount", "Balance"])
        for r in rows:
            w.writerow([r["date"].isoformat(), r["narration"],
                        f"{r['amount']:.2f}", f"{r['balance']:.2f}"])


WRITERS = {"hdfc": write_hdfc, "icici": write_icici, "sbi": write_sbi, "generic": write_generic}


def generate(profile_key: str, fmt: str, months: int, seed: int,
             out: Path, end: date | None = None) -> tuple[Path, int, float]:
    profile = PROFILES[profile_key]
    end = end or date.today()
    rows = StatementBuilder(profile, months, seed, end).build()
    out.parent.mkdir(parents=True, exist_ok=True)
    WRITERS[fmt](rows, out, profile)
    return out, len(rows), rows[-1]["balance"] if rows else 0.0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--profile", choices=sorted(PROFILES), default="salaried")
    parser.add_argument("--format", dest="fmt", choices=sorted(WRITERS), default="hdfc")
    parser.add_argument("--months", type=int, default=18)
    parser.add_argument("--seed", type=int, default=20260214)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--end", type=date.fromisoformat, default=None,
                        help="Last date to include (YYYY-MM-DD). Defaults to today.")
    parser.add_argument("--all", action="store_true",
                        help="Write one statement per profile into sample-statements/")
    args = parser.parse_args(argv)

    root = Path(__file__).resolve().parents[2]
    default_dir = root / "sample-statements"

    if args.all:
        combos = [("salaried", "hdfc", 18), ("freelancer", "icici", 15), ("family", "sbi", 24)]
        for offset, (profile_key, fmt, months) in enumerate(combos):
            out = default_dir / f"{profile_key}-{fmt}-{months}months.csv"
            # Offset the seed so the three statements don't share card numbers.
            path, count, balance = generate(profile_key, fmt, months,
                                            args.seed + offset * 977, out, args.end)
            print(f"{path.relative_to(root)}  {count:>5} transactions  closing balance {balance:,.2f}")
        return 0

    out = args.out or default_dir / f"{args.profile}-{args.fmt}-{args.months}months.csv"
    path, count, balance = generate(args.profile, args.fmt, args.months, args.seed, out, args.end)
    print(f"Wrote {path} — {count} transactions, closing balance {balance:,.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
