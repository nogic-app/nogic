import pymupdf
import logging
import os
import re
import sys
from datetime import datetime
import unicodedata
from typing import Protocol

import pytesseract
from PIL import Image

from db import get_connection, law_article_hash
from runtime_paths import DATA_DIR
from system_actions import get_tesseract_path

LAWS_DIRECTORY = os.path.join(DATA_DIR, "laws")
TESSERACT_DLL_ERROR_MESSAGE = (
    "Tesseract is missing required Windows DLLs (Visual C++ Redistributable). "
    "Please install the Visual C++ Redistributable from Microsoft."
)
logger = logging.getLogger(__name__)


class TesseractDependencyError(RuntimeError):
    pass


class _PagePixmap(Protocol):
    width: int
    height: int
    samples: bytes


class _TextPage(Protocol):
    def get_text(self, option: str) -> str: ...

    def get_pixmap(self, *, dpi: int) -> _PagePixmap: ...


ARTICLE_PATTERN = re.compile(
    r"^\s*(?:(?:Article|ART\.|Section|Sec\.|Titre|Chapitre)\s+|§\s*|"
    r"(?:Regulation|Directive)\s+)"
    r"(?P<number>premier|(?:\([A-Za-z0-9]+\)\s*)?\d+(?:[./]\d+)*"
    r"(?:er)?(?:\s*(?:bis|ter|quater))?|[IVXLCDM]+)"
    r"\b\s*[:.\-–—]?",
    re.IGNORECASE | re.MULTILINE,
)
MISSING_YEAR_PAREN = re.compile(
    r"(?<=[a-zàâçéèêëîïôûùüÿœæ])((?:19|20)\d{2})\)",
    re.IGNORECASE,
)
SUB_LAW_MIGRATION_KEY = "law_sub_law_backfill_v1"
MOJIBAKE_PATTERN = re.compile(
    r"(?:Ã[\x80-\xBF]|Â[\x80-\xBF]|â(?:€|€™|€œ|€¦)|ï¿½|"
    r"[ÐÑØÙ][\x80-\xBF])"
)


def _garbage_ratio(text: str) -> float:
    visible_characters = sum(not character.isspace() for character in text)
    if visible_characters == 0:
        return 0.0

    suspicious_characters = sum(
        not character.isspace()
        and unicodedata.category(character) in {"Cc", "Cf", "Cs", "Co", "Cn"}
        for character in text
    )
    suspicious_characters += text.count("\ufffd")
    suspicious_characters += sum(
        len(match.group(0)) for match in MOJIBAKE_PATTERN.finditer(text)
    )
    return suspicious_characters / visible_characters


def _extract_page_text(
    page: _TextPage, page_number: int, filepath: str
) -> str | None:
    page_text = page.get_text("text")
    if page_text.strip() and _garbage_ratio(page_text) <= 0.30:
        return page_text

    tesseract_path = get_tesseract_path()
    if tesseract_path is None:
        print(
            f"Tesseract is not installed. OCR skipped for page {page_number}.",
            file=sys.stderr,
        )
        return None

    pixmap = page.get_pixmap(dpi=200)
    image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    tess_root = os.path.join(
        os.environ.get("APPDATA", ""),
        "com.nogic.app",
        "requirements",
        "tesseract",
    )
    tess_exe = os.path.join(tess_root, "tesseract.exe")
    tess_data = os.path.join(tess_root, "tessdata")

    logger.info(
        "OCR Setup -> EXE: %s (exists: %s)",
        tess_exe,
        os.path.exists(tess_exe),
    )
    logger.info(
        "OCR Setup -> TESSDATA: %s (exists: %s)",
        tess_data,
        os.path.exists(tess_data),
    )

    if os.path.exists(tess_exe):
        pytesseract.pytesseract.tesseract_cmd = tess_exe
        os.environ["TESSDATA_PREFIX"] = tess_data
    elif tesseract_path != "system":
        pytesseract.pytesseract.tesseract_cmd = tesseract_path

    try:
        ocr_text = pytesseract.image_to_string(image, lang="fra+ara+eng")
    except Exception as error:
        logger.error(
            "Tesseract failed to run: %s",
            str(error),
            exc_info=True,
        )
        error_text = str(error).casefold()
        if any(
            marker in error_text
            for marker in (
                "0xc0000135",
                "the specified module could not be found",
                "winerror 126",
                "vcruntime140.dll",
                "msvcp140.dll",
            )
        ):
            raise TesseractDependencyError(TESSERACT_DLL_ERROR_MESSAGE) from error
        raise

    if ocr_text.strip() and _garbage_ratio(ocr_text) <= 0.30:
        return ocr_text

    print(
        f"Warning: Skipping page {page_number} of {filepath}; "
        "OCR did not produce usable text.",
        file=sys.stderr,
    )
    return None


