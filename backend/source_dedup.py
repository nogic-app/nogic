"""Deduplicate law citations before prompting or displaying them."""

from __future__ import annotations

import re
from typing import Any

_LAW_QUALIFIER = re.compile(r"\s*\([^)]*\)")
_ARABIC = re.compile(
    r"[\u0600-\u06ff\u0750-\u077f"
    r"\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]"
)


def preferred_law_name(source: dict[str, Any]) -> str:
    """Prefer the most informative Latin law name when Arabic aliases exist."""
    sub_law = str(source.get("sub_law") or "").strip()
    law_name = str(source.get("law_name") or "").strip()
    if sub_law and not _ARABIC.search(sub_law):
        return sub_law
    if law_name and not _ARABIC.search(law_name):
        return law_name
    return sub_law or law_name


def _source_key(source: dict[str, Any]) -> tuple[str, str, str] | None:
    country = str(source.get("country") or "MA").strip().casefold()
    law_name = preferred_law_name(source)
    law_name = _ARABIC.sub("", law_name)
    normalized_law = re.sub(
        r"\s+", "", _LAW_QUALIFIER.sub("", law_name).casefold()
    )
    article = re.sub(r"\s+", "", str(source.get("article_num") or "")).casefold()
    return (
        (country, normalized_law, article)
        if country and normalized_law and article
        else None
    )


def deduplicate_sources(
    sources: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Keep one citation per law/article, preferring its Latin name."""
    unique: list[dict[str, Any]] = []
    seen: dict[tuple[str, str, str], int] = {}
    for source in sources:
        key = _source_key(source)
        if key is not None and key in seen:
            index = seen[key]
            previous = unique[index]
            if _latin_preference(source) > _latin_preference(previous):
                unique[index] = source
            continue
        if key is not None:
            seen[key] = len(unique)
        unique.append(source)
    return unique


def _latin_preference(source: dict[str, Any]) -> tuple[bool, int, int]:
    name = _LAW_QUALIFIER.sub("", preferred_law_name(source)).strip()
    return (
        not bool(_ARABIC.search(name)),
        len(_ARABIC.sub("", name).strip()),
        len(name),
    )
