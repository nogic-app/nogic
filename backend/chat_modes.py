"""Chat mode flags.

Fast is the default. Think maps to Ollama's reasoning stream, DeepThink to the
multi-pass loop in `chat_engine.py`, and Web to `web_search.py`. Prompt
composition for those real implementations lives beside them, not here.
"""

from typing import Any

MODES_DEFAULT = {"think": False, "deep_think": False, "web": False}


def get_chat_modes(req: dict[str, Any]) -> dict[str, bool]:
    """Read the optional `modes` object, defaulting every flag to off."""
    raw_modes = req.get("modes")
    if not isinstance(raw_modes, dict):
        return dict(MODES_DEFAULT)
    return {
        key: raw_modes.get(key) is True
        for key in MODES_DEFAULT
    }
