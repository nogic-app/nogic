"""Extract memo content from the chat messages passed to the exporter.

Only the supplied ``messages`` list is read. This module never loads the
whole plant table or another chat, so a memo cannot contain a plant row that
was not part of the exported conversation.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from source_dedup import deduplicate_sources, preferred_law_name

EMPTY_SECTION = "None recorded in this conversation."

_LAW_QUALIFIER = re.compile(r"\s*\([^)]*\)")


def _legal_items(messages: list[dict[str, Any]]) -> list[list[str]]:
    """Return unique citation labels in chat order."""
    return [[label] for label, _details in source_items(messages)]


def _cited_sources(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cited_sources: list[dict[str, Any]] = []
    for message in messages:
        for source in message.get("sources") or []:
            if not isinstance(source, dict):
                continue
            citation = dict(source)
            citation["_used_at"] = message.get("created_at")
            cited_sources.append(citation)
    return deduplicate_sources(cited_sources)


def _citation_label(source: dict[str, Any]) -> str:
    law = _LAW_QUALIFIER.sub("", preferred_law_name(source)).strip()
    article = str(source.get("article_num") or "").strip()
    label = f"{law}, art. {article}" if law and article else law or article
    page = source.get("page_num")
    if page not in (None, ""):
        label = f"{label} · p. {page}"
    return label


def legal_constraint_items(
    messages: list[dict[str, Any]],
) -> list[tuple[str, str]]:
    """Return law citations paired with their jurisdiction for the PDF table."""
    items = []
    for source in _cited_sources(messages):
        label = _citation_label(source)
        if label:
            country = str(source.get("country") or "MA").strip()
            items.append((label, f"Jurisdiction: {country}"))
    return items


def source_items(messages: list[dict[str, Any]]) -> list[tuple[str, list[str]]]:
    """Return unique citation labels and saved details in first-use order."""
    items: list[tuple[str, list[str]]] = []
    for source in _cited_sources(messages):
        label = _citation_label(source)
        if not label:
            continue

        provenance = str(
            source.get("publication")
            or source.get("source_name")
            or source.get("publisher")
            or source.get("details")
            or ""
        ).strip()
        consolidated = source.get("consolidated_year")
        if provenance and consolidated:
            provenance = f"{provenance.rstrip('. ')}, consolidated {consolidated}"
        if not provenance:
            country = str(source.get("country") or "").strip()
            if country:
                provenance = f"Jurisdiction: {country}"
        if provenance and not provenance.endswith("."):
            provenance += "."

        used_at = source.get("used_at") or source.get("_used_at")
        if used_at:
            try:
                used_time = datetime.fromisoformat(str(used_at)).strftime("%H:%M")
            except ValueError:
                used_time = ""
            if used_time:
                provenance += f" Used in the answer at {used_time}."
        details = [provenance] if provenance else []
        items.append((label, details))
    return items


def plant_table_items(
    messages: list[dict[str, Any]],
) -> list[tuple[str, str, str, str, str]]:
    """Return unique plant rows as Latin, common, water, sun, and source."""
    items: list[tuple[str, str, str, str, str]] = []
    seen: set[str] = set()
    for message in messages:
        for plant in message.get("plant_data") or []:
            if not isinstance(plant, dict):
                continue
            latin = str(plant.get("latin_name") or "").strip()
            if not latin or latin.casefold() in seen:
                continue
            seen.add(latin.casefold())
            common = str(plant.get("common_name") or "").strip()
            url = str(plant.get("source_url") or "").split("|")[0].strip()
            items.append(
                (
                    latin,
                    common,
                    str(plant.get("water_need") or "").strip(),
                    str(plant.get("sun_exposure") or "").strip(),
                    url,
                )
            )
    return items


def _plant_items(messages: list[dict[str, Any]]) -> list[list[str]]:
    """Group the verified plant rows carried by these messages only."""
    items: list[list[str]] = []
    for latin, common, water, sun, source in plant_table_items(messages):
        lines = [f"{latin} ({common})" if common else latin]
        traits = [
            f"{label}: {value}"
            for label, value in (("Water", water), ("Sun", sun))
            if value
        ]
        if traits:
            lines.append(" · ".join(traits))
        if source:
            lines.append(source)
        items.append(lines)
    return items


def _site_items(messages: list[dict[str, Any]]) -> list[list[str]]:
    """Group OpenStreetMap site payloads into a readable reference block."""
    items: list[list[str]] = []
    seen: set[tuple[str, str, str]] = set()
    for message in messages:
        site = message.get("site_data")
        if not isinstance(site, dict):
            continue
        name = str(site.get("display_name") or "").strip()
        if not name:
            continue
        lat, lon = site.get("lat"), site.get("lon")
        key = (name.casefold(), str(lat), str(lon))
        if key in seen:
            continue
        seen.add(key)
        lines = [name]
        if lat not in (None, "") and lon not in (None, ""):
            lines.append(f"Coordinates: {lat}, {lon} (OpenStreetMap)")
        kind = str(site.get("type") or "").strip()
        if kind:
            lines.append(f"OSM type: {kind}")
        for label, field in (
            ("Plants", "plants"),
            ("Water", "water"),
            ("Notes", "notes"),
        ):
            value = str(site.get(field) or "").strip()
            if value:
                lines.append(f"{label}: {value}")
        items.append(lines)
    return items


def conversation_items(
    messages: list[dict[str, Any]],
) -> list[tuple[str, str]]:
    """Return the visible (speaker, text) exchange in chat order."""
    return [
        ("You" if message["role"] == "user" else "Nogic", message["content"])
        for message in chat_message_items(messages)
    ]


def chat_message_items(messages: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Return visible chat messages with a readable local timestamp."""
    items: list[dict[str, str]] = []
    for message in messages:
        role = str(message.get("role") or "").strip().casefold()
        if role not in ("user", "assistant"):
            continue
        content = str(message.get("content") or "").strip()
        if not content:
            continue
        created_at = str(message.get("created_at") or "").strip()
        try:
            timestamp = datetime.fromisoformat(created_at).strftime("%H:%M")
        except ValueError:
            timestamp = ""
        items.append({
            "role": role,
            "content": content,
            "timestamp": timestamp,
        })
    return items


def file_items(messages: list[dict[str, Any]]) -> list[tuple[str, str, str]]:
    """Return unique shared files as name, type, and formatted size."""
    items: list[tuple[str, str, str]] = []
    seen: set[str] = set()
    for message in messages:
        for attachment in message.get("attachments") or []:
            if not isinstance(attachment, dict):
                continue
            name = str(attachment.get("name") or "").strip()
            if not name or name.casefold() in seen:
                continue
            seen.add(name.casefold())
            file_type = str(attachment.get("type") or "FILE").strip().upper()
            size = attachment.get("size")
            try:
                byte_count = max(0, int(size))
            except (TypeError, ValueError):
                byte_count = 0
            if byte_count >= 1024 * 1024:
                formatted_size = f"{byte_count / (1024 * 1024):.1f} MB"
            elif byte_count >= 1024:
                formatted_size = f"{byte_count / 1024:.1f} KB"
            else:
                formatted_size = f"{byte_count} B"
            items.append((name, file_type, formatted_size))
    return items


def memo_sections(
    messages: list[dict[str, Any]],
) -> list[tuple[str, list[list[str]]]]:
    """Return the three memo sections in display order."""
    return [
        ("Legal Constraints", _legal_items(messages)),
        ("Plant Palette", _plant_items(messages)),
        ("Site Context", _site_items(messages)),
    ]
