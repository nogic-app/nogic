"""Ollama streaming, thinking extraction, and the DeepThink multi-pass loop."""

import sys
from typing import Any, Callable

import ollama

from deep_think_prompts import (
    CRITIQUE_INSTRUCTION,
    DRAFT_INSTRUCTION,
    PLAN_INSTRUCTION,
    REVISE_INSTRUCTION,
)

Emit = Callable[[dict[str, Any]], None]

ANSWER_OPTIONS = {"num_predict": 1024, "temperature": 0.1}
# DeepThink passes must fit both the reasoning stream and the visible text.
# With think=True, a 512/1024 budget was consumed before the answer started.
DEEP_THINK_OPTIONS = {"num_predict": 2048, "temperature": 0.2}
MAX_HELPER_CHARS = 2000
CRASH_NOTICE = "\n[Model crashed due to memory limits. Try switching to Fast mode.]"


def _log(message: str) -> None:
    print(f"DeepThink: {message}", file=sys.stderr, flush=True)


def _message_field(message: Any, name: str) -> str:
    """Read a field from an Ollama Message object or a plain dict."""
    if hasattr(message, "get"):
        value = message.get(name)
    else:
        value = getattr(message, name, None)
    return value if isinstance(value, str) else ""


def _emit_step(emit: Emit, req_id: Any, label: str) -> None:
    emit({"type": "chat_step", "id": req_id, "step": label})


def _emit_thinking(emit: Emit, req_id: Any, content: str) -> None:
    emit({"type": "chat_thinking_chunk", "id": req_id, "content": content})


def _stream_call(
    model: str,
    messages: list[dict[str, Any]],
    think: bool,
    options: dict[str, Any],
    emit: Emit,
    req_id: Any,
    parts: list[str],
    thinking_parts: list[str] | None = None,
    emit_text: bool = True,
) -> None:
    """Stream one Ollama call, forwarding reasoning and answer text.

    Text is emitted as `chat_chunk` (unless this is a DeepThink helper pass)
    and appended to `parts` as it arrives, so a mid-stream failure keeps
    whatever the user already saw. Reasoning is appended to `thinking_parts`
    when the caller needs it for persistence.
    """
    stream = ollama.chat(
        model=model,
        messages=messages,
        think=think,
        options=options,
        stream=True,
    )
    for chunk in stream:
        message = chunk["message"]
        thinking = _message_field(message, "thinking")
        if thinking:
            _emit_thinking(emit, req_id, thinking)
            if thinking_parts is not None:
                thinking_parts.append(thinking)
        text = _message_field(message, "content")
        if text:
            if emit_text:
                emit({"type": "chat_chunk", "id": req_id, "content": text})
            parts.append(text)


def stream_answer(
    model: str,
    messages: list[dict[str, Any]],
    think: bool,
    emit: Emit,
    req_id: Any,
    prefix: str = "",
    thinking_parts: list[str] | None = None,
    options: dict[str, Any] | None = None,
    emit_notice: bool = True,
) -> str:
    """Stream one answer, forwarding reasoning as chat_thinking_chunk.

    A `think=True` pass can exhaust GPU memory and kill llama-server. When
    that happens with no text produced yet, retry once with `think=False`.
    If that fails too, the user gets a clean notice instead of a raw crash
    log; the caller still emits `chat_done` afterwards. DeepThink disables
    the notice so it can substitute its draft instead.
    """
    parts: list[str] = []
    if prefix:
        emit({"type": "chat_chunk", "id": req_id, "content": prefix})
        parts.append(prefix)

    attempts = [True, False] if think else [False]
    for index, attempt_think in enumerate(attempts):
        try:
            _stream_call(
                model,
                messages,
                attempt_think,
                options or ANSWER_OPTIONS,
                emit,
                req_id,
                parts,
                thinking_parts,
            )
            return "".join(parts)
        except Exception as e:
            _log(f"stream failed (think={attempt_think}): {e}")
            # Retry without reasoning only if nothing was streamed yet.
            if index + 1 < len(attempts) and "".join(parts) == prefix:
                continue
            break

    if not emit_notice:
        return "".join(parts)
    emit({"type": "chat_chunk", "id": req_id, "content": CRASH_NOTICE})
    return "".join(parts) + CRASH_NOTICE


