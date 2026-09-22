"""PDF report generation (ReportLab).

Produces the artefact people actually want to keep or send to an accountant: a
paginated, branded monthly or annual statement of where the money went.

ReportLab is an optional dependency. If it isn't installed the routers fall
back to JSON rather than 500-ing, so a slim deployment stays functional.
"""

from __future__ import annotations

import io
from datetime import date, datetime

try:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    )

    AVAILABLE = True
except ImportError:  # pragma: no cover - optional dependency
    AVAILABLE = False


INK = "#0E1524"
MINT = "#0EA97A"
ROSE = "#E11D48"
SLATE = "#64748B"
LIGHT = "#F1F5F9"


def _money(value: float, symbol: str = "₹") -> str:
    """Indian digit grouping (12,34,567) — the whole point of a localised report."""
    negative = value < 0
    whole = f"{abs(value):.0f}"
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        whole = ",".join(parts) + "," + tail
    return f"{'-' if negative else ''}{symbol}{whole}"


def _styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("t", parent=base["Title"], fontName="Helvetica-Bold",
                                fontSize=22, textColor=colors.HexColor(INK), spaceAfter=2,
                                alignment=0),
        "subtitle": ParagraphStyle("s", parent=base["Normal"], fontSize=10,
                                   textColor=colors.HexColor(SLATE), spaceAfter=16),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="Helvetica-Bold",
                             fontSize=12, textColor=colors.HexColor(INK),
                             spaceBefore=16, spaceAfter=8),
        "body": ParagraphStyle("b", parent=base["Normal"], fontSize=9.5,
                               textColor=colors.HexColor("#334155"), leading=14),
        "right": ParagraphStyle("r", parent=base["Normal"], fontSize=9.5, alignment=TA_RIGHT),
        "small": ParagraphStyle("sm", parent=base["Normal"], fontSize=8,
                                textColor=colors.HexColor(SLATE)),
    }


def _table_style(align_right_from: int = 1) -> TableStyle:
    return TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor(INK)),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(LIGHT)),
        ("ALIGN", (align_right_from, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, colors.HexColor("#CBD5E1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAFBFC")]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ])


def _kpi_row(items: list[tuple[str, str, str]]) -> Table:
    """A row of headline figures — label above value, coloured by tone."""
    cells = []
    for label, value, tone in items:
        colour = {"good": MINT, "bad": ROSE}.get(tone, INK)
        cells.append(Paragraph(
            f'<font size="8" color="{SLATE}">{label.upper()}</font><br/>'
            f'<font size="15" color="{colour}"><b>{value}</b></font>',
            getSampleStyleSheet()["Normal"]))
    table = Table([cells], colWidths=[43 * mm] * len(cells))
    table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ]))
    return table


def _doc(buffer: io.BytesIO, title: str, subtitle: str):
    doc = BaseDocTemplate(buffer, pagesize=A4, title=title, author="PFIP",
                          leftMargin=18 * mm, rightMargin=18 * mm,
                          topMargin=18 * mm, bottomMargin=18 * mm)
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="body")

    def decorate(canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(colors.HexColor(MINT))
        canvas.rect(0, A4[1] - 6, A4[0], 6, stroke=0, fill=1)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor(SLATE))
        canvas.drawString(18 * mm, 12 * mm, subtitle)
        canvas.drawRightString(A4[0] - 18 * mm, 12 * mm, f"Page {canvas.getPageNumber()}")
        canvas.restoreState()

    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=decorate)])
    return doc


