"""Resolve writable application data and bundled seed data paths."""

import os
import shutil
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
IS_FROZEN = bool(getattr(sys, "frozen", False))
appdata = os.getenv("APPDATA")

if IS_FROZEN:
    if not appdata:
        raise RuntimeError("APPDATA is required for the packaged Nogic backend.")
    BUNDLED_DATA_DIR = Path(getattr(sys, "_MEIPASS")) / "data"
else:
    BUNDLED_DATA_DIR = BACKEND_DIR / "data"

APP_DATA_ROOT = (
    Path(appdata) / "com.nogic.app" if appdata else BACKEND_DIR
)
DATA_DIR = APP_DATA_ROOT / "data" if IS_FROZEN else BACKEND_DIR / "data"


def prepare_runtime_data() -> None:
    """Seed missing writable data files without overwriting user changes."""
    if not IS_FROZEN:
        return

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    bundled_laws = BUNDLED_DATA_DIR / "laws"
    runtime_laws = DATA_DIR / "laws"
    runtime_laws.mkdir(parents=True, exist_ok=True)
    if bundled_laws.is_dir():
        for source in bundled_laws.iterdir():
            destination = runtime_laws / source.name
            if source.is_file() and not destination.exists():
                shutil.copy2(source, destination)

    bundled_plants = BUNDLED_DATA_DIR / "plants.json"
    runtime_plants = DATA_DIR / "plants.json"
    if bundled_plants.is_file() and not runtime_plants.exists():
        shutil.copy2(bundled_plants, runtime_plants)
