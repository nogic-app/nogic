"""Normalize optional Tabbit plant columns into the app's standard schema."""

from typing import Any

from plant_search import clean_text

WATER_NEEDS = {
    "low": "low",
    "low to medium": "low",
    "mixed": "low",
    "medium": "medium",
    "high": "high",
}
SUN_EXPOSURES = {
    "full sun": "full",
    "sun to part shade": "partial",
    "part to full shade": "shade",
}


def _mapped_value(row: dict[str, Any], field: str, values: dict[str, str]) -> str:
    value = clean_text(row.get(field)).casefold()
    if not value:
        return ""
    try:
        return values[value]
    except KeyError as error:
        raise ValueError(f"unsupported {field} value: {value!r}") from error


def normalized_traits(row: dict[str, Any]) -> tuple[str, str]:
    water_need = _mapped_value(row, "water_need", WATER_NEEDS)
    sun_exposure = _mapped_value(row, "sun_exposure", SUN_EXPOSURES)
    return water_need, sun_exposure


def optional_plant_fields(row: dict[str, Any]) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    common_name_ar = clean_text(row.get("common_name_ar"))
    if common_name_ar:
        fields["common_name_ar"] = common_name_ar

    native_value = clean_text(row.get("native_to_morocco")).casefold()
    if native_value:
        if native_value not in {"yes", "no", "true", "false"}:
            raise ValueError(
                f"unsupported native_to_morocco value: {native_value!r}"
            )
        fields["native_to_morocco"] = native_value in {"yes", "true"}
    return fields
