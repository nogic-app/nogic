import json
import logging
import os
import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import ollama

from chat_modes import get_chat_modes
from chat_pipeline import run_chat
from db import (
    create_chat as persist_chat,
    create_project as persist_project,
    add_chat_to_project,
    count_law_articles,
    get_connection,
    get_messages,
    get_settings,
    init_db,
    rename_chat,
    rename_project,
    save_message,
    save_setting,
    delete_project as remove_project,
    set_chat_pinned,
    set_project_pinned,
    DB_PATH,
)
from document_processor import process_attachments
from errors import classify
from export_engine import export_chat_docx, export_chat_excel, export_chat_pdf
# Re-exported for backend/test_evals.py, which imports these from main.
from law_prompts import build_law_system_prompt  # noqa: F401
from law_query import get_law_sources  # noqa: F401
from law_ingest import (
    TESSERACT_DLL_ERROR_MESSAGE,
    TesseractDependencyError,
    backfill_recueil_sub_laws,
    warn_if_tesseract_missing,
)
from law_upload import NO_EXTRACTABLE_LAW_TEXT, add_law
from model_actions import handle_model_action, start_speed_test
from plant_search import search_plants
from plant_upload import add_plant
from runtime_paths import (
    APP_DATA_ROOT,
    BUNDLED_DATA_DIR,
    DATA_DIR,
    IS_FROZEN,
    prepare_runtime_data,
)
from site_search import fetch_site_context, search_location
from tier_config import budget_for_hardware
import session_logger
import log_setup
from system_actions import (
    check_tesseract,
    download_portable_tesseract,
    remove_tesseract,
)

logger = logging.getLogger(__name__)


def emit_error(request_id: object, error: Exception) -> dict[str, object]:
    logger.error(
        "Sidecar request failed: %s",
        error,
        exc_info=(type(error), error, error.__traceback__),
    )
    payload = classify(error)
    error_message = {
        "type": "error",
        "id": request_id,
        "error": payload["message"],
        "payload": payload,
    }
    if isinstance(error, ValueError) and str(error) == NO_EXTRACTABLE_LAW_TEXT:
        error_message["userMessage"] = NO_EXTRACTABLE_LAW_TEXT
    elif isinstance(error, TesseractDependencyError):
        payload["message"] = TESSERACT_DLL_ERROR_MESSAGE
        error_message["error"] = TESSERACT_DLL_ERROR_MESSAGE
        error_message["userMessage"] = TESSERACT_DLL_ERROR_MESSAGE
    elif (
        isinstance(error, ValueError)
        and "already exists in the library." in str(error)
    ):
        payload["message"] = str(error)
        error_message["error"] = str(error)
        error_message["userMessage"] = str(error)
    print(json.dumps(error_message), flush=True)
    return payload


def memory_files_directory() -> Path:
    directory = APP_DATA_ROOT / "memory" / "files"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def get_saved_files() -> list[dict[str, object]]:
    files = []
    for path in memory_files_directory().iterdir():
        if not path.is_file():
            continue
        stat = path.stat()
        files.append({
            "name": path.name,
            "size": stat.st_size,
            "type": path.suffix.removeprefix(".").upper() or "FILE",
            "date": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
        })
    return sorted(files, key=lambda item: str(item["date"]), reverse=True)


def _require_temp_source(source: Path) -> Path:
    """Resolve `source` and refuse anything outside the system temp directory."""
    resolved = source.resolve()
    temp_root = Path(tempfile.gettempdir()).resolve()
    try:
        resolved.relative_to(temp_root)
    except ValueError:
        raise ValueError(
            "Only files staged in the system temporary directory can be saved."
        ) from None
    return resolved


def save_memory_file(file_path: str) -> dict[str, object]:
    try:
        source = Path(file_path).expanduser()
        if not source.is_file():
            raise ValueError(f"File not found: {file_path}")
        source = _require_temp_source(source)
        destination = memory_files_directory() / source.name
        shutil.copy2(source, destination)
        return {
            "name": destination.name,
            "size": destination.stat().st_size,
            "type": destination.suffix.removeprefix(".").upper() or "FILE",
            "date": datetime.fromtimestamp(destination.stat().st_mtime).isoformat(timespec="seconds"),
        }
    except Exception:
        logger.exception("Could not save the requested memory file.")
        raise


