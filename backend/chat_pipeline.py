"""Route a chat request to general, law, plant, or web and generate an answer."""

import re
import sys
import os
from typing import Any

from chat_engine import ANSWER_OPTIONS, Emit, run_deep_think, stream_answer
from ai_skills import generate_document
from db import count_law_articles
from document_qa import run_document_qa
from intent import build_general_system_prompt, classify_intent
from law_prompts import build_law_system_prompt
from law_query import get_law_sources
from model_actions import model_supports_vision
from plant_prompts import build_plant_system_prompt
from plant_search import search_plants
from site_search import fetch_site_context, search_location
from source_dedup import deduplicate_sources
from web_search import (
    build_web_system_prompt,
    search_web,
    web_sources_from_results,
)

WEB_EMPTY_PREFIX = "Web search found no usable results. Answering from local knowledge.\n\n"
WEB_EMPTY_PROMPT = (
    "Web search was requested but returned no usable results. Answer from "
    "general knowledge. The app already tells the user that the search found "
    "nothing, so do not repeat that notice, and do not claim that you "
    "searched the web."
)
EMPTY_LAW_LIBRARY = (
    "Your law library is empty. Type /add-law to upload a PDF of your "
    "country's environmental and landscape laws."
)
IMAGE_UNSUPPORTED = (
    "This model cannot read images. Choose a vision-capable model in "
    "Settings > Models, or describe the image in text."
)
SKILL_INSTRUCTION = (
    "To generate a PDF, Word, or Excel document, click the '+' menu and "
    "attach the document skill to your message."
)
DEEP_THINK_LAW_LIMIT = 3
DEFAULT_LAW_LIMIT = 8
EXTRACTIVE_INSTRUCTION = (
    "You are running on low hardware. Answer using the EXACT text provided in "
    "the context. Do not generate extra prose. Quote the article directly and "
    "add a one-sentence summary."
)
HELP_RESPONSE = """Here are the commands you can use:

**Library Management**
- `/add-law` : Add a custom law PDF to your library.
- `/add-plant` : Add a plant with its source to the verified table.

**Lookups**
- `/plant "name"` : Instantly look up a plant card (e.g., `/plant romarin`).
- `/site "location"` : Fetch site data and a map.

**Chat Modes**
- Toggle **DeepThink** or **Web** using the buttons below the composer.
- Switch between **Fast** and **Think** using the dropdown."""


def _log(message: str) -> None:
    print(f"Chat pipeline: {message}", file=sys.stderr, flush=True)


def _retrieved_response(
    question: str,
    model: str,
    modes: dict[str, bool],
    max_law_articles: int,
    max_plants: int | None,
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]], str, bool]:
    """Return (system prompt, sources, plant rows, intent, empty_law) for RAG."""
    intent = classify_intent(question)

    if intent == "plant":
        plant_data = search_plants(question, limit=max_plants)
        return (
            build_plant_system_prompt(plant_data),
            [],
            plant_data,
            intent,
            False,
        )

    if intent == "law":
        if count_law_articles()["article_count"] == 0:
            return ("", [], [], intent, True)
        limit = (
            min(max_law_articles, DEEP_THINK_LAW_LIMIT)
            if modes.get("deep_think")
            else max_law_articles
        )
        limit = max(1, limit)
        try:
            law_sources = get_law_sources(question, model, limit=limit)
        except Exception as error:
            _log(f"law search failed: {error}")
            law_sources = []
        sources = []
        for source in law_sources:
            citation = {
                "law_name": source["law_name"],
                "article_num": source["article_num"],
                "page_num": source["page_num"],
                "country": source.get("country") or "MA",
            }
            sub_law = source.get("sub_law")
            if isinstance(sub_law, str) and sub_law.strip():
                citation["sub_law"] = sub_law.strip()
            sources.append(citation)
        sources = deduplicate_sources(sources)
        return (
            build_law_system_prompt(law_sources),
            sources,
            [],
            intent,
            False,
        )

    return build_general_system_prompt(), [], [], intent, False


