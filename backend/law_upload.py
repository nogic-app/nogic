import os
import shutil
from typing import Any

from law_ingest import (
    LAWS_DIRECTORY,
    ingest_pdf,
    law_filename_from_name,
    normalize_country_code,
)

NO_EXTRACTABLE_LAW_TEXT = (
    "Could not extract any text. If this is a scanned document, "
    "please install Tesseract OCR from the Settings, Advanced."
)


def normalized_law_name(raw_name: str) -> str:
    name = raw_name.strip()
    if not name:
        raise ValueError("The law name cannot be empty.")
    if name[:4].casefold() != "loi ":
        name = f"Loi {name}"
    return name


def add_law(
    file_path: str,
    raw_law_name: str,
    country: str = "MA",
) -> dict[str, Any]:
    """Copy a user PDF into the law library and index its articles."""
    if not file_path.strip():
        raise ValueError("The PDF file path is required.")
    if not isinstance(raw_law_name, str):
        raise ValueError("The law name is required.")

    country_code = normalize_country_code(country)
    law_name = normalized_law_name(raw_law_name)
    source_path = os.path.realpath(file_path)
    if not os.path.isfile(source_path):
        raise ValueError(f"PDF not found: {file_path}")
    if not source_path.lower().endswith(".pdf"):
        raise ValueError("The selected file must be a PDF.")

    filename = law_filename_from_name(law_name, country_code)
    os.makedirs(LAWS_DIRECTORY, exist_ok=True)
    destination_path = os.path.join(LAWS_DIRECTORY, filename)
    already_in_library = (
        os.path.normcase(os.path.realpath(destination_path))
        == os.path.normcase(source_path)
    )
    if not already_in_library and os.path.exists(destination_path):
        raise ValueError(
            f"A law file named {filename} already exists in the library."
        )
    if not already_in_library:
        stem = destination_path[:-4]
        if any(
            os.path.exists(variant)
            for variant in (f"{stem}_fr.pdf", f"{stem}_ar.pdf")
        ):
            raise ValueError(
                f"{law_name} is already in the library. "
                "Add a version suffix, for example 'Loi 12.90 (consolidated 2024)'."
            )

    if not already_in_library:
        try:
            shutil.copy(source_path, destination_path)
        except Exception:
            if os.path.exists(destination_path):
                os.remove(destination_path)
            raise
    try:
        article_count = ingest_pdf(destination_path, law_name, country_code)
        if article_count == 0:
            raise ValueError(NO_EXTRACTABLE_LAW_TEXT)
    except Exception:
        if not already_in_library and os.path.exists(destination_path):
            os.remove(destination_path)
        raise

    return {
        "success": True,
        "message": (
            f"Saved. {law_name} is now in your library, "
            "and I will cite it by that name."
        ),
        "law_name": law_name,
        "country": country_code,
        "filename": filename,
        "article_count": article_count,
    }
