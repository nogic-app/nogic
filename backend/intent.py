"""Deterministic intent routing: general chat, law retrieval, or plant lookup.

General questions must never fall through to the law pipeline. Only a clear
law/urbanism signal reaches FTS5 retrieval, and only a plant signal reaches
the verified plant table. Everything else is answered without RAG.
"""

import re
import unicodedata

from plant_search import is_plant_query

GENERAL_SYSTEM_PROMPT = (
    "You are Nogic, a local AI colleague for landscape architecture. "
    "Be concise and helpful."
)

GENERAL_HONESTY_NOTE = (
    "No law articles or plant rows were retrieved for this message. Answer "
    "from general knowledge, and do not invent legal citations or plant "
    "provenance."
)

# Strong legal/urbanism terms. Deliberately excludes generic words such as
# "plan", "site", "water", and "zone" so ordinary conversation stays general.
LAW_INTENT_WORDS = frozenset({
    "law", "laws", "legal", "legislation", "regulation", "regulations",
    "decree", "statute", "statutes", "article", "articles", "loi", "lois",
    "dahir", "arrete", "jurisprudence", "tribunal", "infraction",
    "penalty", "amende", "compliance", "conformite",
    "urbanism", "urbanisme", "zoning", "permit", "permits", "permission",
    "authorization", "authorisation", "license", "licence", "declaration",
    "setback", "setbacks", "recul", "construction", "constructing",
    "building", "buildings", "batiment", "demolition", "heritage",
    "patrimoine", "monument", "monuments", "environment", "environnement",
    "discharge", "rejet", "assainissement", "sewage", "wastewater",
    "subdivision", "lotissement", "amenagement", "servitude", "servitudes",
    "easement", "fence", "cloture", "height", "hauteur", "facade",
    "frontage", "density", "densite", "coefficient", "cos", "cusr",
    "accessibility", "handicap", "photovoltaic", "photovoltaique", "solar",
    "agricultural", "agricole", "forest", "foret", "coastal", "littoral",
    "flood", "inondation", "seismic", "sismique", "thermal", "thermique",
    "pollution", "nuisance", "noise", "bruit", "signage", "enseigne",
    "advertising", "publicite", "expropriation", "preemption", "approval",
    "approbation", "parcel", "parcelle", "terrain", "emprise",
    "reglement", "reglementation",
})

# Multi-word signals that cannot be represented by a single token.
LAW_INTENT_PHRASES = (
    "moroccan law",
    "bulletin officiel",
    "public inquiry",
    "right of way",
    "building permit",
    "construction permit",
    "land use",
    "plan d amenagement",
    "plan d'amenagement",
    "coefficient d occupation",
    "solar panel",
    "solar panels",
    "environmental impact",
    "impact study",
    "etude d impact",
    "etude d'impact",
)


def _normalize(text: str) -> str:
    """Lowercase, strip accents, and turn punctuation into spaces."""
    decomposed = unicodedata.normalize("NFD", text.casefold())
    without_accents = "".join(
        character
        for character in decomposed
        if unicodedata.category(character) != "Mn"
    )
    return re.sub(r"[^a-z0-9']+", " ", without_accents).strip()


def classify_intent(question: str) -> str:
    """Return "general", "law", or "plant" for a user question.

    Law wins over plant when both signals are present, so "setback for a
    planted screen" stays in the cited-law path.
    """
    normalized = _normalize(question)
    words = set(normalized.split())
    if words & LAW_INTENT_WORDS:
        return "law"
    if any(phrase in normalized for phrase in LAW_INTENT_PHRASES):
        return "law"
    if is_plant_query(question):
        return "plant"
    return "general"


def build_general_system_prompt() -> str:
    """Prompt for greetings and general questions that bypass RAG."""
    return f"{GENERAL_SYSTEM_PROMPT}\n{GENERAL_HONESTY_NOTE}"
