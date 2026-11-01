"""Map-reduce and vision calls for attachment questions."""

import logging
import time
from typing import Any

import ollama

from chat_engine import Emit
from document_processor import chunk_text
from errors import classify

logger = logging.getLogger(__name__)

VISION_OOM_NOTICE = (
    "Your GPU ran out of memory processing this image. Try a smaller image "
    "or pull a dedicated vision model."
)

DOCUMENT_SYSTEM_PROMPT = (
    "Answer the user's question using only the attached document. "
    "If the document does not contain the answer, say so plainly and do not invent facts."
)
SUMMARY_PROMPT = (
    "Summarize the document findings below for a later answer. Preserve every "
    "fact relevant to the user's question, remove repetition, and be concise. "
    "Do not add facts that are not in the findings."
)
def _response_text(response: Any) -> str:
    message = response.get("message") if hasattr(response, "get") else getattr(response, "message", None)
    if hasattr(message, "get"):
        value = message.get("content")
    else:
        value = getattr(message, "content", None)
    return value if isinstance(value, str) else ""


def _document_call(
    model: str,
    question: str,
    chunk: str,
    *,
    options: dict[str, object] | None = None,
) -> str:
    response = ollama.chat(
        model=model,
        messages=[
            {"role": "system", "content": DOCUMENT_SYSTEM_PROMPT},
            {"role": "user", "content": f"Question:\n{question}\n\nDocument part:\n{chunk}"},
        ],
        options=options or {"num_predict": 1024, "temperature": 0.1},
        stream=False,
    )
    return _response_text(response).strip()


def _summarize_batch(model: str, question: str, batch: str) -> str:
    response = ollama.chat(
        model=model,
        messages=[
            {"role": "system", "content": SUMMARY_PROMPT},
            {"role": "user", "content": f"Question:\n{question}\n\nFindings:\n{batch}"},
        ],
        options={"num_predict": 1024, "temperature": 0.1},
        stream=False,
    )
    return _response_text(response).strip()


def _recursive_reduce(model: str, question: str, mapped_results: str) -> str:
    while len(mapped_results) > 6000:
        batches = chunk_text(mapped_results, max_chars=6000)
        summaries = [
            _summarize_batch(model, question, batch)
            for batch in batches
        ]
        reduced = "\n\n".join(summary for summary in summaries if summary)
        if not reduced or len(reduced) >= len(mapped_results):
            raise RuntimeError("Document summaries did not reduce the mapped results.")
        mapped_results = reduced
    return mapped_results


def run_document_qa(
    model: str,
    question: str,
    document_chunks: list[str],
    image_attachments: list[dict[str, Any]],
    emit: Emit,
    req_id: Any,
) -> str:
    """Answer from attachments without truncating their extracted content."""
    try:
        if image_attachments:
            try:
                response = ollama.chat(
                    model=model,
                    messages=[{
                        "role": "user",
                        "content": question or "Describe the attached image.",
                        "images": [image["data"] for image in image_attachments],
                    }],
                    think=False,
                    options={"num_predict": 512},
                    stream=False,
                )
            except Exception:
                logger.exception("Vision request failed.")
                raise
            answer = _response_text(response).strip()
            return answer or "The vision model returned no answer."

        if not document_chunks:
            return "I couldn't extract readable text from the attachment."

        extracted: list[str] = []
        total = len(document_chunks)
        for index, chunk in enumerate(document_chunks, start=1):
            emit({
                "type": "chat_step",
                "id": req_id,
                "step": f"reading document part {index} of {total}",
            })
            extracted.append(_document_call(model, question, chunk))
            if index < total:
                time.sleep(1)
        if total == 1:
            return extracted[0]

        mapped_results = "\n\n".join(
            f"Document part {index}:\n{result}"
            for index, result in enumerate(extracted, start=1)
            if result
        )
        if not mapped_results:
            return "The model could not extract relevant information from the document."
        mapped_results = _recursive_reduce(model, question, mapped_results)
        emit({"type": "chat_step", "id": req_id, "step": "drafting"})
        return _document_call(
            model,
            question,
            "The following are findings extracted from every part of the document. "
            "Synthesize them into one cohesive answer and resolve repetition:\n\n"
            + mapped_results,
            options={"num_predict": 2048, "temperature": 0.1},
        )
    except Exception as error:
        logger.exception("Attachment model failed.")
        payload = classify(error)
        emit({
            "type": "error",
            "id": req_id,
            "error": payload["message"],
            "payload": payload,
        })
        if payload["bucket"] == "gpu":
            return VISION_OOM_NOTICE
        return str(payload["message"])
