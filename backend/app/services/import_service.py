"""Statement import pipeline.

    parse -> fingerprint & dedupe -> apply user rules -> AI/keyword categorize
         -> merchant normalize -> local ML enrichment -> persist

Imports run on a worker thread with their own session and write their progress
back to the `Statement` row, so the client polls one endpoint and sees genuine
stage transitions instead of an animation pretending to be work. A 1,200-row
statement takes a few seconds locally and a good deal longer when Gemini is
categorizing, which is exactly why the progress has to be real.

Re-uploading an overlapping statement is normal — people export three months at
a time and the windows overlap. Fingerprinting makes that idempotent: rows
already on file are counted as duplicates and skipped, never double-counted.
"""

import hashlib
import logging
import re
import threading
from datetime import datetime

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Statement, Transaction
from app.services import categorizer, ml_local, rules_service
from app.services.parser import ParseError, detect_bank_name, parse_statement

logger = logging.getLogger("pfip.import")

_WHITESPACE = re.compile(r"\s+")


def fingerprint(user_id: int, when, description: str, amount: float) -> str:
    """Stable identity for a statement row.

    Deliberately excludes balance and reference numbers: the same transaction
    can appear with a different running balance in a re-exported statement, and
    reference numbers vary between a bank's CSV and PDF renderings of the same
    account.
    """
    normalized = _WHITESPACE.sub(" ", description.strip().upper())
    raw = f"{user_id}|{when.isoformat()}|{amount:.2f}|{normalized}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _set_stage(db: Session, statement: Statement, status: str, label: str, progress: int) -> None:
    statement.status = status
    statement.stage_label = label
    statement.progress = progress
    db.commit()


def create_pending(db: Session, user_id: int, filename: str, content: bytes) -> Statement:
    """Register the upload immediately so the client gets an id to poll."""
    statement = Statement(
        user_id=user_id,
        filename=filename,
        bank_name=detect_bank_name(content, filename),
        status="queued",
        stage_label="Queued",
        progress=2,
        file_size=len(content),
        checksum=hashlib.sha256(content).hexdigest()[:32],
    )
    db.add(statement)
    db.commit()
    db.refresh(statement)
    return statement


def find_duplicate_upload(db: Session, user_id: int, content: bytes) -> Statement | None:
    """Byte-identical file already imported? Then this is a misclick."""
    checksum = hashlib.sha256(content).hexdigest()[:32]
    return (db.query(Statement)
            .filter(Statement.user_id == user_id, Statement.checksum == checksum,
                    Statement.status == "processed")
            .first())


def process_async(statement_id: int, user_id: int, filename: str, content: bytes) -> None:
    """Kick off processing on a worker thread. Returns immediately."""
    thread = threading.Thread(
        target=_process_worker, args=(statement_id, user_id, filename, content),
        daemon=True, name=f"pfip-import-{statement_id}")
    thread.start()


def _process_worker(statement_id: int, user_id: int, filename: str, content: bytes) -> None:
    db = SessionLocal()
    try:
        statement = db.get(Statement, statement_id)
        if statement is None:
            return
        try:
            run_pipeline(db, user_id, statement, filename, content)
        except ParseError as exc:
            _fail(db, statement, str(exc))
        except Exception as exc:  # never leave a row stuck in "parsing"
            logger.exception("Import %s failed", statement_id)
            _fail(db, statement, f"Unexpected error while importing: {exc}")
    finally:
        db.close()


def _fail(db: Session, statement: Statement, message: str) -> None:
    statement.status = "failed"
    statement.stage_label = "Failed"
    statement.error_message = message[:900]
    statement.progress = 100
    db.commit()