def resolve_chat_model(request: dict[str, object]) -> str:
    """Pick the model for a chat request without silently assuming a default."""
    requested = request.get("model")
    if isinstance(requested, str) and requested.strip():
        return requested.strip()

    saved = get_settings().get("activeModel")
    if isinstance(saved, str) and saved.strip():
        return saved.strip()

    try:
        installed = ollama.list().models
    except Exception:
        logger.exception("Could not list installed Ollama models.")
        installed = []

    for entry in installed:
        name = getattr(entry, "model", None)
        if isinstance(name, str) and name.strip():
            return name.strip()

    raise ValueError("No model is selected. Choose a model in Settings.")


def factory_reset() -> None:
    if Path(DB_PATH).exists():
        Path(DB_PATH).unlink()
    memory_directory = APP_DATA_ROOT / "memory"
    if memory_directory.exists():
        shutil.rmtree(memory_directory)

    if IS_FROZEN:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        runtime_laws = DATA_DIR / "laws"
        if runtime_laws.exists():
            shutil.rmtree(runtime_laws)
        bundled_laws = BUNDLED_DATA_DIR / "laws"
        if bundled_laws.exists():
            shutil.copytree(bundled_laws, runtime_laws)
        bundled_plants = BUNDLED_DATA_DIR / "plants.json"
        runtime_plants = DATA_DIR / "plants.json"
        if runtime_plants.exists():
            runtime_plants.unlink()
        if bundled_plants.exists():
            shutil.copy2(bundled_plants, runtime_plants)

