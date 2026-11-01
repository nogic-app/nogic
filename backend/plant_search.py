"""Verified plant lookup with accent-insensitive, provenance-aware matching."""

import json
import os
import re
import unicodedata
from typing import Any

from runtime_paths import DATA_DIR
from plant_scoring import MAX_RESULTS, sun_targets, water_targets

PLANTS_PATH = os.path.join(DATA_DIR, "plants.json")
ENCODING = "utf-8"

REQUIRED_FIELDS = (
    "id",
    "latin_name",
    "common_name",
    "water_need",
    "sun_exposure",
    "source_url",
    "source_quote",
    "verified",
)

# A UTF-8 sequence decoded as a single-byte code page produces these markers.
MOJIBAKE_MARKERS = ("Ã", "Â", "â€", "Ð", "Ñ")


def repair_mojibake(value: str) -> str:
    """Undo UTF-8 text that was decoded as a legacy single-byte code page.

    Only values containing the usual mojibake markers are touched, and the
    round-trip must be valid UTF-8; otherwise the original text is returned.
    This keeps "cÃ¢prier" from entering plants.json even if a client still
    writes through a code-page-based pipe.
    """
    if not any(marker in value for marker in MOJIBAKE_MARKERS):
        return value
    try:
        return value.encode("cp1252").decode(ENCODING)
    except (UnicodeEncodeError, UnicodeDecodeError):
        return value


def clean_text(value: Any) -> str:
    """Strip, repair legacy code-page damage, and normalize to NFC."""
    text = value.strip() if isinstance(value, str) else ""
    if not text:
        return ""
    return unicodedata.normalize("NFC", repair_mojibake(text))

# These words describe the request, not a species trait. They are dropped
# before matching so "plants for a dry slope" searches for "dry", not "plants".
GENERIC_PLANT_WORDS = {
    "plant", "plants", "plante", "plantes", "arbre", "arbres",
    "species", "espece", "especes", "shrub", "shrubs", "tree", "trees",
    "vegetal", "vegetaux", "vegetation", "flora", "flore",
    # Flower words describe the request, not the species. Keeping them out of
    # matching is what lets "the rose flower" refuse instead of matching every
    # quote that happens to contain the word "flower".
    "flower", "flowers", "flowering", "fleur", "fleurs", "bloom", "floraison",
}

STOP_WORDS = {
    "a", "about", "an", "and", "are", "as", "at", "be", "by", "can",
    "do", "does", "for", "from", "how", "i", "in", "is", "it", "me",
    "need", "needs", "of", "on", "or", "that", "the", "this", "to",
    "what", "when", "where", "which", "who", "why", "with", "you",
    "au", "aux", "avec", "ce", "ces", "dans", "de", "des", "du", "elle",
    "en", "et", "il", "je", "la", "le", "les", "leur", "lui", "ma",
    "mais", "me", "mes", "moi", "mon", "ne", "nos", "notre", "nous",
    "on", "ou", "par", "pas", "pour", "qu", "que", "qui", "sa", "se",
    "ses", "son", "sur", "ta", "te", "tes", "toi", "ton", "tu", "un",
    "une", "vos", "votre", "vous", "sol", "quel", "quelle",
    "quels", "quelles",
}

