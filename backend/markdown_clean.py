"""Convert assistant Markdown into export-ready formatting.

The model answers with ``**bold**``, ``*italic*``, lists, and escaped
characters. PDF export needs ReportLab paragraph markup; Word export needs
runs. Both conversions live here so ``export_engine.py`` stays small.
"""

from __future__ import annotations

import re
from xml.sax.saxutils import escape

_ESCAPE_RE = re.compile(r"\\([\\`*_{}\[\]()#+\-.!>~|])")
_HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$")
_BULLET_RE = re.compile(r"^\s*[-*+]\s+(.*)$")
_ORDERED_RE = re.compile(r"^\s*(\d+)[.)]\s+(.*)$")
_HR_RE = re.compile(r"^\s*([-*_])(?:\s*\1){2,}\s*$")
_QUOTE_RE = re.compile(r"^\s*>\s?(.*)$")
_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^)\s]+)\)")
_INLINE_CODE_RE = re.compile(r"`([^`\n]+)`")


def _normalize_markdown(text: str) -> str:
    """Normalize line endings and drop backslash escapes (``\\(``, ``\\*``)."""
    normalized = str(text).replace("\r\n", "\n").replace("\r", "\n")
    return _ESCAPE_RE.sub(r"\1", normalized)


def _markdown_lines(text: str) -> list[tuple[str, bool]]:
    """Strip block syntax; return ``(line, is_heading)`` pairs."""
    lines: list[tuple[str, bool]] = []
    in_fence = False
    for raw in _normalize_markdown(text).split("\n"):
        line = raw.rstrip()
        if line.strip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            lines.append((line, False))
            continue
        if _HR_RE.match(line):
            continue
        heading = _HEADING_RE.match(line)
        if heading:
            lines.append((heading.group(1), True))
            continue
        bullet = _BULLET_RE.match(line)
        if bullet:
            lines.append((f"\u2022 {bullet.group(1)}", False))
            continue
        ordered = _ORDERED_RE.match(line)
        if ordered:
            lines.append((f"{ordered.group(1)}. {ordered.group(2)}", False))
            continue
        quote = _QUOTE_RE.match(line)
        if quote:
            lines.append((quote.group(1), False))
            continue
        lines.append((line, False))
    return lines


def _pdf_inline(text: str) -> str:
    """Convert inline Markdown in already-escaped text to ReportLab markup."""
    codes: list[str] = []

    def stash(match: re.Match[str]) -> str:
        codes.append(match.group(1))
        return f"\x00{len(codes) - 1}\x00"

    text = _INLINE_CODE_RE.sub(stash, text)

    def link(match: re.Match[str]) -> str:
        label = match.group(1)
        url = match.group(2).replace('"', "&quot;")
        return f'<link href="{url}" color="#4A6B4E">{label}</link>'

    text = _LINK_RE.sub(link, text)
    text = re.sub(r"\*\*\*(.+?)\*\*\*", r"<b><i>\1</i></b>", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<i>\1</i>", text)
    text = re.sub(r"(?<![\w])__(.+?)__(?![\w])", r"<b>\1</b>", text)
    text = re.sub(r"(?<![\w])_(.+?)_(?![\w])", r"<i>\1</i>", text)
    for index, code in enumerate(codes):
        text = text.replace(
            f"\x00{index}\x00", f'<font name="Amiri">{code}</font>'
        )
    return text


def clean_markdown(text: str) -> str:
    """Turn assistant Markdown into ReportLab paragraph markup.

    ``**bold**`` becomes ``<b>``, ``*italic*`` becomes ``<i>``, list markers
    become bullets, code spans retain the Unicode font, links stay clickable, and raw
    escape characters are removed.
    """
    blocks: list[str] = []
    for line, is_heading in _markdown_lines(text):
        safe = _pdf_inline(escape(line))
        if is_heading and safe.strip():
            safe = f"<b>{safe}</b>"
        blocks.append(safe)
    return "<br/>".join(blocks)


def _docx_line_runs(line: str) -> list[tuple[str, bool, bool]]:
    """Split one Markdown line into ``(text, bold, italic)`` runs."""
    runs: list[tuple[str, bool, bool]] = []
    bold = False
    italic = False
    buffer: list[str] = []

    def flush() -> None:
        if buffer:
            runs.append(("".join(buffer), bold, italic))
            buffer.clear()

    index = 0
    while index < len(line):
        if line.startswith("**", index):
            flush()
            bold = not bold
            index += 2
        elif line[index] == "*":
            flush()
            italic = not italic
            index += 1
        elif line[index] == "`":
            flush()
            end = line.find("`", index + 1)
            if end == -1:
                buffer.append(line[index])
                index += 1
            else:
                runs.append((line[index + 1 : end], bold, italic))
                index = end + 1
        else:
            buffer.append(line[index])
            index += 1
    flush()
    return runs


def markdown_runs(text: str) -> list[tuple[str, bool, bool]]:
    """Split Markdown into runs for python-docx (``\\n`` marks a line break)."""
    runs: list[tuple[str, bool, bool]] = []
    for position, (line, is_heading) in enumerate(_markdown_lines(text)):
        if position > 0:
            runs.append(("\n", False, False))
        line_runs = _docx_line_runs(line)
        if is_heading:
            line_runs = [(value, True, ital) for value, _, ital in line_runs]
        runs.extend(line_runs)
    return runs
