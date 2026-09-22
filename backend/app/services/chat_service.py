"""AI Financial Assistant.

Retrieval pipeline:

  1. Read intent signals off the query — category, merchant, month, metric.
  2. Retrieve grounding deterministically from SQL: aggregate stats plus the
     most relevant individual transactions. The model never gets to invent a
     number; it only gets to phrase one.
  3. Stream the answer from Gemini with that context and the recent history.
  4. Fall back to a deterministic answer built from the analytics engine when
     no API key is configured or the call fails.

Every answer records what it was grounded in, which the UI renders as chips
under the reply. An assistant that talks about your money without showing its
sources is worth less than a spreadsheet.
"""

import json
import logging
import re
from datetime import date

from sqlalchemy.orm import Session

from app.models import ChatMessage, Transaction
from app.services import gemini_client
from app.services.analytics import spending_stats
from app.services.budget_service import evaluate as evaluate_budgets
from app.services.categorizer import CATEGORIES
from app.services.forecast_service import forecast, subscriptions
from app.services.health_score import compute as compute_health

logger = logging.getLogger("pfip.chat")

_MONTH_NAMES = {name.lower(): i + 1 for i, name in enumerate(
    ["January", "February", "March", "April", "May", "June", "July",
     "August", "September", "October", "November", "December"])}
_MONTH_ABBR = {k[:3]: v for k, v in _MONTH_NAMES.items()}

SUGGESTIONS = [
    "How much did I spend on food last month?",
    "What are my top 5 merchants this year?",
    "Which subscriptions should I cancel?",
    "Can I afford a ₹80,000 purchase this month?",
    "Why did my expenses go up recently?",
    "How is my financial health score calculated?",
]

_SYSTEM = (
    "You are PFIP's financial assistant. Answer ONLY from the retrieved data provided; "
    "if the data doesn't contain the answer, say so plainly and name what's missing. "
    "Be concise (under 130 words), cite specific numbers, and give one concrete next "
    "action when it's warranted. Write amounts as plain numbers with the currency the "
    "user's data uses. Never invent a transaction, merchant, or date. Use short "
    "markdown — bold for figures, a bullet list when comparing three or more things."
)

_STOPWORDS = {"much", "what", "when", "spend", "spent", "money", "this", "last", "have",
              "about", "show", "tell", "many", "does", "should", "could", "would", "from"}


def _extract_filters(message: str) -> dict:
    text = message.lower()
    filters: dict = {}

    for cat in CATEGORIES:
        head = cat.lower().split(" & ")[0]
        if cat.lower() in text or head in text.split():
            filters["category"] = cat
            break
    if "food" in text and "category" not in filters:
        filters["category"] = "Food & Dining"

    year_match = re.search(r"\b(20\d{2})\b", text)
    if year_match:
        filters["year"] = int(year_match.group(1))
    for name, num in {**_MONTH_NAMES, **_MONTH_ABBR}.items():
        if re.search(rf"\b{name}\b", text):
            filters["month_num"] = num
            break
    return filters


def _relevant_transactions(db: Session, user_id: int, message: str, limit: int = 25) -> list[dict]:
    filters = _extract_filters(message)
    q = (db.query(Transaction)
         .filter(Transaction.user_id == user_id, Transaction.is_excluded.is_(False)))
    if "category" in filters:
        q = q.filter(Transaction.category == filters["category"])
    if "year" in filters:
        q = q.filter(Transaction.date >= date(filters["year"], 1, 1),
                     Transaction.date < date(filters["year"] + 1, 1, 1))
    txns = q.order_by(Transaction.date.desc()).limit(250).all()
    if "month_num" in filters:
        txns = [t for t in txns if t.date.month == filters["month_num"]]

    words = [w for w in re.findall(r"[a-z]{4,}", message.lower()) if w not in _STOPWORDS]
    if words:
        txns = sorted(txns, key=lambda t: -sum(
            1 for w in words if w in t.description.lower() or (t.merchant and w in t.merchant.lower())))
    return [
        {"date": t.date.isoformat(), "merchant": t.merchant, "description": t.description[:80],
         "amount": t.amount, "category": t.category, "recurring": t.is_recurring}
        for t in txns[:limit]
    ]


