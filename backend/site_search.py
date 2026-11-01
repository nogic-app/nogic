"""OpenStreetMap geocoding and site-context helpers for /site commands."""

from __future__ import annotations

import re
from typing import Any

import httpx

from web_search import search_web

OSM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "Nogic/1.0 (contact@nogic.app)"
REQUEST_TIMEOUT_SECONDS = 12
LOCATION_STOP_WORDS = {"a", "al", "au", "aux", "d", "de", "des", "du", "la", "le", "les", "of", "the"}


def _as_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _is_relevant_result(query: str, display_name: str) -> bool:
    query_terms = [
        term
        for term in re.findall(r"[\w]+", query.casefold())
        if term not in LOCATION_STOP_WORDS and len(term) > 1
    ]
    if len(query_terms) <= 1:
        return True
    result_terms = re.findall(r"[\w]+", display_name.casefold())
    return any(
        result_terms[index : index + 2] == query_terms[position : position + 2]
        for index in range(len(result_terms) - 1)
        for position in range(len(query_terms) - 1)
    )


def search_location(query: str) -> dict[str, Any]:
    """Return a single geocoded OSM result for a user-supplied location."""
    cleaned = (query or "").strip()
    if not cleaned:
        return {"error": "no_match"}

    try:
        response = httpx.get(
            OSM_SEARCH_URL,
            params={
                "q": cleaned,
                "format": "json",
                "limit": 1,
                "polygon_geojson": 1,
            },
            headers={"User-Agent": USER_AGENT},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except (httpx.HTTPError, OSError):
        return {"error": "no_internet"}

    try:
        payload = response.json()
    except ValueError:
        return {"error": "no_match"}

    if not isinstance(payload, list) or not payload:
        return {"error": "no_match"}

    item = payload[0]
    if not isinstance(item, dict):
        return {"error": "no_match"}

    display_name = str(item.get("display_name") or "").strip()
    lat = _as_float(item.get("lat"))
    lon = _as_float(item.get("lon"))
    if not display_name or lat is None or lon is None:
        return {"error": "no_match"}
    if not _is_relevant_result(cleaned, display_name):
        return {"error": "no_match"}

    result: dict[str, Any] = {
        "display_name": display_name,
        "lat": lat,
        "lon": lon,
        "type": str(item.get("type") or "site"),
        "boundingbox": item.get("boundingbox"),
        "geojson": item.get("geojson"),
    }
    if "class" in item:
        result["class"] = item.get("class")
    return result


def _summarize(results: list[dict[str, str]], keywords: tuple[str, ...]) -> str:
    snippets: list[str] = []
    for result in results:
        text = " ".join(
            part
            for part in (
                result.get("title", ""),
                result.get("snippet", ""),
                result.get("url", ""),
            )
            if part
        )
        haystack = text.casefold()
        if any(keyword in haystack for keyword in keywords):
            snippets.append(text.strip())
    if not snippets:
        return "".join(
            f"{result.get('title', '').strip()} {result.get('snippet', '').strip()} ".strip()
            for result in results[:2]
        ).strip()
    return " ".join(snippets[:3])


def fetch_site_context(location_name: str) -> dict[str, str]:
    """Use web search to gather plant, water, and historical notes for a site."""
    if not location_name or not location_name.strip():
        return {"plants": "", "water": "", "notes": ""}

    query = f'{location_name.strip()} plants water history usage site'
    results = search_web(query, max_results=6)
    if not results:
        return {"plants": "", "water": "", "notes": ""}

    plants = _summarize(results, (
        "plant",
        "flora",
        "vegetation",
        "species",
        "trees",
        "native",
        "garden",
        "landscaping",
    ))
    water = _summarize(results, (
        "water",
        "pond",
        "lake",
        "river",
        "stream",
        "drainage",
        "irrigation",
        "wetland",
        "flood",
    ))
    notes = _summarize(results, (
        "history",
        "heritage",
        "usage",
        "public use",
        "recreation",
        "former",
        "former use",
        "site",
        "land use",
    ))
    return {
        "plants": plants.strip(),
        "water": water.strip(),
        "notes": notes.strip(),
    }
