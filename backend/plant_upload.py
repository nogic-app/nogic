"""Add a single user-submitted plant to the verified table.

The Provenance Rule is enforced here, not in the UI alone: a plant cannot be
written unless `latin_name`, `source_url`, and `source_quote` are all non-empty.
The row is appended with the next `pl_NN` id and `verified` is always true,
because an unreferenced row must never enter the table.
"""

import re
from typing import Any

from import_plants import save_plants
from plant_search import clean_text, load_plants

PROVENANCE_FIELDS = ("latin_name", "source_url", "source_quote")


def _clean(value: Any) -> str:
    return clean_text(value)


def _format_latin_name(value: str) -> str:
    """Format a binomial as `Genus species`, e.g. capparis spinosa."""
    parts = value.split()
    if not parts:
        return ""
    formatted = [parts[0].capitalize()]
    if len(parts) > 1:
        formatted.append(parts[1].lower())
    # Leave any rank or author tokens after the species as written.
    formatted.extend(parts[2:])
    return " ".join(formatted)


def _format_common_name(value: str) -> str:
    """Capitalize a one-word common name; leave multi-word names untouched."""
    if not value or " " in value:
        return value
    return value.capitalize()


def _next_id(plants: list[dict[str, Any]]) -> str:
    highest = 0
    for plant in plants:
        match = re.fullmatch(r"pl_(\d+)", str(plant.get("id", "")))
        if match:
            highest = max(highest, int(match.group(1)))
    return f"pl_{highest + 1:02d}"


def add_plant(
    latin_name: Any,
    common_name: Any = "",
    water_need: Any = "",
    sun_exposure: Any = "",
    source_name: Any = "",
    source_url: Any = "",
    source_quote: Any = "",
) -> dict[str, Any]:
    """Validate provenance, append one plant, and return it with the new total."""
    values = {
        "latin_name": _clean(latin_name),
        "source_url": _clean(source_url),
        "source_quote": _clean(source_quote),
    }
    missing = [field for field in PROVENANCE_FIELDS if not values[field]]
    if missing:
        raise ValueError(
            f"Missing provenance field(s): {', '.join(missing)}. "
            "The Provenance Rule requires latin_name, source_url, and source_quote."
        )

    plants = load_plants()
    plant: dict[str, Any] = {
        "id": _next_id(plants),
        "latin_name": _format_latin_name(values["latin_name"]),
        "common_name": _format_common_name(_clean(common_name)),
        "water_need": _clean(water_need).casefold(),
        "sun_exposure": _clean(sun_exposure).casefold(),
        "source_name": _clean(source_name),
        "source_url": values["source_url"],
        "source_quote": values["source_quote"],
        "verified": True,
    }
    save_plants([*plants, plant])
    return {
        "success": True,
        "plant": plant,
        "total": len(plants) + 1,
    }
