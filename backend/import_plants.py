"""Import bulk plant rows from a CSV into the verified plant table.

Provenance Rule: a row is rejected unless `latin_name`, `source_url`, and
`source_quote` are all non-empty. Duplicate Latin names are skipped so an
existing verified row is never overwritten by a thinner column set; new
species are appended with a generated `pl_NN` id.

The CSV defaults to `backend/data/plants_bulk.csv`, resolved relative to this
file so the script works from any working directory. It accepts the bulk
research schema:

    latin_name, common_name_fr, common_name_ar, water_need, sun_exposure,
    height_m, flower_color, native_to_morocco, source_url, source_quote

`common_name_fr` maps to `common_name`; `common_name_ar` and
`native_to_morocco` are preserved as optional fields. Water and sun values are
normalized to the standard plant schema. Blank traits stay blank. A
pipe-separated `source_url` is kept verbatim as one string; every segment is
validated as an http(s) URL. A missing `verified` value defaults to true
because this script refuses unprovenanced rows.

Usage:
    python import_plants.py [csv_path] [--dry-run]
"""

import csv
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from plant_import_mapping import normalized_traits, optional_plant_fields
from plant_search import ENCODING, REQUIRED_FIELDS, clean_text, load_plants
from runtime_paths import BUNDLED_DATA_DIR, DATA_DIR

# Resolve from this file, never from the process working directory.
BACKEND_DIR = Path(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CSV_PATH = BUNDLED_DATA_DIR / "plants_bulk.csv"
PLANTS_PATH = DATA_DIR / "plants.json"

PROVENANCE_FIELDS = ("latin_name", "source_url", "source_quote")
# Common-name headers accepted by the importer, in precedence order.
COMMON_NAME_COLUMNS = ("common_name", "common_name_fr")
# Columns that must exist in the CSV header for a row to be usable.
REQUIRED_COLUMNS = PROVENANCE_FIELDS
TRUE_VALUES = {"1", "true", "yes", "verified"}
FALSE_VALUES = {"0", "false", "no", "unverified"}


def _clean(row: dict[str, Any], field: str) -> str:
    return clean_text(row.get(field))


def _common_name(row: dict[str, Any]) -> str:
    """Prefer the legacy common-name field, then the French CSV field."""
    for column in COMMON_NAME_COLUMNS:
        name = _clean(row, column)
        if name:
            return name
    return ""


def _source_url_parts(url: str) -> list[str]:
    """Split a pipe-joined citation list, keeping the stored value intact."""
    return [part.strip() for part in url.split("|") if part.strip()]


def _name_key(latin_name: str) -> str:
    return " ".join(latin_name.casefold().split())


def _parse_verified(value: str) -> bool:
    lowered = value.casefold()
    if not lowered or lowered in TRUE_VALUES:
        return True
    if lowered in FALSE_VALUES:
        return False
    raise ValueError(
        f"verified must be one of {sorted(TRUE_VALUES | FALSE_VALUES)}, "
        f"not {value!r}"
    )


def _validate_row(row: dict[str, Any], number: int) -> list[str]:
    errors: list[str] = []
    for field in PROVENANCE_FIELDS:
        if not _clean(row, field):
            errors.append(
                f"row {number}: {field} is required (Provenance Rule)"
            )
    # Blank traits stay empty rather than being inferred.

    url = _clean(row, "source_url")
    if url:
        for part in _source_url_parts(url):
            parsed = urlparse(part)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                errors.append(
                    f"row {number}: source_url segment must be an http(s) URL, "
                    f"not {part!r}"
                )
    try:
        _parse_verified(_clean(row, "verified"))
    except ValueError as error:
        errors.append(f"row {number}: {error}")
    try:
        normalized_traits(row)
        optional_plant_fields(row)
    except ValueError as error:
        errors.append(f"row {number}: {error}")
    return errors


def _to_plant(row: dict[str, Any]) -> dict[str, Any]:
    water_need, sun_exposure = normalized_traits(row)
    return {
        "latin_name": _clean(row, "latin_name"),
        "common_name": _common_name(row),
        "water_need": water_need,
        "sun_exposure": sun_exposure,
        "source_url": _clean(row, "source_url"),
        "source_quote": _clean(row, "source_quote"),
        "verified": _parse_verified(_clean(row, "verified")),
        **optional_plant_fields(row),
    }


def _allocate_id(used_ids: set[str]) -> str:
    index = 1
    while f"pl_{index:02d}" in used_ids:
        index += 1
    new_id = f"pl_{index:02d}"
    used_ids.add(new_id)
    return new_id


def _validate_plant(plant: dict[str, Any]) -> None:
    missing = [field for field in REQUIRED_FIELDS if field not in plant]
    if missing:
        raise ValueError(f"Plant {plant.get('id', '?')} is missing {missing}")
    if not plant["source_url"] or not plant["source_quote"]:
        raise ValueError(f"Plant {plant['id']} has no provenance")
    if not isinstance(plant["verified"], bool):
        raise ValueError(f"Plant {plant['id']} has a non-boolean verified flag")


def merge_plants(
    existing: list[dict[str, Any]],
    incoming: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], int, int]:
    """Append new species and fill only missing optional fields on duplicates.

    Existing rows are already verified and may be richer than a research CSV,
    so a duplicate never overwrites an existing field. Optional Arabic and
    native-status values are added only when the existing row lacks them.
    """
    merged = [dict(plant) for plant in existing]
    used_ids = {plant["id"] for plant in merged}
    by_name = {_name_key(plant["latin_name"]): plant for plant in merged}
    added = 0
    skipped = 0

    for row in incoming:
        key = _name_key(row["latin_name"])
        if key in by_name:
            for field in ("common_name_ar", "native_to_morocco"):
                if field not in by_name[key] and field in row:
                    by_name[key][field] = row[field]
            skipped += 1
            continue
        plant = {"id": _allocate_id(used_ids), **row}
        merged.append(plant)
        by_name[key] = plant
        added += 1
    return merged, added, skipped