# A deliberately small synonym map. It bridges the user's words to the words
# that actually appear in the cited quotes without inventing plant facts.
SYNONYMS: dict[str, tuple[str, ...]] = {
    "water": ("water", "drought", "dry", "drained", "moisture", "irrigation"),
    "eau": ("eau", "water", "drought", "dry", "drained", "moisture"),
    "arrosage": ("arrosage", "water", "drought", "dry", "drained"),
    "irrigation": ("irrigation", "water", "drought", "dry", "drained"),
    "low": ("low", "little", "drought", "dry"),
    "little": ("little", "low", "drought", "dry"),
    "faible": ("faible", "low", "little", "drought", "dry"),
    "peu": ("peu", "low", "little", "drought", "dry"),
    "drought": ("drought", "dry", "drained", "sec", "secheresse"),
    "dry": ("dry", "drought", "drained", "sec"),
    "sec": ("sec", "dry", "drought"),
    "secheresse": ("secheresse", "drought", "dry"),
    "sun": ("sun", "sunny", "full", "soleil"),
    "sunny": ("sunny", "sun", "full"),
    "soleil": ("soleil", "sun", "sunny", "full"),
    "full": ("full", "sun", "sunny"),
    "plein": ("plein", "full", "sun"),
    "shade": ("shade", "partial", "ombre"),
    "ombre": ("ombre", "shade", "partial"),
    "native": ("native", "morocco", "maroc", "mediterranean", "mediterraneen"),
    "indigene": ("indigene", "native", "morocco", "maroc", "mediterranean"),
    "maroc": ("maroc", "morocco", "native", "mediterranean"),
    "morocco": ("morocco", "maroc", "native", "mediterranean"),
    "mediterranean": ("mediterranean", "mediterraneen", "native"),
    "mediterraneen": ("mediterraneen", "mediterranean", "native"),
    "evergreen": ("evergreen", "persistant"),
    "persistant": ("persistant", "evergreen"),
    "aromatic": ("aromatic", "fragrant", "aromatique"),
    "aromatique": ("aromatique", "aromatic", "fragrant"),
    "edible": ("edible", "comestible"),
    "comestible": ("comestible", "edible"),
    "flower": ("flower", "flowers", "bloom", "fleur", "fleurs"),
    "fleur": ("fleur", "fleurs", "flower", "bloom"),
    "fleurs": ("fleurs", "fleur", "flower", "bloom"),
    "floraison": ("floraison", "flower", "bloom"),
    "romarin": ("romarin", "rosemary", "rosmarinus"),
    "rosemary": ("rosemary", "romarin", "rosmarinus"),
    "lavande": ("lavande", "lavender", "lavandula"),
    "lavender": ("lavender", "lavande", "lavandula"),
    "pistachier": ("pistachier", "lentisque", "lentiscus", "mastic", "pistacia"),
    "lentisque": ("lentisque", "lentisk", "lentiscus", "mastic", "pistacia"),
    "lentisk": ("lentisk", "lentisque", "lentiscus", "mastic", "pistacia"),
    "mastic": ("mastic", "lentisque", "lentisk", "lentiscus", "pistacia"),
    "olivier": ("olivier", "olive", "olea"),
    "olive": ("olive", "olivier", "olea"),
    "caroubier": ("caroubier", "carob", "ceratonia"),
    "caroube": ("caroube", "caroubier", "carob", "ceratonia"),
    "carob": ("carob", "caroubier", "caroube", "ceratonia"),
}

PLANT_INTENT_WORDS = {
    "plant", "plants", "plante", "plantes", "arbre", "arbres",
    "species", "espece", "especes", "shrub", "shrubs", "tree", "trees",
    "vegetal", "vegetaux", "vegetation", "flora", "flore",
    "flower", "flowers", "fleur", "fleurs", "bloom", "floraison",
    "rosemary", "lavender", "mastic", "lentisk", "olive", "carob",
}


def _normalize(text: str) -> str:
    """Lowercase, strip accents, and turn punctuation into spaces."""
    decomposed = unicodedata.normalize("NFD", text.casefold())
    without_accents = "".join(
        character
        for character in decomposed
        if unicodedata.category(character) != "Mn"
    )
    return re.sub(r"[^a-z0-9]+", " ", without_accents)


def _tokens(text: str) -> set[str]:
    return {word for word in _normalize(text).split() if word}


def load_plants() -> list[dict[str, Any]]:
    """Load and validate the verified plant table."""
    with open(PLANTS_PATH, encoding=ENCODING) as plant_file:
        plants = json.load(plant_file)
    if not isinstance(plants, list):
        raise ValueError("plants.json must contain a list of plants.")
    for plant in plants:
        missing = [field for field in REQUIRED_FIELDS if field not in plant]
        if missing:
            raise ValueError(
                f"Plant {plant.get('id', '?')} is missing: {', '.join(missing)}"
            )
        if not plant["source_url"] or not plant["source_quote"]:
            raise ValueError(
                f"Plant {plant['id']} must include a source URL and quote."
            )
        if not isinstance(plant["verified"], bool):
            raise ValueError(f"Plant {plant['id']} has a non-boolean verified flag.")
    return plants


