import platform
from collections import deque
from datetime import datetime
import logging

from log_setup import log_directory, today_log_path


def init() -> None:
    log_directory().mkdir(parents=True, exist_ok=True)


def log(message: str) -> None:
    timestamp = datetime.now().astimezone().isoformat(timespec="seconds")
    logging.getLogger("session_logger").error("[%s] %s", timestamp, message.rstrip())


def get_diagnostics(app_version: str, hardware: dict[str, object]) -> str:
    try:
        def format_gb(value: object) -> str:
            return (
                f"{value:.1f} GB"
                if isinstance(value, (int, float))
                else "Not detected"
            )

        from db import get_settings

        diagnostics = [
            "Nogic Diagnostics",
            f"OS: {platform.platform()}",
            f"App version: {app_version}",
        ]
        active_model = get_settings().get("activeModel") or "Not selected"
        diagnostics.append(f"Active model: {active_model}")
        diagnostics.append(f"VRAM: {format_gb(hardware.get('vram_gb'))}")
        diagnostics.append(f"RAM: {format_gb(hardware.get('total_ram_gb'))}")
        log_file = today_log_path()
        if log_file.is_file():
            with log_file.open(encoding="utf-8", errors="replace") as stream:
                log_lines = list(deque(stream, maxlen=100))
            log_lines = [line.rstrip("\n") for line in log_lines]
            diagnostics.extend(
                ["Sidecar log (last 100 lines):", *(log_lines or ["(empty)"])]
            )
        else:
            diagnostics.append("No sidecar errors logged today.")
        return "\n".join(diagnostics)
    except Exception as error:
        return (
            "Diagnostics partially unavailable. Version: 1.1.0. "
            f"Error: {error}"
        )