def run_pipeline(db: Session, user_id: int, statement: Statement,
                 filename: str, content: bytes) -> Statement:
    _set_stage(db, statement, "parsing", "Reading the document", 8)
    rows = parse_statement(content, filename)
    if not rows:
        raise ParseError("No transactions found in this file.")

    _set_stage(db, statement, "parsing", f"Found {len(rows)} rows — checking for duplicates", 20)

    # Skip rows already on file, so overlapping exports are idempotent.
    seen = {f for (f,) in db.query(Transaction.fingerprint)
            .filter(Transaction.user_id == user_id).all()}
    fresh, duplicates = [], 0
    batch_seen: set[str] = set()
    for r in rows:
        fp = fingerprint(user_id, r["date"], r["description"], r["amount"])
        if fp in seen or fp in batch_seen:
            duplicates += 1
            continue
        batch_seen.add(fp)
        fresh.append({**r, "fingerprint": fp})

    statement.duplicate_count = duplicates
    statement.period_start = min(r["date"] for r in rows)
    statement.period_end = max(r["date"] for r in rows)
    db.commit()

    if not fresh:
        _set_stage(db, statement, "processed", "Already up to date", 100)
        statement.transaction_count = 0
        statement.processed_at = datetime.utcnow()
        db.commit()
        return statement

    # 1. User rules win outright.
    _set_stage(db, statement, "categorizing", "Applying your rules", 30)
    rules = rules_service.active_rules(db, user_id)
    for r in fresh:
        r["merchant"] = categorizer.normalize_merchant(r["description"])
        matched = rules_service.apply_rules(rules, r["description"], r["merchant"])
        if matched:
            r["category"] = matched.category
            r["category_source"] = "rule"
            matched.hits += 1

    # 2. Everything else goes to the AI / keyword engine.
    undecided = [r for r in fresh if "category" not in r]
    if undecided:
        label = ("Categorizing with Gemini" if categorizer.gemini_client.is_available()
                 else "Categorizing transactions")
        _set_stage(db, statement, "categorizing", label, 38)

        def on_batch(done: int, total: int) -> None:
            _set_stage(db, statement, "categorizing",
                       f"{label} ({done}/{total} batches)", 38 + int(32 * done / max(total, 1)))

        categories, sources, overall = categorizer.categorize_batch(
            [{"description": r["description"], "amount": r["amount"]} for r in undecided],
            progress=on_batch,
        )
        for r, category, source in zip(undecided, categories, sources):
            r["category"] = category
            r["category_source"] = source
        statement.categorization_source = overall
    else:
        statement.categorization_source = "rule"

    # 3. Local ML sees the user's whole history, so accuracy improves with use.
    _set_stage(db, statement, "enriching", "Detecting recurring payments & anomalies", 74)
    existing = (db.query(Transaction)
                .filter(Transaction.user_id == user_id)
                .order_by(Transaction.date, Transaction.id).all())
    combined = [
        {"date": t.date, "amount": t.amount, "merchant": t.merchant, "category": t.category}
        for t in existing
    ] + [
        {"date": r["date"], "amount": r["amount"], "merchant": r["merchant"], "category": r["category"]}
        for r in fresh
    ]
    recurring_idx = ml_local.detect_recurring(combined)
    anomaly_idx = ml_local.detect_anomalies(combined)
    offset = len(existing)

    for i, t in enumerate(existing):
        t.is_recurring = i in recurring_idx
        t.is_anomaly = i in anomaly_idx

    _set_stage(db, statement, "enriching", "Saving transactions", 88)
    db.add_all([
        Transaction(
            user_id=user_id,
            statement_id=statement.id,
            date=r["date"],
            description=r["description"],
            merchant=r["merchant"],
            amount=r["amount"],
            balance=r.get("balance"),
            category=r["category"],
            category_source=r.get("category_source", "local"),
            fingerprint=r["fingerprint"],
            is_recurring=(offset + i) in recurring_idx,
            is_anomaly=(offset + i) in anomaly_idx,
        )
        for i, r in enumerate(fresh)
    ])

    statement.transaction_count = len(fresh)
    statement.processed_at = datetime.utcnow()
    _set_stage(db, statement, "processed", "Done", 100)
    db.refresh(statement)
    return statement


def process_sync(db: Session, user_id: int, filename: str, content: bytes) -> Statement:
    """Synchronous import — used by tests and the CLI seeding path."""
    statement = create_pending(db, user_id, filename, content)
    try:
        return run_pipeline(db, user_id, statement, filename, content)
    except ParseError:
        db.delete(statement)
        db.commit()
        raise
