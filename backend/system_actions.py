import hashlib
import logging
import os
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile
from pathlib import Path

TESSERACT_ZIP_URL = (
    "https://github.com/nogic-app/Nogic/releases/download/"
    "deps-v1/tesseract-portable-win64.zip"
)
TESSERACT_ZIP_SHA256 = "CE2CF87E118EA06778D03FE5C969FE08648834FB78538C7DCD6785275B2F72FA"
TESSERACT_ARCHIVE_ROOT = "tesseract-portable-win64"
TESSDATA_BASE_URL = (
    "https://github.com/tesseract-ocr/tessdata_fast/raw/main/"
)
LANGUAGES = ("eng", "fra", "ara")
DOWNLOAD_BLOCK_SIZE = 1024 * 1024
logger = logging.getLogger(__name__)


def _target_directory() -> Path | None:
    appdata = os.environ.get("APPDATA")
    if not appdata:
        return None
    return (
        Path(appdata)
        / "com.nogic.app"
        / "requirements"
        / "tesseract"
    )


def get_tesseract_path() -> str | None:
    try:
        import pytesseract
    except ImportError:
        return None

    target_dir = _target_directory()
    if target_dir:
        portable_path = target_dir / "tesseract.exe"
        if portable_path.is_file():
            pytesseract.pytesseract.tesseract_cmd = str(portable_path)
            os.environ["TESSDATA_PREFIX"] = str(target_dir / "tessdata")
            return str(portable_path)

    try:
        pytesseract.get_tesseract_version()
        return "system"
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError):
        pass

    candidates = [
        Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe"),
        Path(r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"),
    ]
    for path in candidates:
        if path.is_file():
            pytesseract.pytesseract.tesseract_cmd = str(path)
            return str(path)
    return None


def _download_file(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Nogic Tesseract downloader"},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            total_bytes = int(response.headers.get("Content-Length", "0"))
            downloaded = 0
            with destination.open("wb") as file:
                while True:
                    block = response.read(DOWNLOAD_BLOCK_SIZE)
                    if not block:
                        break
                    file.write(block)
                    downloaded += len(block)

            if total_bytes and downloaded != total_bytes:
                raise RuntimeError("The Tesseract download was incomplete.")
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        while block := file.read(DOWNLOAD_BLOCK_SIZE):
            digest.update(block)
    return digest.hexdigest().upper()


def download_portable_tesseract() -> dict[str, bool]:
    target_dir = _target_directory()
    if target_dir is None:
        raise RuntimeError("APPDATA is required to download Tesseract for Nogic.")

    target_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="nogic-tesseract-") as temporary_dir:
        temporary_path = Path(temporary_dir)
        archive_path = temporary_path / "tesseract-portable-win64.zip"
        _download_file(TESSERACT_ZIP_URL, archive_path)

        digest = _sha256_file(archive_path)
        if digest != TESSERACT_ZIP_SHA256:
            raise RuntimeError("Download corrupted. Please try again.")

        extraction_dir = temporary_path / "extracted"
        extraction_dir.mkdir()
        with zipfile.ZipFile(archive_path) as archive:
            archive.extractall(extraction_dir)

        extracted_root = extraction_dir / TESSERACT_ARCHIVE_ROOT
        if not extracted_root.is_dir():
            raise RuntimeError("The Tesseract download has an unexpected layout.")
        shutil.copytree(extracted_root, target_dir, dirs_exist_ok=True)

    missing_runtime_dlls = [
        name
        for name in ("vcruntime140.dll", "msvcp140.dll")
        if not (target_dir / name).is_file()
    ]
    if missing_runtime_dlls:
        logger.warning(
            "Portable Tesseract is missing %s. OCR may require the Microsoft "
            "Visual C++ Redistributable; install it from Microsoft if OCR fails.",
            ", ".join(missing_runtime_dlls),
        )

    if not (target_dir / "tesseract.exe").is_file():
        raise RuntimeError("The Tesseract download is missing tesseract.exe.")

    tessdata_dir = target_dir / "tessdata"
    for language in LANGUAGES:
        language_data = tessdata_dir / f"{language}.traineddata"
        if not language_data.is_file():
            _download_file(
                f"{TESSDATA_BASE_URL}{language}.traineddata",
                language_data,
            )

    return {"installed": True}


def remove_tesseract() -> dict[str, bool]:
    target_dir = _target_directory()
    if target_dir is None:
        return {"installed": False}

    shutil.rmtree(target_dir, ignore_errors=True)
    if target_dir.exists():
        raise RuntimeError(
            "Could not remove Tesseract. Close active OCR tasks and try again."
        )
    return {"installed": False}


def check_tesseract() -> dict[str, bool]:
    target_dir = _target_directory()
    return {
        "installed": bool(
            target_dir and os.path.exists(os.path.join(target_dir, "tesseract.exe"))
        )
    }
