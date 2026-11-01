import re

RULES = (
    (("os error 232", "connection refused", "connection error", "connecterror",
      "failed to connect", "all connection attempts failed"),
     ("network", "The Nogic engine isn't running. Click Retry.", "retry", "Retry")),
    (("0xc0000409", "cuda", "vram", "out of memory"),
     ("gpu", "The model ran out of memory.", "open_settings", "Open Settings")),
    (("model not found", "no model selected", "no model is selected",
      "model does not exist"),
     ("model", "The selected model isn't available.", "open_settings", "Open Settings")),
    (("modulenotfounderror",),
     ("file", "The engine is missing a file.", "open_logs", "Open Logs")),
    (("no such table", "sqlite"),
     ("db", "Couldn't read local data.", "retry", "Retry")),
)


def _payload(bucket: str, message: str, kind: str, label: str) -> dict[str, object]:
    return {
        "bucket": bucket,
        "message": message,
        "action": {"kind": kind, "label": label},
    }


def classify(exc: BaseException) -> dict[str, object]:
    lower = str(exc).lower()
    if lower == "installation cancelled by user.":
        return _payload(
            "file",
            "Installation cancelled by user.",
            "retry",
            "Retry",
        )
    if lower == "installation cancelled by user or failed.":
        return _payload(
            "file",
            "Installation cancelled by user or failed.",
            "retry",
            "Retry",
        )
    # `oom` must stand alone: a plain substring match treats words such as
    # "boom" as a GPU memory failure.
    if re.search(r"\boom\b", lower):
        return _payload(
            "gpu", "The model ran out of memory.", "open_settings", "Open Settings"
        )
    for terms, values in RULES:
        if any(term in lower for term in terms):
            return _payload(*values)
    return _payload(
        "file", "Nogic couldn't complete this action. Check the logs.",
        "open_logs", "Open Logs",
    )
