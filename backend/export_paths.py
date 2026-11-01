"""Build collision-safe filenames for generated Nogic documents."""

from __future__ import annotations

import os
import unicodedata


FORMAT_LABELS = {
    "pdf": "PDF",
    "word": "Word",
    "excel": "Excel",
}


def _clean_title(title: str) -> str:
    normalized = unicodedata.normalize("NFKD", title)
    characters: list[str] = []
    for character in normalized:
        if unicodedata.combining(character):
            continue
        if character.isalnum():
            characters.append(character)
        elif characters and characters[-1] != "_":
            characters.append("_")
    cleaned = "".join(characters).strip("_")
    return cleaned[:100] or "Document"


def export_path(format_name: str, title: str, extension: str, directory: str) -> str:
    """Return a readable output path, adding a version suffix when needed."""
    os.makedirs(directory, exist_ok=True)
    cleaned_title = _clean_title(title)
    stem = f"Nogic_{format_name}_{cleaned_title}"
    candidate = os.path.abspath(os.path.join(directory, f"{stem}.{extension}"))
    version = 2
    while os.path.exists(candidate):
        candidate = os.path.abspath(
            os.path.join(directory, f"{stem}_v{version}.{extension}")
        )
        version += 1
    return candidate