def save_plants(plants: list[dict[str, Any]]) -> None:
    """Write atomically so a failed import cannot corrupt plants.json."""
    for plant in plants:
        _validate_plant(plant)
    PLANTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_path = tempfile.mkstemp(
        dir=PLANTS_PATH.parent, prefix="plants_", suffix=".json"
    )
    try:
        with os.fdopen(descriptor, "w", encoding=ENCODING, newline="\n") as handle:
            json.dump(plants, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temporary_path, PLANTS_PATH)
    except Exception:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)
        raise


def main(argv: list[str]) -> int:
    dry_run = "--dry-run" in argv
    arguments = [argument for argument in argv if not argument.startswith("--")]
    csv_path = Path(arguments[1]) if len(arguments) > 1 else DEFAULT_CSV_PATH
    # Always report (and open) the absolute path so a wrong guess is obvious.
    attempted_path = csv_path.expanduser().resolve()

    if not attempted_path.is_file():
        print(f"CSV not found at: {attempted_path}", file=sys.stderr)
        print(
            f"Looked for {csv_path.name} in {attempted_path.parent}",
            file=sys.stderr,
        )
        print(
            "Pass an explicit path: python import_plants.py <csv_path> [--dry-run]",
            file=sys.stderr,
        )
        return 1

    try:
        with attempted_path.open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            fieldnames = reader.fieldnames or []
            missing_columns = [
                column for column in REQUIRED_COLUMNS if column not in fieldnames
            ]
            if not any(column in fieldnames for column in COMMON_NAME_COLUMNS):
                missing_columns.append(" or ".join(COMMON_NAME_COLUMNS))
            if missing_columns:
                print(
                    f"CSV at {attempted_path} is missing columns: "
                    f"{', '.join(missing_columns)}",
                    file=sys.stderr,
                )
                return 1
            rows = list(reader)
    except OSError as error:
        print(f"Could not open CSV at: {attempted_path}", file=sys.stderr)
        print(f"  {error}", file=sys.stderr)
        return 1
    except (UnicodeDecodeError, csv.Error) as error:
        print(f"Could not read CSV at: {attempted_path}", file=sys.stderr)
        print(f"  {error}", file=sys.stderr)
        return 1

    if not rows:
        print("CSV has no data rows.", file=sys.stderr)
        return 1

    errors: list[str] = []
    seen: dict[str, int] = {}
    for number, row in enumerate(rows, start=2):
        errors.extend(_validate_row(row, number))
        latin_name = _clean(row, "latin_name")
        if latin_name:
            key = _name_key(latin_name)
            if key in seen:
                errors.append(
                    f"row {number}: duplicate latin_name {latin_name!r} "
                    f"(first seen on row {seen[key]})"
                )
            else:
                seen[key] = number

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        print(f"Import aborted: {len(errors)} validation error(s).", file=sys.stderr)
        return 1

    incoming = [_to_plant(row) for row in rows]
    try:
        existing = load_plants()
    except (OSError, ValueError) as error:
        print(f"Could not load {PLANTS_PATH}: {error}", file=sys.stderr)
        return 1
    merged, added, skipped = merge_plants(existing, incoming)
    for plant in merged:
        _validate_plant(plant)

    unverified = sum(1 for plant in incoming if not plant["verified"])
    if dry_run:
        print(
            f"Dry run: {added} new, {skipped} existing species skipped, "
            f"{len(merged)} total, {unverified} marked unverified."
        )
        return 0

    save_plants(merged)
    print(
        f"Imported {attempted_path}: {added} new, "
        f"{skipped} existing species skipped, {len(merged)} total, "
        f"{unverified} marked unverified."
    )
    print(f"Saved to {PLANTS_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
