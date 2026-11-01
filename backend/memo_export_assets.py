"""Assets and user-specific labels shared by PDF and Word exports."""

from __future__ import annotations

import sys
from pathlib import Path


def user_initials(user_name: str | None) -> str:
    """Return up to two initials from the first name, or ME when unset."""
    first_name = (user_name or "").strip().split(" ", 1)[0]
    return first_name[:2].upper() if first_name else "ME"


def app_icon_path() -> Path:
    """Resolve the app icon in development and in the frozen sidecar."""
    candidates = [
        Path(__file__).resolve().parent / "data" / "app-icon.png",
        Path(__file__).resolve().parents[1]
        / "Nogic"
        / "public"
        / "app-icon.png",
    ]
    bundle_root = getattr(sys, "_MEIPASS", None)
    if bundle_root:
        candidates.insert(0, Path(bundle_root) / "data" / "app-icon.png")
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError("The bundled Nogic app icon was not found.")