def warn_if_tesseract_missing() -> None:
    if get_tesseract_path() is None:
        print(
            "Warning: Tesseract was not found. "
            "OCR will be skipped for scanned pages.",
            file=sys.stderr,
        )


def _article_number(raw_number: str) -> str:
    number = raw_number.strip().lower()
    return "1" if number == "premier" else number


def _law_name_from_filename(filename: str) -> str:
    identifier = os.path.splitext(os.path.basename(filename))[0].removeprefix("Law_")
    identifier = re.sub(r"^(?:[A-Z]{2}|INT)_", "", identifier)
    language_match = re.fullmatch(r"(.+)_(fr|ar)", identifier, re.IGNORECASE)
    if language_match:
        identifier = language_match.group(1)
        if language_match.group(2).lower() == "ar":
            identifier = f"{identifier} (ar)"
    return f"Loi {identifier}"


def normalize_country_code(country: str | None) -> str:
    if country is not None and not isinstance(country, str):
        raise ValueError("The country code must be two letters or INT.")
    code = (country or "MA").strip().upper()
    if not code:
        return "MA"
    if not re.fullmatch(r"(?:[A-Z]{2}|INT)", code):
        raise ValueError("The country code must be two letters or INT.")
    return code


def law_filename_from_name(law_name: str, country: str = "MA") -> str:
    """Build a country-prefixed filename while preserving Unicode characters."""
    country_code = normalize_country_code(country)
    identifier = re.sub(
        r"^(?:(?:Law|Loi)[ _])+",
        "",
        law_name.strip(),
        flags=re.IGNORECASE,
    )
    sanitized = re.sub(r'[\\/:*?"<>|]', "", identifier).replace(" ", "_")
    if not sanitized:
        sanitized = f"Document_{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
    return f"Law_{country_code}_{sanitized}.pdf"


def _clean_section_title(title: str) -> str:
    cleaned = " ".join(title.split())
    # Some PDF bookmarks lose the opening parenthesis around the year
    # ("urbanisme1992)"). Restore it so citations remain readable.
    return MISSING_YEAR_PAREN.sub(r" (\1)", cleaned)


def detect_recueil_sections(document: pymupdf.Document) -> list[tuple[int, str]]:
    """Return ``(start_page, document_title)`` for a recueil's contents.

    A recueil is a compilation of separate legal texts. Its PDF bookmarks
    normally expose a ``Volet`` level and one level-2 entry per contained
    document. Ordinary single-law PDFs also have bookmarks, so the recueil
    shape is confirmed through metadata, cover text, or multiple volets.
    """
    toc = document.get_toc(simple=True)
    if not toc:
        return []

    metadata = document.metadata or {}
    descriptor = " ".join(
        str(metadata.get(key) or "") for key in ("title", "subject")
    ).casefold()
    volet_count = sum(
        1
        for level, title, _page in toc
        if level == 1 and str(title).strip().casefold().startswith("volet ")
    )
    cover_text = ""
    if "recueil" not in descriptor and volet_count < 2:
        cover_text = " ".join(
            document[index].get_text("text")
            for index in range(min(4, document.page_count))
        ).casefold()
    if "recueil" not in descriptor and volet_count < 2 and "recueil" not in cover_text:
        return []

    sections: list[tuple[int, str]] = []
    seen_pages: set[int] = set()
    for level, title, page in toc:
        if level != 2 or not isinstance(page, int) or page < 1:
            continue
        cleaned = _clean_section_title(str(title))
        if not cleaned or page in seen_pages:
            continue
        seen_pages.add(page)
        sections.append((page, cleaned))

    sections.sort(key=lambda section: section[0])
    return sections if len(sections) >= 2 else []