def build_context(db: Session, user_id: int, message: str) -> tuple[dict, list[str]]:
    """Retrieve grounding data plus the human-readable labels for it."""
    text = message.lower()
    stats = spending_stats(db, user_id)
    relevant = _relevant_transactions(db, user_id, message)
    health = compute_health(db, user_id)

    context = {
        "period_covered": stats["period"],
        "summary": stats["summary"],
        "monthly_series": stats["months"][-12:],
        "top_categories": stats["categories"][:10],
        "top_merchants": stats["merchants"][:10],
        "health_score": {"score": health["score"], "grade": health["grade"]},
        "relevant_transactions": relevant,
    }
    sources = ["Summary", "12-month trend", "Categories", f"{len(relevant)} transactions"]

    # Pull in the expensive extras only when the question actually needs them.
    if re.search(r"subscription|recurring|cancel|renew", text):
        subs = subscriptions(db, user_id)
        context["subscriptions"] = subs["items"][:20]
        context["subscription_totals"] = subs["totals"]
        sources.append("Subscriptions")
    if re.search(r"afford|forecast|predict|will i|runway|next month|safe to spend", text):
        fc = forecast(db, user_id, horizon_days=60)
        if not fc.get("empty"):
            context["forecast"] = fc["summary"]
            context["upcoming_scheduled"] = fc["scheduled"][:12]
            sources.append("60-day forecast")
    if re.search(r"budget", text):
        from app.services.analytics import latest_month

        month = latest_month(db, user_id)
        if month:
            context["budgets"] = evaluate_budgets(db, user_id, month)
            sources.append("Budgets")

    return context, sources


def _build_prompt(db: Session, user_id: int, message: str, context: dict) -> str:
    history = (db.query(ChatMessage)
               .filter(ChatMessage.user_id == user_id)
               .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
               .limit(9).all())
    # history[0] is the message we just stored — skip it.
    recent = "\n".join(f"{m.role}: {m.content[:300]}" for m in reversed(history[1:]))
    return (
        "USER FINANCIAL DATA (retrieved from their records — treat as ground truth):\n"
        f"{json.dumps(context, default=str)}\n\n"
        f"RECENT CONVERSATION:\n{recent or '(none)'}\n\n"
        f"USER QUESTION: {message}"
    )


