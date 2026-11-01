"""Real usage measurements for Settings -> Usage.

Nothing in this module invents a number: the speed test streams a real prompt
through Ollama and times the response, and token counts come from Ollama's own
report (with the received chunk count as a measured fallback).
"""

import logging
import time
from typing import Any

import ollama

logger = logging.getLogger(__name__)

SPEED_TEST_PROMPT = "Write a 50-word poem about trees."
SPEED_TEST_OPTIONS = {"temperature": 0.2, "num_predict": 160}


def _content(chunk: Any) -> str:
    message = getattr(chunk, "message", None)
    content = getattr(message, "content", "") if message is not None else ""
    return content if isinstance(content, str) else ""


def run_speed_test(model: str) -> dict[str, object]:
    """Stream a fixed prompt and measure TTFT and generation speed."""
    if not isinstance(model, str) or not model.strip():
        raise ValueError("Select a model before running the speed test.")
    model_name = model.strip()

    started_at = time.time()
    first_token_at: float | None = None
    received_text: list[str] = []
    received_chunks = 0
    eval_count: int | None = None

    try:
        stream = ollama.chat(
            model=model_name,
            messages=[{"role": "user", "content": SPEED_TEST_PROMPT}],
            stream=True,
            # Answer directly: a reasoning model (e.g. gemma4) would otherwise
            # spend the whole budget on hidden thinking and return no content.
            think=False,
            options=SPEED_TEST_OPTIONS,
        )
        for chunk in stream:
            content = _content(chunk)
            if content:
                if first_token_at is None:
                    first_token_at = time.time()
                received_text.append(content)
                received_chunks += 1
            count = getattr(chunk, "eval_count", None)
            if isinstance(count, int) and count > 0:
                eval_count = count
    except Exception:
        logger.exception("The speed test failed for model %s.", model_name)
        raise

    finished_at = time.time()
    if not received_text or first_token_at is None:
        raise RuntimeError("The model returned no answer for the speed test.")

    ttft = first_token_at - started_at
    generation_seconds = max(finished_at - first_token_at, 0.001)
    tokens = eval_count if eval_count is not None else received_chunks
    tokens_per_sec = tokens / generation_seconds if tokens > 0 else 0.0

    return {
        "ttft": round(ttft, 2),
        "tokens_per_sec": round(tokens_per_sec, 1),
        "tokens": tokens,
        "model": model_name,
        "duration": round(finished_at - started_at, 2),
    }