def _sub_law_for_page(
    page_number: int,
    sections: list[tuple[int, str]],
) -> str | None:
    sub_law = None
    for start_page, title in sections:
        if start_page > page_number:
            break
        sub_law = title
    return sub_law


def ingest_pdf(filepath: str, law_name: str, country: str = "MA") -> int:
    country_code = normalize_country_code(country)
    pdf_path = filepath
    if not os.path.exists(pdf_path):
        script_relative_path = os.path.join(os.path.dirname(__file__), filepath)
        if os.path.exists(script_relative_path):
            pdf_path = script_relative_path

    document = pymupdf.open(pdf_path)
    sections = detect_recueil_sections(document)
    article_rows: list[tuple[str, str, str, int, str | None, str]] = []
    page_chunks: list[tuple[int, str]] = []
    recognized_markers = 0
    current_article: str | None = None
    current_page: int | None = None
    current_content = ""

    def save_current_article() -> None:
        if current_article is not None and current_page is not None:
            content = current_content.strip()
            if content:
                article_rows.append(
                    (
                        law_name,
                        current_article,
                        content,
                        current_page,
                        _sub_law_for_page(current_page, sections),
                        country_code,
                    )
                )

    try:
        for page_number, page in enumerate(document, start=1):
            page_text = _extract_page_text(page, page_number, filepath)
            if page_text is None:
                continue
            if page_text.strip():
                page_chunks.append((page_number, page_text.strip()))

            markers = list(ARTICLE_PATTERN.finditer(page_text))
            recognized_markers += len(markers)
            if not markers:
                if current_article is not None:
                    current_content += "\n" + page_text
                continue

            if current_article is not None:
                current_content += "\n" + page_text[:markers[0].start()]

            for index, marker in enumerate(markers):
                save_current_article()
                current_article = _article_number(marker.group("number"))
                current_page = page_number
                end = (
                    markers[index + 1].start()
                    if index + 1 < len(markers)
                    else len(page_text)
                )
                current_content = page_text[marker.start():end]

        save_current_article()
    finally:
        document.close()

    if recognized_markers == 0:
        article_rows = [
            (
                law_name,
                f"Page {page_number}",
                page_text,
                page_number,
                _sub_law_for_page(page_number, sections),
                country_code,
            )
            for page_number, page_text in page_chunks
        ]

    with get_connection() as connection:
        connection.execute(
            "CREATE TABLE IF NOT EXISTS law_article_hashes ("
            "content_hash TEXT PRIMARY KEY, "
            "law_name TEXT NOT NULL, "
            "article_num TEXT NOT NULL, "
            "page_num INTEGER NOT NULL, "
            "country TEXT NOT NULL DEFAULT 'MA')"
        )
        connection.execute(
            "DELETE FROM law_articles WHERE law_name = ? AND country = ?",
            (law_name, country_code),
        )
        connection.execute(
            "DELETE FROM law_article_hashes WHERE law_name = ? AND country = ?",
            (law_name, country_code),
        )
        inserted = 0
        seen_hashes: set[str] = set()
        for row in article_rows:
            article_hash = law_article_hash(row[2], row[5])
            if article_hash in seen_hashes:
                continue
            seen_hashes.add(article_hash)
            marker = connection.execute(
                "INSERT OR IGNORE INTO law_article_hashes "
                "(content_hash, law_name, article_num, page_num, country) "
                "VALUES (?, ?, ?, ?, ?)",
                (article_hash, row[0], row[1], row[3], row[5]),
            )
            if marker.rowcount == 0:
                continue
            connection.execute(
                "INSERT INTO law_articles "
                "(law_name, article_num, content, page_num, sub_law, country) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                row,
            )
            inserted += 1

    skipped = len(article_rows) - inserted
    print(
        f"Indexed {inserted} articles for {law_name}"
        + (f" ({skipped} duplicates skipped)." if skipped else "."),
        file=sys.stderr,
    )
    if sections:
        print(
            f"Detected a recueil with {len(sections)} contained documents.",
            file=sys.stderr,
        )
    return len(article_rows)