def run_chat(
    model: str,
    question: str,
    messages: list[dict[str, Any]],
    modes: dict[str, bool],
    emit: Emit,
    req_id: Any,
    thinking_parts: list[str] | None = None,
    attachments: list[dict[str, object]] | None = None,
    document_chunks: list[str] | None = None,
    image_attachments: list[dict[str, Any]] | None = None,
    skill: str | None = None,
    max_law_articles: int = DEFAULT_LAW_LIMIT,
    max_plants: int | None = None,
    num_predict: int | None = None,
    extractive: bool = False,
    title: str = "Report",
) -> dict[str, Any]:
    """Run one chat turn and return the answer plus citation payloads.

    Web mode replaces local RAG when results are available. If the search
    returns nothing, the normal intent route runs and the answer says the web
    search found no usable results.
    Reasoning is accumulated into `thinking_parts` so the caller can persist
    it even when generation fails partway through.
    """
    command_parts = question.strip().split(maxsplit=1)
    command = command_parts[0] if command_parts else ""
    argument = command_parts[1].strip() if len(command_parts) > 1 else ""

    if command == "/help":
        emit({"type": "chat_chunk", "id": req_id, "content": HELP_RESPONSE})
        return {
            "answer": HELP_RESPONSE,
            "sources": [],
            "plant_data": [],
            "site_data": None,
            "intent": "help",
            "web_used": False,
            "thinking": "",
        }

    if command == "/site":
        location = argument
        if not location:
            answer = 'Use /site "location" to look up a site.'
            emit({"type": "chat_chunk", "id": req_id, "content": answer})
            return {
                "answer": answer,
                "sources": [],
                "plant_data": [],
                "site_data": None,
                "intent": "site",
                "web_used": False,
                "thinking": "",
            }
        emit({
            "type": "chat_step",
            "id": req_id,
            "step": "searching OpenStreetMap · reading the web · drafting",
        })
        location_data = search_location(location)
        if location_data.get("error") == "no_internet":
            answer = "No internet connection. Please check your connection and try again."
            emit({"type": "chat_chunk", "id": req_id, "content": answer})
            return {
                "answer": answer,
                "sources": [],
                "plant_data": [],
                "site_data": None,
                "intent": "site",
                "web_used": False,
                "thinking": "",
            }
        if location_data.get("error") == "no_match":
            answer = "No match on OpenStreetMap. Try another spelling, or add the city."
            emit({"type": "chat_chunk", "id": req_id, "content": answer})
            return {
                "answer": answer,
                "sources": [],
                "plant_data": [],
                "site_data": None,
                "intent": "site",
                "web_used": False,
                "thinking": "",
            }
        context = fetch_site_context(location_data["display_name"])
        site_data = {
            "display_name": location_data["display_name"],
            "lat": location_data["lat"],
            "lon": location_data["lon"],
            "type": location_data.get("type", "site"),
            "boundingbox": location_data.get("boundingbox"),
            "geojson": location_data.get("geojson"),
            "plants": context.get("plants", ""),
            "water": context.get("water", ""),
            "notes": context.get("notes", ""),
        }
        return {
            "answer": "Here is the site information:",
            "sources": [],
            "plant_data": [],
            "site_data": site_data,
            "intent": "site",
            "web_used": False,
            "thinking": "",
        }

    if command == "/plant":
        if not argument:
            answer = 'Use /plant "name" to look up a plant.'
            emit({"type": "chat_chunk", "id": req_id, "content": answer})
            plant_data: list[dict[str, Any]] = []
        else:
            plant_data = search_plants(argument, strict=True)
            answer = "" if plant_data else "Not in the table."
            if answer:
                emit({"type": "chat_chunk", "id": req_id, "content": answer})
        return {
            "answer": answer,
            "sources": [],
            "plant_data": plant_data,
            "site_data": None,
            "intent": "plant_lookup",
            "web_used": False,
            "thinking": "",
        }

    if thinking_parts is None:
        thinking_parts = []

    if skill is not None:
        if skill not in {"pdf", "word", "excel"}:
            raise ValueError("The skill must be one of: pdf, word, excel.")
        web_results: list[dict[str, Any]] = []
        web_sources: list[dict[str, str]] = []
        try:
            emit({
                "type": "chat_step",
                "id": req_id,
                "step": "Generating your document...",
            })
            if modes.get("web"):
                emit({"type": "chat_step", "id": req_id, "step": "searching web"})
                web_results = search_web(question, max_results=3)
                emit({"type": "chat_step", "id": req_id, "step": "checking results"})
            web_sources = web_sources_from_results(web_results or [])
            context_text = "\n\n".join(
                f"{result.get('title', '')}\n{result.get('snippet', '')}\n"
                f"{result.get('url', '')}"
                for result in web_results
            )
            context = {"text": context_text} if context_text else None
            file_path = generate_document(
                skill,
                question,
                messages,
                model,
                context,
                title,
                modes=modes,
            )
        except RuntimeError as error:
            answer = str(error)
            emit({"type": "chat_chunk", "id": req_id, "content": answer})
            return {
                "answer": answer,
                "sources": [],
                "plant_data": [],
                "site_data": None,
                "intent": "skill",
                "web_used": bool(web_results),
                "web_sources": web_sources,
                "thinking": "",
                "generated_file_path": None,
                "generated_file_size": None,
                "generated_file_type": None,
            }
        file_size = os.path.getsize(file_path)
        answer = (
            f"Created your {skill.upper() if skill != 'word' else 'Word'} "
            "document."
        )
        emit({"type": "chat_chunk", "id": req_id, "content": answer})
        file_types = {
            "pdf": "PDF",
            "word": "DOCX",
            "excel": "XLSX",
        }
        return {
            "answer": answer,
            "sources": [],
            "plant_data": [],
            "site_data": None,
            "intent": "skill",
            "web_used": bool(web_results),
            "web_sources": web_sources,
            "thinking": "",
            "generated_file_path": file_path,
            "generated_file_size": file_size,
            "generated_file_type": file_types[skill],
        }

    forgot_format = re.search(
        r"\b(?:make|create|generate|write|export)\b.*\b(pdf|word(?:\s+doc(?:ument)?)?|excel|xlsx)\b"
        r"|\b(?:as|into|to)\s+(pdf|word|excel|xlsx)\b",
        question,
        re.IGNORECASE,
    )
    if forgot_format:
        answer = SKILL_INSTRUCTION
        emit({"type": "chat_chunk", "id": req_id, "content": answer})
        return {
            "answer": answer,
            "sources": [],
            "plant_data": [],
            "site_data": None,
            "intent": "skill_instruction",
            "web_used": False,
            "thinking": "",
            "generated_file_path": None,
        }

    if image_attachments and not model_supports_vision(model):
        answer = IMAGE_UNSUPPORTED
        emit({"type": "chat_chunk", "id": req_id, "content": answer})
        return {
            "answer": answer,
            "sources": [],
            "plant_data": [],
            "site_data": None,
            "intent": "document",
            "web_used": False,
            "thinking": "",
            "generated_file_path": None,
        }

    if attachments:
        answer = run_document_qa(
            model,
            question,
            document_chunks or [],
            image_attachments or [],
            emit,
            req_id,
        )
        emit({"type": "chat_chunk", "id": req_id, "content": answer})
        return {
            "answer": answer,
            "sources": [],
            "plant_data": [],
            "site_data": None,
            "intent": "document",
            "web_used": False,
            "thinking": "",
            "generated_file_path": None,
        }

    web_results: list[dict[str, Any]] = []
    web_sources: list[dict[str, str]] = []
    if modes.get("web"):
        emit({"type": "chat_step", "id": req_id, "step": "searching web"})
        web_results = search_web(question, max_results=3)
        web_sources = web_sources_from_results(web_results)
        if web_results:
            emit({"type": "chat_step", "id": req_id, "step": "reading sources"})

    if web_results:
        system_prompt = build_web_system_prompt(web_results)
        sources: list[dict[str, Any]] = []
        plant_data: list[dict[str, Any]] = []
        intent = "web"
    else:
        system_prompt, sources, plant_data, intent, empty_law = _retrieved_response(
            question, model, modes, max_law_articles, max_plants
        )
        if empty_law:
            emit({"type": "chat_chunk", "id": req_id, "content": EMPTY_LAW_LIBRARY})
            return {
                "answer": EMPTY_LAW_LIBRARY,
                "sources": [],
                "plant_data": [],
                "site_data": None,
                "intent": intent,
                "web_used": False,
                "thinking": "",
                "generated_file_path": None,
            }
        if modes.get("web"):
            system_prompt = f"{system_prompt}\n\n{WEB_EMPTY_PROMPT}"

    if extractive and intent == "law":
        system_prompt = f"{system_prompt}\n\n{EXTRACTIVE_INSTRUCTION}"

    full_messages = [{"role": "system", "content": system_prompt}, *messages]
    if modes.get("web") and not web_results:
        prefix = WEB_EMPTY_PREFIX
    else:
        prefix = ""

    answer_options = (
        {**ANSWER_OPTIONS, "num_predict": num_predict}
        if num_predict is not None
        else None
    )

    if modes.get("deep_think"):
        answer = run_deep_think(
            model=model,
            messages=full_messages,
            emit=emit,
            req_id=req_id,
            prefix=prefix,
            thinking_parts=thinking_parts,
            num_predict=num_predict,
        )
    else:
        emit({"type": "chat_step", "id": req_id, "step": "drafting"})
        answer = stream_answer(
            model=model,
            messages=full_messages,
            think=modes.get("think", False),
            emit=emit,
            req_id=req_id,
            prefix=prefix,
            thinking_parts=thinking_parts,
            options=answer_options,
        )

    return {
        "answer": answer,
        "sources": sources,
        "plant_data": plant_data,
        "site_data": None,
        "web_sources": web_sources,
        "intent": intent,
        "web_used": bool(web_results),
        "thinking": "".join(thinking_parts),
        "generated_file_path": None,
    }
