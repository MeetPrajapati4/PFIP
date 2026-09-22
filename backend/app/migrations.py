"""Additive schema migrations for SQLite.

The MVP ships on SQLite and the schema only ever grows (new columns, new
tables), so a full migration tool would be more machinery than the project
earns. This module reconciles the live database against the ORM metadata at
startup: `create_all` handles new tables, and `_add_missing_columns` issues
`ALTER TABLE ... ADD COLUMN` for anything the ORM knows about but the file
doesn't. Both are idempotent.

Moving to Postgres later means swapping this for Alembic — the models are the
source of truth either way.
"""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.database import Base

logger = logging.getLogger("pfip.migrations")


def _sql_type(column, dialect) -> str:
    try:
        return column.type.compile(dialect=dialect)
    except Exception:
        name = column.type.__class__.__name__.upper()
        return {
            "STRING": "VARCHAR",
            "TEXT": "TEXT",
            "INTEGER": "INTEGER",
            "FLOAT": "FLOAT",
            "BOOLEAN": "BOOLEAN",
            "DATE": "DATE",
            "DATETIME": "DATETIME",
        }.get(name, "VARCHAR")


def _default_clause(column) -> str:
    """Render a literal DEFAULT for the ALTER statement.

    SQLite requires a constant default when adding a NOT NULL column, so
    python-side callables (e.g. `datetime.utcnow`) fall back to a nullable
    column — the ORM fills the value on the next write either way.
    """
    default = column.default
    if default is None or default.is_callable or not default.is_scalar:
        return ""
    value = default.arg
    if isinstance(value, bool):
        return f" DEFAULT {1 if value else 0}"
    if isinstance(value, (int, float)):
        return f" DEFAULT {value}"
    if isinstance(value, str):
        escaped = value.replace("'", "''")
        return f" DEFAULT '{escaped}'"
    return ""


def _add_missing_columns(engine: Engine) -> list[str]:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    applied: list[str] = []

    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue  # create_all just made it — nothing to reconcile
            present = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in present:
                    continue
                ddl = f"ALTER TABLE {table.name} ADD COLUMN {column.name} {_sql_type(column, engine.dialect)}"
                ddl += _default_clause(column)
                conn.execute(text(ddl))
                applied.append(f"{table.name}.{column.name}")
    return applied


def _create_indexes(engine: Engine) -> None:
    """Create any ORM-declared indexes missing from an already-existing table."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        present = {idx["name"] for idx in inspector.get_indexes(table.name)}
        for index in table.indexes:
            if index.name in present:
                continue
            try:
                index.create(bind=engine)
            except Exception as exc:  # a partially-created index, or a race
                logger.debug("Skipped index %s: %s", index.name, exc)


def run(engine: Engine) -> None:
    Base.metadata.create_all(bind=engine)
    try:
        applied = _add_missing_columns(engine)
        _create_indexes(engine)
    except Exception as exc:
        logger.error("Schema reconciliation failed: %s", exc)
        return
    if applied:
        logger.info("Schema updated: added %s", ", ".join(applied))