def _phrase(text: str) -> str:
    """Normalize a full name to a single accent-free phrase."""
    return " ".join(_normalize(text).split())


def _name_phrases(plant: dict[str, Any]) -> set[str]:
    names = {
        _phrase(str(plant.get("latin_name", ""))),
        _phrase(str(plant.get("common_name", ""))),
    }
    return {name for name in names if name}


def _haystack(plant: dict[str, Any]) -> set[str]:
    return _tokens(
        " ".join(
            str(plant[field])
            for field in (
                "latin_name",
                "common_name",
                "water_need",
                "sun_exposure",
                "source_quote",
            )
        )
    )


def _query_groups(query: str) -> list[tuple[str, set[str]]]:
    """Return one group per meaningful query word, with its synonyms.

    Each group is an OR set: a plant satisfies the word when it matches any
    member. Groups themselves are ANDed by `search_plants`, so a two-word
    lookup must match both words on the same plant.
    """
    groups: list[tuple[str, set[str]]] = []
    for word in _normalize(query).split():
        if len(word) <= 1 or word in STOP_WORDS or word in GENERIC_PLANT_WORDS:
            continue
        groups.append((word, {word, *SYNONYMS.get(word, ())}))
    return groups


def _trait_score(plant: dict[str, Any], terms: set[str]) -> int:
    """Score +1 for a matching water need and +1 for a matching sun value."""
    score = 0
    water = _tokens(str(plant.get("water_need") or ""))
    sun = _tokens(str(plant.get("sun_exposure") or ""))
    if water_targets(terms) & water:
        score += 1
    if sun_targets(terms) & sun:
        score += 1
    return score


def search_plants(
    query: str,
    *,
    strict: bool = False,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    """Return the best matching plants for a name or trait query.

    Exact full-name matches (`latin_name` or `common_name`) always win, so
    "Capparis spinosa" never resolves to Argania spinosa. Otherwise a plant
    must match at least one meaningful query word, is scored +1 for a
    matching water need and +1 for a matching sun exposure, and the five
    highest scores are returned. The optional `strict` flag used by `/plant`
    requires every query word to match, so a name that is not in the table
    returns no rows instead of a loose trait match. `limit` lets the chat
    pipeline shrink the result set on low-VRAM hardware.
    """
    plants = load_plants()
    cap = MAX_RESULTS if limit is None else max(0, limit)
    phrase = _phrase(query)
    if not phrase:
        return plants[:cap]

    exact = [plant for plant in plants if phrase in _name_phrases(plant)]
    if exact:
        return exact[:cap]

    groups = _query_groups(query)
    if not groups:
        return plants[:cap]

    terms = set().union(*(group for _, group in groups))
    scored: list[tuple[int, int, dict[str, Any]]] = []
    for plant in plants:
        haystack = _haystack(plant)
        matched = sum(1 for _, group in groups if group & haystack)
        if matched == 0 or (strict and matched < len(groups)):
            continue
        scored.append((_trait_score(plant, terms), matched, plant))

    # Trait score first, then how many request words matched; the stable sort
    # keeps the curated table order for equal relevance.
    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return [plant for _, _, plant in scored[:cap]]


def is_plant_query(query: str) -> bool:
    """Detect plant questions by keyword or by a known plant name."""
    words = _tokens(query)
    if words & PLANT_INTENT_WORDS:
        return True

    for plant in load_plants():
        for name in (plant["latin_name"], plant["common_name"]):
            name_tokens = {
                token
                for token in _normalize(name).split()
                if len(token) >= 4
            }
            if name_tokens & words:
                return True
    return False
