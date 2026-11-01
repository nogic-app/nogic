"""Generate user-requested documents from a chat prompt."""

from __future__ import annotations

import logging
import os
import re
from typing import Any

import ollama
from docx import Document
from export_paths import FORMAT_LABELS, export_path
from markdown_clean import clean_markdown, markdown_runs
from openpyxl import Workbook
from openpyxl.styles import Font
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

logger = logging.getLogger(__name__)

MEMORY_ERROR = (
    "The model ran out of memory generating the report. "
    "Try asking for a shorter report."
)


def _response_text(response: Any) -> str:
    message = (
        response.get("message")
        if hasattr(response, "get")
        else getattr(response, "message", None)
    )
    content = (
        message.get("content")
        if hasattr(message, "get")
        else getattr(message, "content", None)
    )
    return content if isinstance(content, str) else ""


SKILL_FORMATS = {
    "pdf": "PDF",
    "word": "Word",
    "excel": "Excel",
}
REPORT_PROMPT = (
    "Generate a professional report based on this request: {user_prompt}. "
    "Use the provided conversation history for context. "
    "Write a concise summary (max 500 words)."
)
def _output_path(fmt: str, title: str) -> str:
    normalized_format = fmt
    suffix = (
        "docx" if normalized_format == "word" else "xlsx" if fmt == "excel" else fmt
    )
    directory = os.path.join(os.path.expanduser("~"), "Documents", "Nogic Exports")
    return export_path(FORMAT_LABELS[normalized_format], title, suffix, directory)


def _render_pdf(markdown: str, path: str) -> None:
    styles = getSampleStyleSheet()
    body = ParagraphStyle(
        "SkillBody",
        parent=styles["BodyText"],
        fontSize=10.5,
        leading=15,
        textColor=colors.HexColor("#2B2B28"),
        spaceAfter=8,
    )
    heading = ParagraphStyle(
        "SkillHeading",
        parent=body,
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        textColor=colors.HexColor("#1F1F1D"),
        spaceBefore=8,
    )
    story: list[Any] = [Paragraph("Nogic Report", styles["Title"])]
    for line in clean_markdown(markdown).split("<br/>"):
        if not line.strip():
            story.append(Spacer(1, 5))
        elif line.startswith("<b>") and line.endswith("</b>"):
            story.append(Paragraph(line, heading))
        else:
            story.append(Paragraph(line, body))
    document = SimpleDocTemplate(
        path,
        pagesize=A4,
        leftMargin=22 * mm,
        rightMargin=22 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )
    document.build(story)


def _render_word(markdown: str, path: str) -> None:
    document = Document()
    document.add_heading("Nogic Report", level=0)
    paragraph = document.add_paragraph()
    for text, bold, italic in markdown_runs(markdown):
        if text == "\n":
            paragraph.add_run().add_break()
            continue
        run = paragraph.add_run(text)
        run.bold = bold
        run.italic = italic
    document.save(path)


def _render_excel(markdown: str, path: str) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Report"
    sheet.append(["Nogic Report"])
    sheet["A1"].font = Font(bold=True, size=14)
    for line in markdown.replace("\r\n", "\n").split("\n"):
        if line.strip():
            sheet.append([re.sub(r"^[-*#>\s]+", "", line).strip()])
    sheet.column_dimensions["A"].width = 110
    workbook.save(path)


def generate_document(
    format: str,
    user_prompt: str,
    chat_history: list[dict[str, Any]],
    model: str,
    context: dict[str, Any] | None = None,
    title: str = "Report",
    modes: dict[str, bool] | None = None,
) -> str:
    """Generate Markdown with Ollama and convert it to the requested file."""
    logger.info(f"[SKILL-DEBUG] Received modes: {modes}")
    if format not in SKILL_FORMATS:
        raise ValueError("The skill must be one of: pdf, word, excel.")
    if not user_prompt.strip():
        raise ValueError("A document request is required.")
    context_text = context.get("text", "") if isinstance(context, dict) else ""
    if not isinstance(context_text, str):
        context_text = ""
    history = "\n".join(
        f"{message.get('role', 'user').title()}: {message.get('content', '')}"
        for message in chat_history[-6:]
        if isinstance(message, dict) and message.get("content")
    )
    history = history[-4000:]
    prompt = REPORT_PROMPT.format(user_prompt=user_prompt)
    if modes and modes.get("web") and context_text:
        prompt += f"\n\nResearch context:\n{context_text}"
    try:
        response = ollama.chat(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": f"{prompt}\n\nConversation history:\n{history or '(none)'}",
                }
            ],
            think=False,
            options={"num_predict": 2048, "temperature": 0.1},
            stream=False,
        )
    except Exception as error:
        raise RuntimeError(MEMORY_ERROR) from error
    markdown = _response_text(response).strip()
    if not markdown:
        raise RuntimeError("The document skill returned no report content.")
    filename_title = title.strip()
    if not filename_title or filename_title.casefold() in {
        "chat",
        "new chat",
        "report",
    }:
        filename_title = user_prompt
    path = _output_path(format, filename_title)
    if format == "pdf":
        _render_pdf(markdown, path)
    elif format == "word":
        _render_word(markdown, path)
    else:
        _render_excel(markdown, path)
    return path