def _pending_recueil_names() -> dict[str, str]:
    """Map expected filenames to law names whose articles lack a sub-law."""
    with get_connection() as connection:
        pending = [
            row["law_name"]
            for row in connection.execute(
                "SELECT DISTINCT law_name FROM law_articles "
                "WHERE sub_law IS NULL"
            )
        ]
    names: dict[str, str] = {}
    for law_name in pending:
        try:
            current_filename = law_filename_from_name(law_name)
            names[current_filename] = law_name
            names[current_filename.replace("Law_MA_", "Law_", 1)] = law_name
        except ValueError:
            continue
    return names


def backfill_recueil_sub_laws() -> int:
    """Tag articles indexed before the ``sub_law`` column existed.

    This runs once per installation. New uploads are tagged during
    ingestion, and a missing source PDF simply leaves the old rows untouched.
    """
    with get_connection() as connection:
        already_done = connection.execute(
            "SELECT 1 FROM settings WHERE key = ?",
            (SUB_LAW_MIGRATION_KEY,),
        ).fetchone()
    if already_done:
        return 0

    pending = _pending_recueil_names()
    updates: list[tuple[str, str, int, int]] = []
    if pending and os.path.isdir(LAWS_DIRECTORY):
        for filename in sorted(os.listdir(LAWS_DIRECTORY)):
            law_name = pending.get(filename)
            if not law_name or not filename.lower().endswith(".pdf"):
                continue
            pdf_path = os.path.join(LAWS_DIRECTORY, filename)
            try:
                with pymupdf.open(pdf_path) as document:
                    sections = detect_recueil_sections(document)
            except Exception as error:
                print(
                    f"Warning: could not inspect {filename} for recueil sections: "
                    f"{error}",
                    file=sys.stderr,
                )
                continue
            for index, (start_page, title) in enumerate(sections):
                end_page = (
                    sections[index + 1][0]
                    if index + 1 < len(sections)
                    else 10**9
                )
                updates.append((title, law_name, start_page, end_page))

    tagged = 0
    with get_connection() as connection:
        for title, law_name, start_page, end_page in updates:
            cursor = connection.execute(
                "UPDATE law_articles SET sub_law = ? "
                "WHERE law_name = ? AND page_num >= ? AND page_num < ? "
                "AND sub_law IS NULL",
                (title, law_name, start_page, end_page),
            )
            tagged += cursor.rowcount
        connection.execute(
            "INSERT INTO settings (key, value) VALUES (?, 'done') "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (SUB_LAW_MIGRATION_KEY,),
        )
    if tagged:
        print(f"Tagged {tagged} recueil articles by contained law.", file=sys.stderr)
    return tagged


if __name__ == "__main__":
    from db import init_db

    warn_if_tesseract_missing()
    init_db()
    for pdf_path in sorted(
        os.path.join(LAWS_DIRECTORY, filename)
        for filename in os.listdir(LAWS_DIRECTORY)
        if filename.lower().endswith(".pdf")
    ):
        law_name = _law_name_from_filename(pdf_path)
        filename = os.path.basename(pdf_path)
        match = re.match(r"Law_([A-Z]{2}|INT)_", filename)
        country = match.group(1) if match else "MA"
        ingest_pdf(pdf_path, law_name, country)
