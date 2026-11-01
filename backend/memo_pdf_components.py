"""Reusable ReportLab components for chat-style memo pages."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from reportlab.graphics.shapes import Circle, Drawing, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Image, Paragraph, Table, TableStyle

ACCENT = colors.HexColor("#4A6B4E")
USER_BUBBLE = colors.HexColor("#F0F0ED")
NOGIC_BUBBLE = colors.HexColor("#E8EDE7")
USER_AVATAR = colors.HexColor("#F2F1EC")
SECONDARY = colors.HexColor("#6B6B66")


class NumberedCanvas(canvas.Canvas):
    """Draw right-aligned page labels after the final page count is known."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._saved_page_states: list[dict[str, Any]] = []

    def showPage(self) -> None:
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        page_count = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.setFont("Amiri", 8)
            self.setFillColor(SECONDARY)
            self.drawRightString(
                A4[0] - 22 * mm,
                10 * mm,
                f"Page {self._pageNumber} of {page_count}",
            )
            super().showPage()
        super().save()


def draw_footer(current_date: str) -> Any:
    def on_page(pdf_canvas: Any, document: Any) -> None:
        pdf_canvas.saveState()
        pdf_canvas.setFont("Amiri", 8)
        pdf_canvas.setFillColor(SECONDARY)
        pdf_canvas.drawString(
            document.leftMargin, 10 * mm, f"Exported from Nogic · {current_date}"
        )
        pdf_canvas.restoreState()

    return on_page


def _user_avatar(initials: str) -> Drawing:
    avatar = Drawing(18, 18)
    avatar.add(Circle(9, 9, 9, fillColor=USER_AVATAR, strokeColor=USER_AVATAR))
    avatar.add(
        String(
            9,
            6.2,
            initials,
            textAnchor="middle",
            fontName="Amiri",
            fontSize=6,
            fillColor=ACCENT,
        )
    )
    return avatar


def message_table(
    header: Paragraph,
    body: Paragraph,
    role: str,
    initials: str,
    icon_path: Path,
) -> Table:
    """Place an avatar and message bubble in a borderless two-column table."""
    is_user = role == "user"
    avatar: Drawing | Image
    if is_user:
        avatar = _user_avatar(initials)
    else:
        avatar = Image(
            str(icon_path),
            width=7 * mm,
            height=7 * mm,
            kind="proportional",
        )
    content = [header, body]
    content_column = 0 if is_user else 1
    avatar_column = 1 if is_user else 0
    row = [content, avatar] if is_user else [avatar, content]
    table = Table(
        [row],
        colWidths=(135 * mm, 11 * mm) if is_user else (11 * mm, 135 * mm),
        hAlign="RIGHT" if is_user else "LEFT",
        splitByRow=1,
        splitInRow=1,
    )
    table.setStyle(TableStyle([
        (
            "BACKGROUND",
            (content_column, 0),
            (content_column, 0),
            USER_BUBBLE if is_user else NOGIC_BUBBLE,
        ),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (avatar_column, 0), (avatar_column, 0), "CENTER"),
        (
            "ALIGN",
            (content_column, 0),
            (content_column, 0),
            "RIGHT" if is_user else "LEFT",
        ),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (avatar_column, 0), (avatar_column, 0), 4),
        ("LEFTPADDING", (content_column, 0), (content_column, 0), 8),
        ("RIGHTPADDING", (content_column, 0), (content_column, 0), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table