def monthly_report(data: dict, *, user_name: str, month: str, currency: str = "₹") -> bytes:
    if not AVAILABLE:
        raise RuntimeError("reportlab is not installed")

    st = _styles()
    buffer = io.BytesIO()
    pretty = datetime.strptime(month, "%Y-%m").strftime("%B %Y")
    doc = _doc(buffer, f"PFIP monthly report — {pretty}",
               f"PFIP · {user_name} · generated {date.today():%d %b %Y}")

    s = data["summary"]
    prev = data["previous"]
    story = [
        Paragraph("Monthly financial report", st["title"]),
        Paragraph(f"{pretty} &nbsp;·&nbsp; {user_name}", st["subtitle"]),
        _kpi_row([
            ("Income", _money(s["income"], currency), "good"),
            ("Spending", _money(s["spend"], currency), "neutral"),
            ("Saved", _money(s["savings"], currency),
             "good" if s["savings"] >= 0 else "bad"),
            ("Savings rate", f"{s['savings_rate']:.0f}%",
             "good" if s["savings_rate"] >= 20 else "bad"),
        ]),
        Spacer(1, 4 * mm),
    ]

    delta = s["spend"] - prev.get("spend", 0)
    direction = "more" if delta > 0 else "less"
    story += [
        Paragraph(
            f"You spent {_money(abs(delta), currency)} {direction} than in "
            f"{prev['month']}, across {s['transaction_count']} transactions. "
            f"Recurring commitments accounted for "
            f"{_money(data['recurring_total'], currency)}.",
            st["body"]),
    ]

    story.append(Paragraph("Where it went", st["h2"]))
    rows = [["Category", "Amount", "Share", "vs last month"]]
    for c in data["categories"][:12]:
        change = "—" if c.get("change_pct") is None else f"{c['change_pct']:+.0f}%"
        rows.append([c["category"], _money(c["amount"], currency), f"{c['percent']:.0f}%", change])
    table = Table(rows, colWidths=[62 * mm, 34 * mm, 24 * mm, 34 * mm])
    table.setStyle(_table_style())
    story.append(table)

    if data["merchants"]:
        story.append(Paragraph("Top merchants", st["h2"]))
        rows = [["Merchant", "Category", "Visits", "Total"]]
        for m in data["merchants"][:10]:
            rows.append([m["merchant"][:34], m["category"], str(m["count"]),
                         _money(m["amount"], currency)])
        table = Table(rows, colWidths=[62 * mm, 44 * mm, 20 * mm, 28 * mm])
        table.setStyle(_table_style(2))
        story.append(table)

    if data["largest_expenses"]:
        story.append(Paragraph("Largest expenses", st["h2"]))
        rows = [["Date", "Description", "Category", "Amount"]]
        for t in data["largest_expenses"]:
            rows.append([t["date"], (t["merchant"] or t["description"])[:36],
                         t["category"], _money(abs(t["amount"]), currency)])
        table = Table(rows, colWidths=[24 * mm, 68 * mm, 34 * mm, 28 * mm])
        table.setStyle(_table_style(3))
        story.append(table)

    if data["anomalies"]:
        story.append(Paragraph("Flagged for review", st["h2"]))
        rows = [["Date", "Description", "Amount"]]
        for t in data["anomalies"][:8]:
            rows.append([t["date"], (t["merchant"] or t["description"])[:48],
                         _money(abs(t["amount"]), currency)])
        table = Table(rows, colWidths=[24 * mm, 102 * mm, 28 * mm])
        table.setStyle(_table_style(2))
        story.append(table)

    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(
        "Generated by PFIP from your imported bank statements. Figures exclude "
        "transactions you marked as excluded. Transfers between your own accounts "
        "and investments are counted as savings, not spending.", st["small"]))

    doc.build(story)
    return buffer.getvalue()


def yearly_report(data: dict, *, user_name: str, year: int, currency: str = "₹") -> bytes:
    if not AVAILABLE:
        raise RuntimeError("reportlab is not installed")

    st = _styles()
    buffer = io.BytesIO()
    doc = _doc(buffer, f"PFIP annual report — {year}",
               f"PFIP · {user_name} · generated {date.today():%d %b %Y}")

    s = data["summary"]
    yoy = data.get("yoy") or {}
    story = [
        Paragraph("Annual financial report", st["title"]),
        Paragraph(f"{year} &nbsp;·&nbsp; {user_name}", st["subtitle"]),
        _kpi_row([
            ("Income", _money(s["income"], currency), "good"),
            ("Spending", _money(s["spend"], currency), "neutral"),
            ("Saved", _money(s["savings"], currency),
             "good" if s["savings"] >= 0 else "bad"),
            ("Savings rate", f"{s['savings_rate']:.0f}%",
             "good" if s["savings_rate"] >= 20 else "bad"),
        ]),
        Spacer(1, 4 * mm),
    ]

    if yoy.get("income_growth_pct") is not None:
        story.append(Paragraph(
            f"Income moved {yoy['income_growth_pct']:+.1f}% and spending "
            f"{yoy.get('expense_growth_pct') or 0:+.1f}% versus {year - 1}.", st["body"]))

    story.append(Paragraph("Month by month", st["h2"]))
    rows = [["Month", "Income", "Spending", "Saved", "Rate"]]
    for m in data["months"]:
        rate = (m["savings"] / m["income"] * 100) if m["income"] else 0
        rows.append([m["month"], _money(m["income"], currency), _money(m["spend"], currency),
                     _money(m["savings"], currency), f"{rate:.0f}%"])
    table = Table(rows, colWidths=[30 * mm, 32 * mm, 32 * mm, 32 * mm, 22 * mm])
    table.setStyle(_table_style())
    story.append(table)

    story.append(Paragraph("Category totals", st["h2"]))
    rows = [["Category", "Amount", "Share", "Transactions"]]
    for c in data["categories"][:16]:
        rows.append([c["category"], _money(c["amount"], currency),
                     f"{c['percent']:.0f}%", str(c["count"])])
    table = Table(rows, colWidths=[62 * mm, 36 * mm, 24 * mm, 32 * mm])
    table.setStyle(_table_style())
    story.append(table)

    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph(
        "Generated by PFIP from your imported bank statements.", st["small"]))

    doc.build(story)
    return buffer.getvalue()