def offline_answer(db: Session, user_id: int, message: str) -> str:
    """Deterministic answers when Gemini isn't available.

    These cover the question shapes people actually ask most, so the product is
    genuinely useful with no API key rather than degrading to an error message.
    """
    stats = spending_stats(db, user_id)
    text = message.lower()
    filters = _extract_filters(message)
    s = stats["summary"]

    if s["transaction_count"] == 0:
        return ("I don't have any transactions yet. Import a bank statement (PDF or CSV) "
                "from the Import page and I'll analyse it straight away.")

    if re.search(r"subscription|recurring|cancel", text):
        subs = subscriptions(db, user_id)
        if not subs["items"]:
            return ("No recurring payments detected yet — they show up once a merchant "
                    "repeats on a stable cadence for three or more cycles.")
        t = subs["totals"]
        cancellable = [i for i in subs["items"]
                       if i["kind"] == "subscription" and i["status"] == "active"][:5]
        listing = "; ".join(f"{i['merchant']} ({i['amount']:,.0f} {i['cadence']})"
                            for i in cancellable) or "none"
        return (f"Of {t['count']} recurring payments totalling {t['monthly']:,.0f}/month, "
                f"{t['obligations_monthly']:,.0f} is fixed obligations (rent, EMI, insurance) "
                f"and {t['bills_monthly']:,.0f} is utilities — neither is really cancellable. "
                f"The {t['subscription_count']} discretionary subscriptions cost "
                f"{t['subscriptions_monthly']:,.0f}/month "
                f"({t['subscriptions_monthly'] * 12:,.0f}/year): {listing}. That's where to look.")

    if re.search(r"afford|forecast|runway|safe to spend", text):
        fc = forecast(db, user_id, horizon_days=60)
        if not fc.get("empty"):
            summary = fc["summary"]
            return (f"Over the next 60 days I project {summary['scheduled_in']:,.0f} in and "
                    f"{summary['scheduled_out']:,.0f} of scheduled payments out, plus about "
                    f"{summary['daily_variable']:,.0f}/day of variable spending. Your balance "
                    f"bottoms out at {summary['low_point']['balance']:,.0f} around "
                    f"{summary['low_point']['date']}, so roughly "
                    f"{summary['safe_to_spend']:,.0f} is free to commit.")

    if "category" in filters:
        cat = filters["category"]
        row = next((c for c in stats["categories"] if c["category"] == cat), None)
        if row:
            return (f"You've spent {row['amount']:,.0f} on {cat} across {row['count']} "
                    f"transactions — {row['percent']}% of your total spending.")
        return f"I couldn't find any {cat} spending in your records."

    if re.search(r"health|score", text):
        health = compute_health(db, user_id)
        if health["score"] is not None:
            applied = [c for c in health["components"] if c["applies"]]
            if applied:
                weakest = min(applied, key=lambda c: c["score"])
                return (f"Your financial health score is {health['score']}/100 (grade "
                        f"{health['grade']}). It weighs savings rate, income stability, spending "
                        f"consistency, cash flow, emergency buffer, recurring load, investing "
                        f"habit and budget adherence. Weakest component: {weakest['label']} at "
                        f"{weakest['score']}/100 — {weakest['advice']}")
            return (f"Your financial health score is {health['score']}/100 (grade "
                    f"{health['grade']}).")

    if re.search(r"save|saving", text):
        return (f"Income {s['income']:,.0f} minus spending {s['spend']:,.0f} = "
                f"{s['savings']:,.0f} saved, a {s['savings_rate']}% savings rate. "
                f"Of that, {s['invested']:,.0f} went into investments.")

    if re.search(r"merchant|where|who", text):
        top = stats["merchants"][:5]
        listing = "; ".join(f"{m['merchant']} ({m['amount']:,.0f})" for m in top)
        return f"Your top merchants by spend: {listing}."

    return (f"Across {s['transaction_count']} transactions: income {s['income']:,.0f}, "
            f"spending {s['spend']:,.0f}, saved {s['savings']:,.0f} ({s['savings_rate']}%). "
            f"Ask me about a category, merchant, month, your subscriptions, your forecast "
            f"or your health score. (Add a GEMINI_API_KEY to unlock full conversational "
            f"answers.)")


def record_user_message(db: Session, user_id: int, message: str) -> ChatMessage:
    row = ChatMessage(user_id=user_id, role="user", content=message)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def record_assistant_message(db: Session, user_id: int, content: str,
                             sources: list[str]) -> ChatMessage:
    row = ChatMessage(user_id=user_id, role="assistant", content=content,
                      grounding=json.dumps(sources))
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def answer(db: Session, user_id: int, message: str) -> ChatMessage:
    """Non-streaming path — used by the plain POST endpoint."""
    record_user_message(db, user_id, message)
    context, sources = build_context(db, user_id, message)

    reply = None
    if gemini_client.is_available():
        reply = gemini_client.generate(
            _build_prompt(db, user_id, message, context), system=_SYSTEM, temperature=0.3)
    if not reply:
        reply = offline_answer(db, user_id, message)
        sources = ["Local analytics engine"]

    return record_assistant_message(db, user_id, reply, sources)


def stream_answer(db: Session, user_id: int, message: str):
    """Yield `(event, payload)` tuples for the SSE endpoint."""
    record_user_message(db, user_id, message)
    context, sources = build_context(db, user_id, message)
    yield "sources", {"sources": sources}

    chunks: list[str] = []
    if gemini_client.is_available():
        prompt = _build_prompt(db, user_id, message, context)
        for chunk in gemini_client.generate_stream(prompt, system=_SYSTEM, temperature=0.3):
            chunks.append(chunk)
            yield "delta", {"text": chunk}

    if not chunks:
        # Either offline or the stream died — deliver the deterministic answer.
        reply = offline_answer(db, user_id, message)
        sources = ["Local analytics engine"]
        yield "sources", {"sources": sources}
        yield "delta", {"text": reply}
    else:
        reply = "".join(chunks)

    row = record_assistant_message(db, user_id, reply, sources)
    yield "done", {"id": row.id, "created_at": row.created_at.isoformat(), "sources": sources}
