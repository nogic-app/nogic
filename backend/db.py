# backend/db.py
import sqlite3
import os
import json
import hashlib
import re
import sys
import unicodedata
from contextlib import contextmanager
from datetime import datetime
from uuid import uuid4

from runtime_paths import IS_FROZEN
from source_dedup import deduplicate_sources, preferred_law_name

# For development, we'll save the database in the backend folder.
if IS_FROZEN:
    DB_PATH = os.path.join(
        os.getenv("APPDATA"), "com.nogic.app", "nogic.db"
    )
else:
    DB_PATH = os.path.join(os.path.dirname(__file__), "nogic.db")

COUNTRY_HASH_MIGRATION_KEY = "law_country_hash_migration_v1"


def law_article_hash(content: str, country: str) -> str:
    normalized = " ".join(content.split())
    return hashlib.sha256(
        f"{country}\0{normalized}".encode("utf-8")
    ).hexdigest()


@contextmanager
def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    except BaseException:
        conn.rollback()
        raise
    else:
        conn.commit()
    finally:
        conn.close()

def init_db():
    with get_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                is_pinned INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS chats (
                id TEXT PRIMARY KEY,
                project_id TEXT,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                is_pinned INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                chat_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                sources TEXT,
                plant_data TEXT,
                site_data TEXT,
                web_sources TEXT,
                thinking TEXT,
                attachments TEXT,
                file_path TEXT,
                file_size INTEGER,
                file_type TEXT,
                skill TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (chat_id) REFERENCES chats(id)
            );

            CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE IF NOT EXISTS law_article_hashes (
                content_hash TEXT PRIMARY KEY,
                law_name TEXT NOT NULL,
                article_num TEXT NOT NULL,
                page_num INTEGER NOT NULL,
                country TEXT NOT NULL DEFAULT 'MA'
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS law_articles USING fts5(
                law_name,
                article_num,
                content,
                page_num UNINDEXED,
                sub_law UNINDEXED,
                country UNINDEXED,
                tokenize='unicode61 remove_diacritics 2'
            );
        """)

        # FTS5 virtual tables cannot be altered in place, so rebuild when a
        # schema is missing either metadata column.
        law_columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(law_articles)")
        }
        if law_columns and not {"sub_law", "country"}.issubset(law_columns):
            legacy_sub_law = "sub_law" if "sub_law" in law_columns else "NULL"
            legacy_country = "country" if "country" in law_columns else "'MA'"
            conn.execute("ALTER TABLE law_articles RENAME TO law_articles_legacy")
            conn.execute(
                """
                CREATE VIRTUAL TABLE law_articles USING fts5(
                    law_name,
                    article_num,
                    content,
                    page_num UNINDEXED,
                    sub_law UNINDEXED,
                    country UNINDEXED,
                    tokenize='unicode61 remove_diacritics 2'
                )
                """
            )
            conn.execute(
                "INSERT INTO law_articles "
                "(law_name, article_num, content, page_num, sub_law, country) "
                "SELECT law_name, article_num, content, page_num, "
                f"{legacy_sub_law}, {legacy_country} "
                "FROM law_articles_legacy"
            )
            conn.execute("DROP TABLE law_articles_legacy")

        hash_columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(law_article_hashes)")
        }
        if "country" not in hash_columns:
            conn.execute(
                "ALTER TABLE law_article_hashes "
                "ADD COLUMN country TEXT NOT NULL DEFAULT 'MA'"
            )
        conn.execute(
            "UPDATE law_articles SET country = 'MA' "
            "WHERE country IS NULL OR country = ''"
        )
        hash_migration = conn.execute(
            "SELECT 1 FROM settings WHERE key = ?",
            (COUNTRY_HASH_MIGRATION_KEY,),
        ).fetchone()
        if not hash_migration:
            law_rows = conn.execute(
                "SELECT law_name, article_num, content, page_num, country "
                "FROM law_articles"
            ).fetchall()
            conn.execute("DELETE FROM law_article_hashes")
            for law_row in law_rows:
                country = law_row["country"] or "MA"
                conn.execute(
                    "INSERT OR IGNORE INTO law_article_hashes "
                    "(content_hash, law_name, article_num, page_num, country) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (
                        law_article_hash(law_row["content"], country),
                        law_row["law_name"],
                        law_row["article_num"],
                        law_row["page_num"],
                        country,
                    ),
                )
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, 'done') "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (COUNTRY_HASH_MIGRATION_KEY,),
            )

        message_columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(messages)")
        }
        if "sources" not in message_columns:
            conn.execute("ALTER TABLE messages ADD COLUMN sources TEXT")
        if "plant_data" not in message_columns:
            conn.execute("ALTER TABLE messages ADD COLUMN plant_data TEXT")
        if "site_data" not in message_columns:
            conn.execute("ALTER TABLE messages ADD COLUMN site_data TEXT")
        if "web_sources" not in message_columns:
            conn.execute("ALTER TABLE messages ADD COLUMN web_sources TEXT")
        if "thinking" not in message_columns:
            conn.execute("ALTER TABLE messages ADD COLUMN thinking TEXT")
        if "attachments" not in message_columns:
            conn.execute("ALTER TABLE messages ADD COLUMN attachments TEXT")
        if "file_path" not in message_columns:
            conn.execute("ALTER TABLE messages ADD COLUMN file_path TEXT")
        if "file_size" not in message_columns:
            conn.execute("ALTER TABLE messages ADD COLUMN file_size INTEGER")
        if "file_type" not in message_columns:
            conn.execute("ALTER TABLE messages ADD COLUMN file_type TEXT")
        if "skill" not in message_columns:
            conn.execute("ALTER TABLE messages ADD COLUMN skill TEXT")
        project_columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(projects)")
        }
        if "is_pinned" not in project_columns:
            conn.execute(
                "ALTER TABLE projects ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0"
            )
        chat_columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(chats)")
        }
        chat_schema = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'chats'"
        ).fetchone()
        if (
            chat_schema
            and chat_schema["sql"]
            and "PROJECT_ID TEXT NOT NULL" in chat_schema["sql"].upper()
        ):
            conn.execute("PRAGMA foreign_keys = OFF")
            conn.execute("ALTER TABLE chats RENAME TO chats_legacy")
            conn.execute(
                """
                CREATE TABLE chats (
                    id TEXT PRIMARY KEY,
                    project_id TEXT,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    is_pinned INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (project_id) REFERENCES projects(id)
                )
                """
            )
            conn.execute(
                "INSERT INTO chats (id, project_id, title, created_at, is_pinned) "
                "SELECT id, project_id, title, created_at, is_pinned FROM chats_legacy"
            )
            conn.execute("DROP TABLE chats_legacy")
            conn.execute("PRAGMA foreign_keys = ON")
            chat_columns = {
                row["name"] for row in conn.execute("PRAGMA table_info(chats)")
            }
        if "is_pinned" not in chat_columns:
            conn.execute(
                "ALTER TABLE chats ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0"
            )

def save_message(
    chat_id,
    role,
    content,
    sources=None,
    plant_data=None,
    site_data=None,
    thinking=None,
    attachments=None,
    file_path=None,
    web_sources=None,
    file_size=None,
    file_type=None,
    skill=None,
):
    # Keep empty reasoning as NULL so old and non-reasoning messages stay light.
    thinking_text = thinking if isinstance(thinking, str) and thinking.strip() else None
    stored_file_path = file_path if isinstance(file_path, str) and file_path.strip() else None
    stored_file_size = (
        file_size
        if isinstance(file_size, int) and not isinstance(file_size, bool) and file_size >= 0
        else None
    )
    stored_file_type = file_type if isinstance(file_type, str) and file_type.strip() else None
    stored_skill = skill if isinstance(skill, str) and skill.strip() else None
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO messages "
            "(id, chat_id, role, content, sources, plant_data, site_data, web_sources, "
            "thinking, attachments, file_path, file_size, file_type, skill, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                uuid4().hex,
                chat_id,
                role,
                content,
                json.dumps(sources) if sources is not None else None,
                json.dumps(plant_data) if plant_data is not None else None,
                json.dumps(site_data) if site_data is not None else None,
                json.dumps(web_sources) if web_sources is not None else None,
                thinking_text,
                json.dumps(attachments) if attachments is not None else None,
                stored_file_path,
                stored_file_size,
                stored_file_type,
                stored_skill,
                datetime.now().isoformat(),
            ),
        )


def get_settings():
    """Return the persisted General preferences as a flat key/value object."""
    with get_connection() as conn:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
    return {row["key"]: row["value"] for row in rows}


def save_setting(key, value):
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )


def count_law_articles():
    with get_connection() as conn:
        row = conn.execute(
            "SELECT count(*) AS article_count, count(DISTINCT law_name) AS law_count "
            "FROM law_articles"
        ).fetchone()
    return {"article_count": row["article_count"], "law_count": row["law_count"]}

def create_chat(project_id=None, title="New Chat"):
    chat = {
        "id": str(uuid4()),
        "project_id": project_id,
        "title": title,
        "created_at": datetime.now().isoformat(),
        "is_pinned": False,
    }
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO chats (id, project_id, title, created_at, is_pinned) "
            "VALUES (?, ?, ?, ?, 0)",
            (chat["id"], chat["project_id"], chat["title"], chat["created_at"]),
        )
    return chat


def create_project(name, chat_ids=None):
    project = {
        "id": str(uuid4()),
        "name": name,
        "created_at": datetime.now().isoformat(),
        "is_pinned": False,
    }
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO projects (id, name, created_at, is_pinned) VALUES (?, ?, ?, 0)",
            (project["id"], project["name"], project["created_at"]),
        )
        if chat_ids:
            placeholders = ",".join("?" for _ in chat_ids)
            conn.execute(
                f"UPDATE chats SET project_id = ? WHERE id IN ({placeholders})",
                (project["id"], *chat_ids),
            )
    return project


def add_chat_to_project(chat_id, project_id):
    with get_connection() as conn:
        project = conn.execute(
            "SELECT id FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
        if project is None:
            raise ValueError("The requested project was not found.")
        result = conn.execute(
            "UPDATE chats SET project_id = ? WHERE id = ?",
            (project_id, chat_id),
        )
    if result.rowcount != 1:
        raise ValueError("The requested chat was not found.")
    return True


def set_chat_pinned(chat_id, is_pinned):
    with get_connection() as conn:
        result = conn.execute(
            "UPDATE chats SET is_pinned = ? WHERE id = ?",
            (1 if is_pinned else 0, chat_id),
        )
    return result.rowcount == 1


def set_project_pinned(project_id, is_pinned):
    with get_connection() as conn:
        result = conn.execute(
            "UPDATE projects SET is_pinned = ? WHERE id = ?",
            (1 if is_pinned else 0, project_id),
        )
    return result.rowcount == 1


def rename_chat(chat_id, new_title):
    with get_connection() as conn:
        result = conn.execute(
            "UPDATE chats SET title = ? WHERE id = ?",
            (new_title, chat_id),
        )
    return result.rowcount == 1


def rename_project(project_id, new_name):
    with get_connection() as conn:
        result = conn.execute(
            "UPDATE projects SET name = ? WHERE id = ?",
            (new_name, project_id),
        )
    return result.rowcount == 1


def delete_project(project_id):
    with get_connection() as conn:
        conn.execute("DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE project_id = ?)", (project_id,))
        conn.execute("DELETE FROM chats WHERE project_id = ?", (project_id,))
        result = conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    return result.rowcount == 1

def get_messages(chat_id):
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, chat_id, role, content, sources, plant_data, site_data, "
            "web_sources, thinking, "
            "attachments, file_path, file_size, file_type, skill, created_at "
            "FROM messages WHERE chat_id = ? ORDER BY created_at ASC",
            (chat_id,),
        ).fetchall()
    messages = []
    for row in rows:
        message = dict(row)
        message["sources"] = json.loads(message["sources"]) if message["sources"] else []
        message["plant_data"] = (
            json.loads(message["plant_data"]) if message["plant_data"] else []
        )
        message["site_data"] = (
            json.loads(message["site_data"]) if message["site_data"] else None
        )
        message["web_sources"] = (
            json.loads(message["web_sources"]) if message["web_sources"] else []
        )
        # Always a string: the frontend validator rejects null.
        message["thinking"] = message["thinking"] or ""
        message["attachments"] = (
            json.loads(message["attachments"]) if message["attachments"] else []
        )
        # Always a string: the frontend validator rejects null.
        message["file_path"] = message["file_path"] or ""
        messages.append(message)
    return messages

STEM_SUFFIXES = ("ements", "ement", "ations", "ation", "es", "s", "e", "x")
# Terms present in more than this share of the corpus carry little
# discriminative signal and dilute the BM25 ranking (e.g. "autorisation").
MAX_TERM_DF_RATIO = 0.10
MIN_QUERY_TERMS = 3
# Table-of-contents entries are indexed as short heading-only chunks. They
# match a query's generic nouns but carry no rule text, so they are skipped.
MIN_ARTICLE_LENGTH = 80
# Long chunks (some recueil articles exceed 10k characters) can fill the
# model's context window and leave no room for the answer.
MAX_ARTICLE_CHARS = 2000


def _stem(word):
    """Strip a common French suffix so FTS5 prefix matching handles plurals
    and inflections ("jointes" -> "joint", "documents" -> "document")."""
    for suffix in STEM_SUFFIXES:
        if word.endswith(suffix):
            candidate = word[: len(word) - len(suffix)]
            if len(candidate) >= 5:
                return candidate
    return word


def _match_term(word):
    stem = _stem(word)
    return f'"{stem}"*' if stem != word else f'"{word}"'


def _document_frequency(conn, word):
    return conn.execute(
        "SELECT count(*) FROM law_articles WHERE law_articles MATCH ?",
        (_match_term(word),),
    ).fetchone()[0]


def search_law(query, limit=8):
    print(f"SEARCH QUERY: {query}", file=sys.stderr, flush=True)
    stop_words = {
        "a", "about", "an", "and", "are", "as", "at", "be", "by", "for",
        "from", "how", "i", "in", "is", "it", "of", "on", "or", "that",
        "the", "this", "to", "what", "when", "where", "which", "who",
        "why", "with", "au", "aux", "avec", "ce", "ces", "dans", "de",
        "des", "du", "elle", "en", "et", "eux", "il", "je", "la", "le",
        "les", "leur", "lui", "ma", "mais", "me", "meme", "mes", "moi",
        "mon", "ne", "nos", "notre", "nous", "on", "ou", "par", "pas",
        "pour", "qu", "que", "qui", "sa", "se", "ses", "son", "sur", "ta",
        "te", "tes", "toi", "ton", "tu", "un", "une", "vos", "votre",
        "vous",
    }
    normalized_query = "".join(
        character
        for character in unicodedata.normalize("NFD", query)
        if unicodedata.category(character) != "Mn"
    )
    words = re.sub(r"[^\w\s]", " ", normalized_query).split()
    words = [
        word
        for word in words
        if word.casefold() not in stop_words and len(word) > 1
    ]
    if not words:
        return []
    unique_words = list(dict.fromkeys(word.casefold() for word in words))
    with get_connection() as conn:
        total = conn.execute("SELECT count(*) FROM law_articles").fetchone()[0]
        frequencies = sorted(
            ((_document_frequency(conn, word), word) for word in unique_words),
            key=lambda item: item[0],
        )
        if total:
            selected = [
                word for frequency, word in frequencies
                if frequency / total <= MAX_TERM_DF_RATIO
            ]
        else:
            selected = []
        if len(selected) < MIN_QUERY_TERMS:
            selected = [word for _, word in frequencies[:MIN_QUERY_TERMS]]
        dropped = [word for _, word in frequencies if word not in selected]
        if dropped:
            print(f"DROPPED TERMS: {' '.join(dropped)}", file=sys.stderr, flush=True)
        match_query = " OR ".join(_match_term(word) for word in selected)
        rows = conn.execute(
            "SELECT law_name, article_num, content, page_num, sub_law, country "
            "FROM law_articles WHERE law_articles MATCH ? "
            "AND length(content) >= ? ORDER BY rank LIMIT ?",
            (match_query, MIN_ARTICLE_LENGTH, limit),
        ).fetchall()
    results = [dict(row) for row in rows]
    print(f"FOUND ARTICLES: {len(results)}", file=sys.stderr, flush=True)
    return results

def law_display_name(source):
    """Prefer the most informative Latin law name when an Arabic alias exists."""
    return preferred_law_name(source)


def format_law_results(results):
    formatted = []
    for article in deduplicate_sources(results):
        law_name = re.sub(r"\s*\([^)]*\)", "", law_display_name(article)).strip()
        content = article["content"].strip()
        if len(content) > MAX_ARTICLE_CHARS:
            content = content[:MAX_ARTICLE_CHARS].rstrip() + " […]"
        formatted.append(
            f"{law_name}, article {article['article_num']} "
            f"(page {article['page_num']}):\n{content}"
        )
    return "\n\n".join(formatted)