def _complete(
    model: str,
    system_prompt: str,
    conversation: list[dict[str, Any]],
    instruction: str,
    emit: Emit,
    req_id: Any,
    think: bool = True,
    thinking_parts: list[str] | None = None,
) -> str:
    """Run one streamed helper pass; failure leaves an empty result.

    Each pass streams its reasoning into the Reasoning panel. If a
    `think=True` pass dies from memory pressure, retry once without
    reasoning so the DeepThink loop can still produce an answer.
    """
    attempts = [True, False] if think else [False]
    for attempt_think in attempts:
        parts: list[str] = []
        try:
            _stream_call(
                model,
                [
                    {"role": "system", "content": system_prompt},
                    *conversation,
                    {"role": "user", "content": instruction},
                ],
                attempt_think,
                DEEP_THINK_OPTIONS,
                emit,
                req_id,
                parts,
                thinking_parts,
                # Plan/draft/critique text is scratch work, not the answer.
                emit_text=False,
            )
            return "".join(parts).strip()
        except Exception as error:
            _log(f"helper pass failed (think={attempt_think}): {error}")
    return ""


def _clip(text: str) -> str:
    return text[:MAX_HELPER_CHARS]


def run_deep_think(
    model: str,
    messages: list[dict[str, Any]],
    emit: Emit,
    req_id: Any,
    prefix: str = "",
    thinking_parts: list[str] | None = None,
    num_predict: int | None = None,
) -> str:
    """Plan -> Draft -> Critique -> Revise, streaming every step.

    All four passes ask for reasoning and get a 2,048-token budget so the
    model can finish thinking and still write the answer. Each one falls
    back to `think=False` automatically when Ollama runs out of memory.
    The loop is defensive: a Revise pass that produces no text returns the
    draft, and an unexpected error still leaves the caller able to emit
    `chat_done`.
    """
    if not messages or messages[0].get("role") != "system":
        raise ValueError("DeepThink needs a system prompt as the first message.")

    system_prompt = messages[0]["content"]
    conversation = messages[1:]

    plan = ""
    draft = ""
    critique = ""
    answer = ""
    try:
        _emit_step(emit, req_id, "planning")
        plan = _complete(
            model,
            system_prompt,
            conversation,
            PLAN_INSTRUCTION,
            emit,
            req_id,
            thinking_parts=thinking_parts,
        )

        _emit_step(emit, req_id, "drafting")
        draft = _complete(
            model,
            system_prompt,
            conversation,
            DRAFT_INSTRUCTION.format(plan=_clip(plan) or "No plan produced."),
            emit,
            req_id,
            thinking_parts=thinking_parts,
        )

        _emit_step(emit, req_id, "critiquing")
        critique = _complete(
            model,
            system_prompt,
            conversation,
            CRITIQUE_INSTRUCTION.format(
                plan=_clip(plan) or "No plan produced.",
                draft=_clip(draft) or "No draft produced.",
            ),
            emit,
            req_id,
            thinking_parts=thinking_parts,
        )

        _emit_step(emit, req_id, "revising")
        revise_messages = [
            *messages,
            {
                "role": "user",
                "content": REVISE_INSTRUCTION.format(
                    plan=_clip(plan) or "No plan produced.",
                    draft=_clip(draft) or "No draft produced.",
                    critique=_clip(critique) or "No critique produced.",
                ),
            },
        ]
        final_options = (
            {**DEEP_THINK_OPTIONS, "num_predict": num_predict}
            if num_predict is not None
            else DEEP_THINK_OPTIONS
        )
        answer = stream_answer(
            model=model,
            messages=revise_messages,
            think=True,
            emit=emit,
            req_id=req_id,
            prefix=prefix,
            thinking_parts=thinking_parts,
            options=final_options,
            # The draft is a better fallback than a crash notice.
            emit_notice=False,
        )
    except Exception as error:
        _log(f"pass failed: {error}")

    # A failed or empty Revise pass must not leave an empty bubble. Ignore the
    # deterministic prefix when deciding whether the model produced anything.
    visible = answer[len(prefix):] if prefix and answer.startswith(prefix) else answer
    if not visible.strip():
        if draft:
            _log("revise produced no answer; streaming the draft")
            if prefix and not answer.startswith(prefix):
                emit({"type": "chat_chunk", "id": req_id, "content": prefix})
            emit({"type": "chat_chunk", "id": req_id, "content": draft})
            answer = f"{prefix}{draft}"
        else:
            if prefix and not answer.startswith(prefix):
                emit({"type": "chat_chunk", "id": req_id, "content": prefix})
            emit({"type": "chat_chunk", "id": req_id, "content": CRASH_NOTICE})
            answer = f"{prefix}{CRASH_NOTICE}"
    return answer