def main():
    # Tauri writes UTF-8 to the sidecar's stdin. Windows otherwise decodes the
    # pipe with the legacy ANSI code page, turning "câprier" into "cÃ¢prier".
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    log_setup.init()
    prepare_runtime_data()
    warn_if_tesseract_missing()
    init_db()
    backfill_recueil_sub_laws()
    # Ensure the memory directory exists so "Open folder" in Settings never
    # fails with a missing-directory OS error. Tauri's appDataDir() resolves to
    # %APPDATA%\com.nogic.app (the bundle identifier), so create that exact
    # folder tree rather than a separate ~/.nogic one.
    os.makedirs(APP_DATA_ROOT / "memory", exist_ok=True)
    print(json.dumps({
        "type": "status",
        "message": "Starting Ollama check...",
    }), flush=True)
    try:
        ollama.list()
    except Exception:
        logger.exception("Initial Ollama check failed.")
    print(json.dumps({"type": "status", "message": "Python sidecar ready"}), flush=True)

    for line in sys.stdin:
        action = "unknown"
        req: dict[str, object] = {}
        req_id: object = None
        try:
            req = json.loads(line)
            action = req.get("action")
            req_id = req.get("id")

            if action == "ping":
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": {"message": "pong"},
                }), flush=True)

            elif action == "check_tesseract":
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": check_tesseract(),
                }), flush=True)

            elif action == "download_portable_tesseract":
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": download_portable_tesseract(),
                }), flush=True)

            elif action == "remove_tesseract":
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": remove_tesseract(),
                }), flush=True)

            elif action == "get_projects":
                with get_connection() as conn:
                    rows = conn.execute(
                        "SELECT id, name, created_at, is_pinned FROM projects "
                        "ORDER BY is_pinned DESC, created_at DESC"
                    ).fetchall()
                projects = [
                    {
                        "id": row["id"],
                        "name": row["name"],
                        "date": row["created_at"],
                        "is_pinned": bool(row["is_pinned"]),
                    }
                    for row in rows
                ]
                print(json.dumps({
                    "type": "projects",
                    "id": req_id,
                    "data": projects
                }), flush=True)

            elif action == "get_saved_files":
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": get_saved_files(),
                }), flush=True)

            elif action == "get_settings":
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": get_settings(),
                }), flush=True)

            elif action == "get_diagnostics":
                app_version = req.get("app_version")
                hardware = req.get("hardware")
                if not isinstance(app_version, str) or not app_version.strip():
                    raise ValueError("The app version is required.")
                if not isinstance(hardware, dict):
                    raise ValueError("Hardware information is required.")
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": session_logger.get_diagnostics(
                        app_version.strip(), hardware
                    ),
                }), flush=True)

            elif action == "save_setting":
                key = req.get("key")
                value = req.get("value")
                if not isinstance(key, str) or not key.strip():
                    raise ValueError("The setting key must be a non-empty string.")
                if not isinstance(value, str):
                    raise ValueError("The setting value must be a string.")
                save_setting(key.strip(), value)
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": {"success": True, "key": key.strip()},
                }), flush=True)

            elif action == "get_law_status":
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": count_law_articles(),
                }), flush=True)

            elif action == "save_memory_file":
                file_path = req.get("file_path")
                if not isinstance(file_path, str) or not file_path.strip():
                    raise ValueError("The file path is required.")
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": save_memory_file(file_path),
                }), flush=True)

            elif action == "delete_memory":
                categories = req.get("categories")
                if (
                    not isinstance(categories, list)
                    or not all(isinstance(category, str) for category in categories)
                ):
                    raise ValueError("The categories value must be a list of strings.")
                selected = set(categories)
                unknown = selected - {"files", "chats"}
                if unknown:
                    raise ValueError(f"Unknown memory categories: {', '.join(sorted(unknown))}")
                if "files" in selected:
                    files_directory = memory_files_directory()
                    for path in files_directory.iterdir():
                        if path.is_file():
                            path.unlink()
                        elif path.is_dir():
                            shutil.rmtree(path)
                if "chats" in selected:
                    with get_connection() as conn:
                        conn.execute("DELETE FROM messages")
                        conn.execute("DELETE FROM chats")
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": {"success": True, "categories": sorted(selected)},
                }), flush=True)

            elif action == "factory_reset":
                factory_reset()
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": {"success": True},
                }), flush=True)

            elif action == "get_chats":
                with get_connection() as conn:
                    rows = conn.execute(
                        "SELECT id, title, project_id, created_at, is_pinned FROM chats "
                        "ORDER BY is_pinned DESC, created_at DESC"
                    ).fetchall()
                chats = [
                    {
                        "id": row["id"],
                        "title": row["title"],
                        "project_id": row["project_id"],
                        "created_at": row["created_at"],
                        "is_pinned": bool(row["is_pinned"]),
                    }
                    for row in rows
                ]
                print(json.dumps({
                    "type": "chats",
                    "id": req_id,
                    "data": chats
                }), flush=True)

            elif action == "delete_chat":
                chat_id = req.get("chat_id")
                if not isinstance(chat_id, str):
                    raise ValueError("The chat_id must be a string.")
                with get_connection() as conn:
                    conn.execute("DELETE FROM messages WHERE chat_id = ?", (chat_id,))
                    conn.execute("DELETE FROM chats WHERE id = ?", (chat_id,))
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": {"success": True, "chat_id": chat_id},
                }), flush=True)

            elif action in ("pin_chat", "pin_project"):
                item_id = req.get("chat_id" if action == "pin_chat" else "project_id")
                is_pinned = req.get("is_pinned")
                if not isinstance(item_id, str) or not item_id.strip():
                    raise ValueError("The item id must be a non-empty string.")
                if not isinstance(is_pinned, bool):
                    raise ValueError("The is_pinned value must be boolean.")
                updated = (
                    set_chat_pinned(item_id, is_pinned)
                    if action == "pin_chat"
                    else set_project_pinned(item_id, is_pinned)
                )
                if not updated:
                    raise ValueError("The requested item was not found.")
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": {"success": True, "is_pinned": is_pinned},
                }), flush=True)

            elif action in ("rename_chat", "rename_project"):
                item_id = req.get("chat_id" if action == "rename_chat" else "project_id")
                field_name = "new_title" if action == "rename_chat" else "new_name"
                new_name = req.get(field_name)
                if not isinstance(item_id, str) or not item_id.strip():
                    raise ValueError("The item id must be a non-empty string.")
                if not isinstance(new_name, str) or not new_name.strip():
                    raise ValueError("The new name must be a non-empty string.")
                renamed = (
                    rename_chat(item_id, new_name.strip())
                    if action == "rename_chat"
                    else rename_project(item_id, new_name.strip())
                )
                if not renamed:
                    raise ValueError("The requested item was not found.")
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": {
                        "success": True,
                        "chat_id" if action == "rename_chat" else "project_id": item_id,
                        "new_title" if action == "rename_chat" else "new_name": new_name.strip(),
                    },
                }), flush=True)

            elif action == "delete_project":
                project_id = req.get("project_id")
                if not isinstance(project_id, str) or not project_id.strip():
                    raise ValueError("The project_id must be a non-empty string.")
                if not remove_project(project_id):
                    raise ValueError("The requested project was not found.")
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": {"success": True, "project_id": project_id},
                }), flush=True)

            elif action == "create_project":
                name = req.get("name")
                chat_ids = req.get("chat_ids", [])
                if not isinstance(name, str) or not name.strip():
                    raise ValueError("The project name must be a non-empty string.")
                if (
                    not isinstance(chat_ids, list)
                    or not all(isinstance(chat_id, str) for chat_id in chat_ids)
                ):
                    raise ValueError("The chat_ids value must be a list of strings.")
                project = persist_project(name.strip(), chat_ids)
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": {
                        "id": project["id"],
                        "name": project["name"],
                        "date": project["created_at"],
                        "is_pinned": project["is_pinned"],
                    },
                }), flush=True)

            elif action == "add_chat_to_project":
                chat_id = req.get("chat_id")
                project_id = req.get("project_id")
                if not isinstance(chat_id, str) or not chat_id.strip():
                    raise ValueError("The chat_id must be a non-empty string.")
                if not isinstance(project_id, str) or not project_id.strip():
                    raise ValueError("The project_id must be a non-empty string.")
                add_chat_to_project(chat_id, project_id)
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": {"success": True, "chat_id": chat_id, "project_id": project_id},
                }), flush=True)

            elif action in ("export_pdf", "export_word"):
                chat_id = req.get("chat_id")
                if not isinstance(chat_id, str) or not chat_id.strip():
                    raise ValueError("The chat_id must be a non-empty string.")
                file_path = (
                    export_chat_pdf(chat_id)
                    if action == "export_pdf"
                    else export_chat_docx(chat_id)
                )
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": {
                        "success": True,
                        "chat_id": chat_id,
                        "format": "pdf" if action == "export_pdf" else "word",
                        "file_path": file_path,
                    },
                }), flush=True)

            elif action == "generate_report":
                chat_id = req.get("chat_id")
                fmt = req.get("format")
                if not isinstance(chat_id, str) or not chat_id.strip():
                    raise ValueError("The chat_id must be a non-empty string.")
                if fmt not in ("pdf", "word", "excel"):
                    raise ValueError("The format must be one of: pdf, word, excel.")
                if fmt == "pdf":
                    file_path = export_chat_pdf(chat_id)
                elif fmt == "word":
                    file_path = export_chat_docx(chat_id)
                else:
                    file_path = export_chat_excel(chat_id)
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": {
                        "success": True,
                        "chat_id": chat_id,
                        "format": fmt,
                        "file_path": file_path,
                    },
                }), flush=True)

            elif action == "add_law":
                file_path = req.get("file_path")
                raw_law_name = req.get("law_name")
                country = req.get("country", "MA")
                if not isinstance(file_path, str) or not file_path.strip():
                    raise ValueError("The PDF file path is required.")
                if not isinstance(raw_law_name, str):
                    raise ValueError("The law name is required.")
                if not isinstance(country, str):
                    raise ValueError("The country code is required.")
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": add_law(file_path, raw_law_name, country),
                }), flush=True)

            elif action == "add_plant":
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": add_plant(
                        latin_name=req.get("latin_name"),
                        common_name=req.get("common_name"),
                        water_need=req.get("water_need"),
                        sun_exposure=req.get("sun_exposure"),
                        source_name=req.get("source_name"),
                        source_url=req.get("source_url"),
                        source_quote=req.get("source_quote"),
                    ),
                }), flush=True)

            elif action == "search_plants":
                query = req.get("query", req.get("name"))
                if not isinstance(query, str) or not query.strip():
                    raise ValueError("The plant name is required.")
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": search_plants(query.strip(), strict=True),
                }), flush=True)

            elif action == "/site" or action == "site_lookup":
                location = req.get("query") or req.get("location") or req.get("name")
                if not isinstance(location, str):
                    raise ValueError("The location query is required.")
                location = location.strip()
                if not location:
                    raise ValueError("The location query is required.")
                print(json.dumps({"type": "chat_step", "id": req_id, "step": "searching OpenStreetMap · reading the web · drafting"}), flush=True)
                os_result = search_location(location)
                if os_result.get("error") == "no_internet":
                    print(json.dumps({"type": "response", "id": req_id, "data": {"error": "no_internet"}}), flush=True)
                    continue
                if os_result.get("error") in {"no_match", "no_internet"}:
                    print(json.dumps({"type": "response", "id": req_id, "data": {"error": "no_match"}}), flush=True)
                    continue
                context = fetch_site_context(os_result["display_name"])
                payload = {
                    "display_name": os_result["display_name"],
                    "lat": os_result["lat"],
                    "lon": os_result["lon"],
                    "type": os_result.get("type", "site"),
                    "boundingbox": os_result.get("boundingbox"),
                    "geojson": os_result.get("geojson"),
                    "plants": context.get("plants", ""),
                    "water": context.get("water", ""),
                    "notes": context.get("notes", ""),
                }
                print(json.dumps({
                    "type": "chat_done",
                    "id": req_id,
                    "site_data": payload,
                    "content": "Here is the site information:",
                    "sources": [],
                    "plant_data": [],
                    "thinking": "",
                }), flush=True)
                continue

            elif action in (
                "get_ollama_status",
                "get_installed_models",
                "get_loaded_models",
                "get_model_capabilities",
                "pull_model",
                "cancel_pull",
            ):
                handle_model_action(action, req)

            elif action == "run_speed_test":
                start_speed_test(req_id, resolve_chat_model(req))

            elif action == "create_chat":
                project_id = req.get("project_id")
                if project_id is not None:
                    if not isinstance(project_id, str) or not project_id.strip():
                        raise ValueError("The project_id must be a non-empty string or null.")
                    with get_connection() as conn:
                        project = conn.execute(
                            "SELECT id FROM projects WHERE id = ?", (project_id,)
                        ).fetchone()
                    if project is None:
                        raise ValueError("The requested project was not found.")
                chat = persist_chat(project_id, "New Chat")
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": chat,
                }), flush=True)

            elif action == "get_history":
                chat_id = req.get("chat_id", "chat_1")
                if not isinstance(chat_id, str):
                    raise ValueError("The chat_id must be a string.")
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": get_messages(chat_id),
                }), flush=True)

            elif action == "check_file_exists":
                file_path = req.get("file_path")
                if not isinstance(file_path, str) or not file_path.strip():
                    raise ValueError("A file_path is required.")
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": Path(file_path).expanduser().is_file(),
                }), flush=True)

            elif action == "save_generated_file":
                file_path = req.get("file_path")
                destination_path = req.get("destination_path")
                if not isinstance(file_path, str) or not file_path.strip():
                    raise ValueError("A generated file path is required.")
                if not isinstance(destination_path, str) or not destination_path.strip():
                    raise ValueError("A destination path is required.")
                source = Path(file_path).expanduser()
                destination = Path(destination_path).expanduser()
                if not source.is_file():
                    raise FileNotFoundError(f"The generated file no longer exists: {file_path}")
                shutil.copy2(source, destination)
                print(json.dumps({
                    "type": "response",
                    "id": req_id,
                    "data": str(destination),
                }), flush=True)

            elif action == "chat":
                chat_id = req.get("chat_id", "chat_1")
                if not isinstance(chat_id, str):
                    raise ValueError("The chat_id must be a string.")
                model = resolve_chat_model(req)
                modes = get_chat_modes(req)
                tier, budget = budget_for_hardware(req.get("hardware"))
                logger.info("Chat request using hardware tier %s", tier)
                messages = req.get("messages", [])
                user_message = next(
                    (
                        message for message in reversed(messages)
                        if message.get("role") == "user"
                    ),
                    None,
                )
                if user_message is None or not isinstance(user_message.get("content"), str):
                    raise ValueError("Chat request must include a user message.")
                user_message_content = user_message["content"]
                raw_skill = req.get("skill")
                if raw_skill is not None and raw_skill not in {"pdf", "word", "excel"}:
                    raise ValueError("The skill must be one of: pdf, word, excel.")
                skill = raw_skill if isinstance(raw_skill, str) else None
                saved_attachments, document_chunks, image_attachments = process_attachments(
                    req.get("attachments"), memory_files_directory()
                )
                prompt_content = user_message_content
                with get_connection() as conn:
                    chat = conn.execute(
                        "SELECT title FROM chats WHERE id = ?",
                        (chat_id,),
                    ).fetchone()
                    if chat is None:
                        raise ValueError("The requested chat no longer exists. Start a new chat.")
                    chat_title = str(chat["title"])
                    if chat["title"] == "New Chat":
                        new_title = user_message_content[:30] + "..."
                        result = conn.execute(
                            "UPDATE chats SET title = ? WHERE id = ? AND title = 'New Chat'",
                            (new_title, chat_id),
                        )
                        if result.rowcount == 1:
                            chat_title = new_title
                            print(json.dumps({
                                "type": "chat_title_updated",
                                "id": req_id,
                                "data": {"chat_id": chat_id, "new_title": new_title},
                            }), flush=True)
                save_message(
                    chat_id,
                    "user",
                    user_message_content,
                    attachments=saved_attachments,
                    skill=skill,
                )

                print(json.dumps({"type": "chat_start", "id": req_id}), flush=True)

                thinking_parts: list[str] = []
                result = {
                    "answer": "",
                    "sources": [],
                    "plant_data": [],
                    "site_data": None,
                    "web_sources": [],
                    "thinking": "",
                }
                try:
                    result = run_chat(
                        model=model,
                        question=prompt_content,
                        messages=[
                            {
                                **message,
                                "content": (
                                    prompt_content
                                    if message is user_message
                                    else message.get("content", "")
                                ),
                            }
                            for message in messages
                        ],
                        modes=modes,
                        attachments=saved_attachments,
                        document_chunks=document_chunks,
                        image_attachments=image_attachments,
                        emit=lambda event: print(json.dumps(event), flush=True),
                        req_id=req_id,
                        thinking_parts=thinking_parts,
                        skill=skill,
                        max_law_articles=budget["max_law_articles"],
                        max_plants=budget["max_plants"],
                        num_predict=budget["num_predict"],
                        extractive=budget["extractive"],
                        title=chat_title,
                    )
                except Exception as error:
                    payload = emit_error(req_id, error)
                    # Keep the bubble consistent with what the frontend shows.
                    if not result["answer"]:
                        result["answer"] = str(payload["message"])
                finally:
                    # `chat_done` is the frontend's completion signal and drives
                    # the final message render. It must be sent even when the
                    # multi-pass loop (or persistence) fails.
                    result["thinking"] = (
                        result.get("thinking") or "".join(thinking_parts)
                    )
                    try:
                        save_message(
                            chat_id,
                            "assistant",
                            result["answer"],
                            result["sources"],
                            result["plant_data"],
                            result.get("site_data"),
                            result["thinking"],
                            file_path=result.get("generated_file_path"),
                            web_sources=result.get("web_sources", []),
                            file_size=result.get("generated_file_size"),
                            file_type=result.get("generated_file_type"),
                        )
                    except Exception:
                        logger.exception("Failed to save the assistant message.")
                    print(json.dumps({
                        "type": "chat_done",
                        "id": req_id,
                        # The full accumulated answer. The frontend uses it to
                        # replace the streaming placeholder, so a dropped or
                        # empty chunk can never leave an empty bubble.
                        "content": result["answer"],
                        "thinking": result["thinking"],
                        "sources": result["sources"],
                        "plant_data": result["plant_data"],
                        "site_data": result.get("site_data"),
                        "web_sources": result.get("web_sources", []),
                        "attachments": saved_attachments,
                        "file_path": result.get("generated_file_path"),
                        "file_size": result.get("generated_file_size"),
                        "file_type": result.get("generated_file_type"),
                    }), flush=True)

        except Exception as error:
            emit_error(req_id, error)

if __name__ == "__main__":
    main()
