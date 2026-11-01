"""Map plant-request words to the recorded water and sun trait values.

The score is deliberately simple: one point for a matching water need and
one point for a matching sun exposure. Keeping the term sets here also keeps
``plant_search.py`` under the 300-line rule.
"""

from __future__ import annotations

MAX_RESULTS = 5

LOW_WATER_WORDS = {
    "low", "little", "faible", "peu", "drought", "dry", "drained",
    "sec", "secheresse", "arid", "aride", "xerophile",
}
WET_WATER_WORDS = {"wet", "moist", "humid", "humide"}
FULL_SUN_WORDS = {"sun", "sunny", "soleil", "full", "plein", "ensoleille"}
SHADE_WORDS = {"shade", "ombre"}
PARTIAL_SUN_WORDS = {"partial", "mi"}


def water_targets(terms: set[str]) -> set[str]:
    """Return the water_need values a query's terms ask for."""
    targets: set[str] = set()
    if terms & LOW_WATER_WORDS:
        targets.add("low")
    if terms & WET_WATER_WORDS:
        targets.update({"medium", "high"})
    return targets


def sun_targets(terms: set[str]) -> set[str]:
    """Return the sun_exposure values a query's terms ask for."""
    targets: set[str] = set()
    if terms & FULL_SUN_WORDS:
        targets.add("full")
    if terms & SHADE_WORDS:
        targets.add("shade")
    if terms & PARTIAL_SUN_WORDS:
        targets.add("partial")
    return targets
