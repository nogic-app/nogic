"""Structured memo sections and plant tables for ReportLab exports."""

from __future__ import annotations

import re
from typing import Any, Callable

from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, Spacer, Table, TableStyle

from memo_content import (
    EMPTY_SECTION,
    legal_constraint_items,
    memo_sections,
    plant_table_items,
    source_items,
)

RULE = colors.HexColor("#E5E3DD")
ACCENT_SUBTLE = colors.HexColor("#E8EDE7")
_ARABIC_CHARACTERS = (
    r"\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff"
)
_ARABIC_RUN = re.compile(
    rf"[{_ARABIC_CHARACTERS}]+(?:\s+[{_ARABIC_CHARACTERS}]+)*"
)
ParagraphFactory = Callable[[str, Any], Paragraph]


def _legal_paragraph(
    text: str,
    style: Any,
    fix_arabic: Callable[[str], str],
) -> Paragraph:
    parts: list[str] = []
    start = 0
    for match in _ARABIC_RUN.finditer(text):
        parts.append(escape(text[start:match.start()]))
        parts.append(escape(fix_arabic(match.group())))
        start = match.end()
    parts.append(escape(text[start:]))
    return Paragraph(
        "".join(parts),
        style.clone("LegalConstraintLeft", alignment=TA_LEFT),
    )


def append_sources(
    story: list[Any],
    messages: list[dict[str, Any]],
    styles: dict[str, Any],
    paragraph: ParagraphFactory,
) -> None:
    story.extend([
        PageBreak(),
        paragraph("Sources", styles["title"]),
        paragraph(
            "Every source cited in this chat, in order of first use.",
            styles["meta"],
        ),
    ])
    sources = source_items(messages)
    if not sources:
        story.append(paragraph(EMPTY_SECTION, styles["empty"]))
        return
    for index, (label, details) in enumerate(sources, start=1):
        story.append(paragraph(f"[{index}] {escape(label)}", styles["source_lead"]))
        detail = details[0] if details else "Source details unavailable."
        story.append(paragraph(escape(detail), styles["source_detail"]))


def append_plant_table(
    story: list[Any],
    messages: list[dict[str, Any]],
    styles: dict[str, Any],
    paragraph: ParagraphFactory,
) -> None:
    rows = [[
        paragraph(label, styles["table_header"])
        for label in ("Latin name", "Common name", "Water", "Sun", "Source")
    ]]
    for plant in plant_table_items(messages):
        rows.append([paragraph(value, styles["table"]) for value in plant])
    if len(rows) == 1:
        story.append(paragraph(EMPTY_SECTION, styles["empty"]))
        return
    table = Table(
        rows,
        colWidths=(44 * mm, 31 * mm, 21 * mm, 21 * mm, 41 * mm),
        repeatRows=1,
        hAlign="LEFT",
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT_SUBTLE),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, RULE),
        ("LINEBELOW", (0, 1), (-1, -1), 0.35, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(table)


def append_memo_sections(
    story: list[Any],
    messages: list[dict[str, Any]],
    styles: dict[str, Any],
    paragraph: ParagraphFactory,
    clean_markdown: Callable[[str], str],
    fix_arabic: Callable[[str], str],
) -> None:
    for heading, items in memo_sections(messages):
        story.append(paragraph(heading, styles["section"]))
        if heading == "Legal Constraints":
            legal_items = legal_constraint_items(messages)
            if not legal_items:
                story.append(paragraph(EMPTY_SECTION, styles["empty"]))
                continue
            rows = [
                [
                    _legal_paragraph(law, styles["legal"], fix_arabic),
                    paragraph(jurisdiction, styles["legal"]),
                ]
                for law, jurisdiction in legal_items
            ]
            table = Table(
                rows,
                colWidths=(124 * mm, 42 * mm),
                hAlign="LEFT",
            )
            table.setStyle(TableStyle([
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -1), 0.35, RULE),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            story.append(table)
        elif heading == "Plant Palette":
            append_plant_table(story, messages, styles, paragraph)
        elif not items:
            story.append(paragraph(EMPTY_SECTION, styles["empty"]))
        else:
            for lines in items:
                for index, line in enumerate(lines):
                    style = styles["lead"] if index == 0 else styles["detail"]
                    story.append(paragraph(clean_markdown(line), style))
                story.append(Spacer(1, 6))
