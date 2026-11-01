"""Public export façade for a chat: site memo (PDF/Word) and Excel.

The memo layout lives in ``memo_layout`` so both files stay under the
300-line rule. Export scope is explicit: the memo sections are built only
from the messages passed in, never from the whole plant table or another
chat. Callers that do not pass messages get this chat's persisted rows.
"""

from __future__ import annotations

import os
import logging
import tempfile
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Font

from db import get_connection, get_messages, get_settings
from export_paths import export_path
from memo_layout import render_docx, render_pdf

logger = logging.getLogger(__name__)
Messages = list[dict[str, Any]]


def _load_chat(
    chat_id: str, messages: Messages | None = None
) -> tuple[str, str, Messages]:
    """Return (chat title, project name, messages) for one chat.

    When ``messages`` is supplied, that exact list is exported; the database
    is used only for the chat title and project name. Plant, law, and site
    content therefore cannot leak in from other chats or from the plant
    table itself.
    """
    if not isinstance(chat_id, str) or not chat_id.strip():
        raise ValueError("The chat_id is required.")
    with get_connection() as conn:
        row = conn.execute(
            "SELECT chats.title, projects.name AS project_name "
            "FROM chats LEFT JOIN projects ON projects.id = chats.project_id "
            "WHERE chats.id = ?",
            (chat_id,),
        ).fetchone()
    if messages is None:
        messages = get_messages(chat_id)
    else:
        messages = [message for message in messages if isinstance(message, dict)]
    if not messages:
        raise ValueError("This chat has no messages to export.")
    title = (row["title"] if row is not None else "").strip() or "Chat"
    project = (row["project_name"] if row is not None else "") or ""
    return title, str(project).strip(), messages


def _output_path(title: str, suffix: str) -> str:
    directory = tempfile.mkdtemp(prefix="nogic_export_")
    format_name = {"pdf": "PDF", "docx": "Word", "xlsx": "Excel"}[suffix]
    return export_path(format_name, title, suffix, directory)


def _memo_model_name() -> str:
    """Return the selected model for the export metadata."""
    settings = get_settings()
    return str(settings.get("activeModel") or "").strip() or "Not specified"


def _memo_user_name() -> str:
    """Return the saved user name for chat-export avatars."""
    settings = get_settings()
    return str(settings.get("userName") or "").strip()


def export_chat_pdf(chat_id: str, messages: Messages | None = None) -> str:
    """Write the chat export to a PDF in a temp directory and return its path."""
    title, _project, messages = _load_chat(chat_id, messages)
    path = _output_path(title, "pdf")
    try:
        render_pdf(title, messages, path, _memo_model_name(), _memo_user_name())
    except Exception:
        logger.exception("Could not export chat as PDF.")
        raise
    return path


def export_chat_docx(chat_id: str, messages: Messages | None = None) -> str:
    """Write the chat export to a .docx in a temp directory and return its path."""
    title, _project, messages = _load_chat(chat_id, messages)
    path = _output_path(title, "docx")
    try:
        render_docx(title, messages, path, _memo_model_name(), _memo_user_name())
    except Exception:
        logger.exception("Could not export chat as Word.")
        raise
    return path


def export_chat_excel(chat_id: str, messages: Messages | None = None) -> str:
    """Write a Role (A) / Content (B) workbook and return its path."""
    title, _project, messages = _load_chat(chat_id, messages)
    path = _output_path(title, "xlsx")
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Chat"
    sheet.append(["Role", "Content"])
    header_font = Font(bold=True)
    for cell in sheet[1]:
        cell.font = header_font
    for message in messages:
        role = str(message.get("role") or "").capitalize()
        content = str(message.get("content") or "").strip()
        if not content:
            continue
        sheet.append([role, content])
    try:
        workbook.save(path)
    except Exception:
        logger.exception("Could not export chat as Excel.")
        raise
    return path
