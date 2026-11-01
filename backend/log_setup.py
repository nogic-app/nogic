import glob
import logging
import os
import re
import time
from datetime import date, timedelta
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path


def log_directory() -> Path:
    app_data = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    return app_data / "com.nogic.app" / "logs"


def today_log_path() -> Path:
    return log_directory() / f"sidecar-{date.today().isoformat()}.log"


class DailySidecarHandler(TimedRotatingFileHandler):
    def __init__(self) -> None:
        super().__init__(
            today_log_path(), when="midnight", backupCount=7, encoding="utf-8"
        )

    def doRollover(self) -> None:
        if self.stream:
            self.stream.close()
            self.stream = None
        self.baseFilename = str(today_log_path())
        self.stream = self._open()
        self.rolloverAt = self.computeRollover(int(time.time()))


def cleanup_old_logs(log_dir: Path) -> None:
    cutoff = date.today() - timedelta(days=7)
    for path in glob.glob(os.path.join(log_dir, "*.log")):
        match = re.search(r"(\d{4}-\d{2}-\d{2})", os.path.basename(path))
        if match is None:
            continue
        try:
            log_date = date.fromisoformat(match.group(1))
        except ValueError:
            continue
        if log_date < cutoff:
            os.remove(path)


def init() -> None:
    directory = log_directory()
    directory.mkdir(parents=True, exist_ok=True)
    cleanup_old_logs(directory)
    root = logging.getLogger()
    for handler in root.handlers[:]:
        root.removeHandler(handler)
        handler.close()
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    file_handler = DailySidecarHandler()
    file_handler.setFormatter(formatter)
    stderr_handler = logging.StreamHandler()
    stderr_handler.setFormatter(formatter)
    root.setLevel(logging.INFO)
    root.addHandler(file_handler)
    root.addHandler(stderr_handler)
