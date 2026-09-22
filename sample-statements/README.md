# Sample bank statements

Real-shaped statement exports for exercising PFIP end to end. They are
**generated**, not captured from anyone's account — but they are generated from
a behavioural model rather than a random number generator, so the analytics,
recurring detection, anomaly model and forecast all have something true to
work on.

| File | Format | Span | Persona |
|---|---|---|---|
| `salaried-hdfc-18months.csv` | HDFC (metadata preamble, `DD/MM/YY`, split debit/credit) | 18 months | Salaried professional, home loan, monthly SIP |
| `freelancer-icici-15months.csv` | ICICI (`DD-MMM-YYYY`, `Dr`/`Cr` flag, single amount) | 15 months | Independent consultant, lumpy income, advance tax |
| `family-sbi-24months.csv` | SBI (`DD MMM YYYY`, split debit/credit) | 24 months | Dual income, childcare, school fees |

Upload any of them from the **Import** page. Each is a different CSV dialect on
purpose: between them they cover every column-detection branch the parser has.

## What's modelled

- Salary or client invoices on a realistic cadence, including a mid-window raise
- Fixed obligations on fixed days — rent, EMI, SIP, utilities, insurance
- Subscriptions on their own renewal cadence, some of which **raise their price**
  partway through (the price-hike detector has something to find)
- Weekday/weekend rhythm in food and grocery spending
- Seasonal peaks around Diwali and the summer travel months
- One genuine **duplicate charge**, a few large **one-off purchases**, and
  small bank fees — the anomaly and duplicate detectors have real targets
- Month-end sweeps to a savings account, so `Transfers` is exercised and kept
  out of the spending figures

## Regenerating

```bash
python backend/scripts/generate_statement.py --all
python backend/scripts/generate_statement.py --profile family --format icici --months 36
```

`--end YYYY-MM-DD` pins the last date if you need a fixed window; the default
runs up to today so uploaded data always looks current.
