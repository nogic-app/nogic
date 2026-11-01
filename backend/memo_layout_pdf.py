"""ReportLab renderer for chat exports and structured memo sections."""

from __future__ import annotations

import re
import sys
from datetime import date
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from markdown_clean import clean_markdown
from memo_content import chat_message_items, file_items
from memo_export_assets import app_icon_path, user_initials
from memo_pdf_components import NumberedCanvas, draw_footer, message_table
from memo_pdf_sections import append_memo_sections, append_sources

INK = colors.HexColor("#1F1F1D")
BODY = colors.HexColor("#2B2B28")
SECONDARY = colors.HexColor("#6B6B66")
ACCENT = colors.HexColor("#4A6B4E")
_ARABIC = re.compile(r"[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]")
_MARKUP = re.compile(r"(<[^>]+>)")


def _font_path() -> Path:
    candidates = [
        Path(__file__).resolve().parent / "data" / "fonts" / "Amiri-Regular.ttf"
    ]
    bundle_root = getattr(sys, "_MEIPASS", None)
    if bundle_root:
        candidates.insert(0, Path(bundle_root) / "data" / "fonts" / "Amiri-Regular.ttf")
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError("The bundled Amiri Unicode font was not found.")


if "Amiri" not in pdfmetrics.getRegisteredFontNames():
    pdfmetrics.registerFont(TTFont("Amiri", str(_font_path())))


def fix_arabic(text: str) -> str:
    """Shape Arabic glyphs and order right-to-left text for ReportLab."""
    if not _ARABIC.search(text):
        return text
    parts = _MARKUP.split(text)
    return "".join(
        part
        if part.startswith("<") and part.endswith(">")
        else get_display(arabic_reshaper.reshape(part))
        for part in parts
    )


def _pdf_style(
    name: str,
    size: float,
    leading: float,
    color: Any,
    *,
    space_before: float = 0,
    space_after: float = 0,
    left_indent: float = 0,
) -> ParagraphStyle:
    return ParagraphStyle(
        name,
        parent=getSampleStyleSheet()["Normal"],
        fontName="Amiri",
        fontSize=size,
        leading=leading,
        textColor=color,
        spaceBefore=space_before,
        spaceAfter=space_after,
        leftIndent=left_indent,
    )


def _pdf_styles() -> dict[str, ParagraphStyle]:
    return {
        "wordmark": _pdf_style("NogicWordmark", 16, 20, ACCENT),
        "title": _pdf_style("ChatTitle", 25, 30, INK, space_after=5),
        "meta": _pdf_style("ChatMeta", 9, 13, SECONDARY, space_after=10),
        "section": _pdf_style(
            "MemoSection", 12, 15, ACCENT, space_before=14, space_after=5
        ),
        "body": _pdf_style("MessageBody", 9.5, 13, BODY),
        "message_meta": _pdf_style(
            "MessageMeta", 8, 10, SECONDARY, space_after=3
        ),
        "lead": _pdf_style("MemoLead", 10.5, 14, INK, space_after=1),
        "detail": _pdf_style(
            "MemoDetail", 9.5, 13, BODY, space_after=1, left_indent=12
        ),
        "legal": _pdf_style("LegalConstraint", 9.5, 13, BODY),
        "source_lead": _pdf_style(
            "SourceLead", 10.5, 14, INK, space_after=2
        ),
        "source_detail": _pdf_style(
            "SourceDetail", 9.5, 13, BODY, space_after=12, left_indent=12
        ),
        "empty": _pdf_style("MemoEmpty", 9.5, 13, SECONDARY, space_after=1),
        "table": _pdf_style("PlantTable", 8, 10, BODY),
        "table_header": _pdf_style("PlantTableHeader", 8, 10, ACCENT),
    }


def _paragraph(
    text: str,
    style: ParagraphStyle,
    *,
    alignment: int | None = None,
) -> Paragraph:
    alignment = (
        alignment
        if alignment is not None
        else TA_RIGHT if _ARABIC.search(text) else style.alignment
    )
    actual_style = ParagraphStyle(
        f"{style.name}Arabic" if alignment == TA_RIGHT else style.name,
        parent=style,
        alignment=alignment,
    )
    return Paragraph(fix_arabic(text), actual_style)


def _append_header(
    story: list[Any],
    title: str,
    model_name: str,
    message_count: int,
    current_date: str,
    styles: dict[str, ParagraphStyle],
) -> None:
    header = Table(
        [[
            _paragraph("Nogic", styles["wordmark"]),
            _paragraph("Chat export", styles["meta"]),
        ]],
        colWidths=(83 * mm, 83 * mm),
    )
    header.setStyle(
        TableStyle([
            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ])
    )
    story.extend([
        header,
        _paragraph(escape(title or "Chat"), styles["title"]),
        _paragraph(
            escape(
                f"Exported {current_date} · {message_count} messages · "
                f"Model {model_name}"
            ),
            styles["meta"],
        ),
    ])


def _append_conversation(
    story: list[Any],
    messages: list[dict[str, Any]],
    styles: dict[str, ParagraphStyle],
    user_name: str,
    icon_path: Path,
) -> None:
    for message in chat_message_items(messages):
        alignment = TA_RIGHT if message["role"] == "user" else TA_LEFT
        body = _paragraph(
            clean_markdown(message["content"]),
            styles["body"],
            alignment=alignment,
        )
        speaker = "You" if message["role"] == "user" else "Nogic"
        timestamp = message["timestamp"]
        header_text = f"{speaker} · {timestamp}" if timestamp else speaker
        story.append(
            message_table(
                _paragraph(
                    escape(header_text),
                    styles["message_meta"],
                    alignment=alignment,
                ),
                body,
                message["role"],
                user_initials(user_name),
                icon_path,
            )
        )
        story.append(Spacer(1, 12))


def _append_files(story: list[Any], messages: list[dict[str, Any]], styles: dict[str, ParagraphStyle]) -> None:
    files = file_items(messages)
    if not files:
        return
    story.append(PageBreak())
    story.append(_paragraph("Files shared in this chat", styles["section"]))
    for name, file_type, size in files:
        story.append(_paragraph(escape(f"{name} · {file_type} · {size}"), styles["body"]))


def render_pdf(
    title: str,
    messages: list[dict[str, Any]],
    path: str,
    model_name: str,
    user_name: str = "",
) -> None:
    """Render the chat and its memo references to a paginated PDF."""
    current_date = date.today().strftime("%B %d, %Y").replace(" 0", " ")
    styles = _pdf_styles()
    document = SimpleDocTemplate(
        path,
        pagesize=A4,
        leftMargin=22 * mm,
        rightMargin=22 * mm,
        topMargin=17 * mm,
        bottomMargin=20 * mm,
        title=f"Nogic Chat Export - {title}",
        author="Nogic",
    )
    story: list[Any] = []
    _append_header(
        story, title, model_name, len(chat_message_items(messages)), current_date, styles
    )
    _append_conversation(story, messages, styles, user_name, app_icon_path())
    _append_files(story, messages, styles)
    append_memo_sections(
        story, messages, styles, _paragraph, clean_markdown, fix_arabic
    )
    append_sources(story, messages, styles, _paragraph)
    on_page = draw_footer(current_date)
    document.build(
        story,
        onFirstPage=on_page,
        onLaterPages=on_page,
        canvasmaker=NumberedCanvas,
    )
