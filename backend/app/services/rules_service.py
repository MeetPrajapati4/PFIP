"""User-defined categorization rules.

Precedence during import: user rule > AI > keyword engine. A rule is the user
saying "I know better than the model about this merchant", so nothing should
be able to overrule it — including a later re-import.

Rules are also created implicitly: when someone recategorizes a transaction and
opts to apply it going forward, `learn_from_correction` writes a rule from the
merchant name. That's how the system gets more accurate the longer it's used.
"""

import logging
import re

from sqlalchemy.orm import Session

from app.models import CategoryRule, Transaction

logger = logging.getLogger("pfip.rules")

MAX_RULES_PER_USER = 200


def _matches(rule: CategoryRule, text: str) -> bool:
    pattern = rule.pattern.lower()
    haystack = text.lower()
    if rule.match_type == "equals":
        return haystack.strip() == pattern.strip()
    if rule.match_type == "regex":
        try:
            return re.search(rule.pattern, text, re.IGNORECASE) is not None
        except re.error:
            return False
    return pattern in haystack


def active_rules(db: Session, user_id: int) -> list[CategoryRule]:
    return (db.query(CategoryRule)
            .filter(CategoryRule.user_id == user_id, CategoryRule.is_active.is_(True))
            .order_by(CategoryRule.priority, CategoryRule.id).all())


def apply_rules(rules: list[CategoryRule], description: str, merchant: str = "") -> CategoryRule | None:
    """First matching rule wins; rules are pre-sorted by priority."""
    haystack = f"{description} {merchant or ''}".strip()
    for rule in rules:
        if _matches(rule, haystack):
            return rule
    return None


def backfill(db: Session, user_id: int, rule: CategoryRule) -> int:
    """Apply a newly created rule to existing history.

    A rule the user just wrote should fix the transactions that prompted it —
    otherwise they'd have to edit each one by hand anyway. Manual edits made
    earlier are left alone; those are a stronger signal than a broad pattern.
    """
    txns = (db.query(Transaction)
            .filter(Transaction.user_id == user_id,
                    Transaction.category_source != "manual")
            .all())
    changed = 0
    for t in txns:
        if t.category == rule.category:
            continue
        if _matches(rule, f"{t.description} {t.merchant or ''}".strip()):
            t.category = rule.category
            t.category_source = "rule"
            changed += 1
    if changed:
        rule.hits += changed
        db.commit()
    return changed


def learn_from_correction(db: Session, user_id: int, txn: Transaction, category: str) -> CategoryRule | None:
    """Turn a manual recategorization into a reusable rule."""
    pattern = (txn.merchant or txn.description).strip()
    if len(pattern) < 3:
        return None
    if db.query(CategoryRule).filter(CategoryRule.user_id == user_id).count() >= MAX_RULES_PER_USER:
        logger.info("Rule limit reached for user %s", user_id)
        return None

    existing = (db.query(CategoryRule)
                .filter(CategoryRule.user_id == user_id, CategoryRule.pattern == pattern)
                .first())
    if existing:
        existing.category = category
        existing.is_active = True
        db.commit()
        return existing

    rule = CategoryRule(user_id=user_id, match_type="contains", pattern=pattern,
                        category=category, priority=50)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule
