"""Translate a landscape question into French keywords and retrieve articles."""

from typing import Any

import ollama

from db import search_law

TRANSLATION_PROMPT = (
    "You convert a landscape question into French full-text search "
    "keywords for a Moroccan law database. Output ONLY 4 to 6 "
    "space-separated French words, lowercase, no punctuation, no "
    "explanation.\n"
    "Include three things when possible:\n"
    "1. the literal nouns from the question;\n"
    "2. the administrative act or request the question is about "
    "(apply or request -> 'demande'; permit -> 'permis'; "
    "authorization -> 'autorisation'; documents to submit -> "
    "'documents' or 'pieces');\n"
    "3. the legal concept (setback -> 'recul'; public road -> "
    "'voie publique'; heritage -> 'monuments historiques'; "
    "discharge into water -> 'rejet interdit').\n"
    "If the question concerns heritage, historic monuments, or "
    "Loi 22.80, always include 'monuments historiques'.\n"
    "Example: 'What must I submit to get a building permit?' -> "
    "documents demande pieces permis construire\n"
)


def get_law_sources(
    question: str,
    model: str,
    limit: int = 8,
) -> list[dict[str, Any]]:
    """Return the best matching law articles for a question.

    `limit` is lowered for DeepThink, whose plan/draft/critique passes need
    room inside the model's 4K context window.
    """
    translation = ollama.chat(
        model=model,
        messages=[{
            "role": "user",
            "content": f"{TRANSLATION_PROMPT}Question: {question}",
        }],
        options={"temperature": 0.0},
        stream=False,
    )
    translated_query = " ".join(translation["message"]["content"].split())
    if not translated_query:
        raise ValueError("Ollama returned an empty French search query.")
    return search_law(translated_query, limit=limit)
