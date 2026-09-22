"""Local ML algorithms (no external API required).

- Recurring-payment detection: merchant-level periodicity + amount stability.
- Anomaly detection: per-category robust z-score (median/MAD) with an optional
  PyTorch autoencoder that is used automatically when torch is installed.
"""

import logging
from collections import defaultdict
from datetime import date

import numpy as np

logger = logging.getLogger("pfip.ml")

try:
    import torch
    import torch.nn as nn

    _TORCH_AVAILABLE = True
except ImportError:
    _TORCH_AVAILABLE = False


# ---------------- Recurring detection ----------------

def detect_recurring(transactions: list[dict]) -> set[int]:
    """Return indices of transactions that look like recurring payments.

    A merchant is recurring if it appears in >= 3 distinct months (or >= 3
    near-equal intervals) with a stable amount (coefficient of variation < 0.25).
    """
    groups: dict[str, list[int]] = defaultdict(list)
    for i, t in enumerate(transactions):
        if t["amount"] < 0 and t.get("merchant"):
            groups[t["merchant"].lower()].append(i)

    recurring: set[int] = set()
    for indices in groups.values():
        if len(indices) < 3:
            continue
        dates: list[date] = sorted(transactions[i]["date"] for i in indices)
        amounts = np.array([abs(transactions[i]["amount"]) for i in indices])
        months = {(d.year, d.month) for d in dates}
        gaps = np.diff([d.toordinal() for d in dates])
        periodic = len(months) >= 3 or (len(gaps) >= 2 and 20 <= float(np.median(gaps)) <= 40)
        mean = float(amounts.mean())
        stable = mean > 0 and float(amounts.std()) / mean < 0.25
        if periodic and stable:
            recurring.update(indices)
    return recurring


# ---------------- Anomaly detection ----------------

def _zscore_anomalies(transactions: list[dict], threshold: float = 3.5) -> set[int]:
    """Robust z-score (median + MAD) per category on expense magnitudes."""
    by_category: dict[str, list[int]] = defaultdict(list)
    for i, t in enumerate(transactions):
        if t["amount"] < 0:
            by_category[t.get("category", "Miscellaneous")].append(i)

    anomalies: set[int] = set()
    for indices in by_category.values():
        if len(indices) < 8:
            continue
        values = np.array([abs(transactions[i]["amount"]) for i in indices])
        median = np.median(values)
        mad = np.median(np.abs(values - median))
        if mad == 0:
            continue
        scores = 0.6745 * (values - median) / mad
        for idx, score in zip(indices, scores):
            if score > threshold:
                anomalies.add(idx)
    return anomalies


class _SpendAutoencoder(nn.Module if _TORCH_AVAILABLE else object):
    """Tiny autoencoder over (log-amount, day-of-month, weekday, category-freq).

    High reconstruction error => unusual transaction. Trained per user on the
    fly; datasets are small (hundreds of rows) so this runs in milliseconds.
    """

    def __init__(self):
        super().__init__()
        self.encoder = nn.Sequential(nn.Linear(4, 8), nn.ReLU(), nn.Linear(8, 2))
        self.decoder = nn.Sequential(nn.Linear(2, 8), nn.ReLU(), nn.Linear(8, 4))

    def forward(self, x):
        return self.decoder(self.encoder(x))


def _torch_anomalies(transactions: list[dict], quantile: float = 0.99) -> set[int]:
    expenses = [(i, t) for i, t in enumerate(transactions) if t["amount"] < 0]
    if len(expenses) < 40:
        return set()

    cat_counts: dict[str, int] = defaultdict(int)
    for _, t in expenses:
        cat_counts[t.get("category", "Miscellaneous")] += 1
    total = len(expenses)

    features = np.array([
        [
            np.log1p(abs(t["amount"])),
            t["date"].day / 31.0,
            t["date"].weekday() / 6.0,
            cat_counts[t.get("category", "Miscellaneous")] / total,
        ]
        for _, t in expenses
    ], dtype=np.float32)
    mean, std = features.mean(axis=0), features.std(axis=0) + 1e-6
    x = torch.tensor((features - mean) / std)

    model = _SpendAutoencoder()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    loss_fn = nn.MSELoss()
    model.train()
    for _ in range(120):
        optimizer.zero_grad()
        loss = loss_fn(model(x), x)
        loss.backward()
        optimizer.step()

    model.eval()
    with torch.no_grad():
        errors = ((model(x) - x) ** 2).mean(dim=1).numpy()
    cutoff = np.quantile(errors, quantile)
    return {expenses[i][0] for i in range(len(expenses)) if errors[i] > cutoff}


def detect_anomalies(transactions: list[dict]) -> set[int]:
    anomalies = _zscore_anomalies(transactions)
    if _TORCH_AVAILABLE:
        try:
            anomalies |= _torch_anomalies(transactions)
        except Exception as exc:
            logger.warning("Torch anomaly detector failed, using z-score only: %s", exc)
    return anomalies
