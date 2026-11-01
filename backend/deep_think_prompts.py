"""Instruction prompts for the DeepThink plan/draft/critique/revise passes."""

PLAN_INSTRUCTION = (
    "Before answering the user's question above, write a concise plan of at "
    "most five bullet points for a correct, well-grounded answer. Do not "
    "answer the question yet."
)

DRAFT_INSTRUCTION = (
    "Using the plan below, write a complete draft answer to the user's "
    "question above. Follow the system instructions exactly, including any "
    "citation or refusal rules.\n\nPLAN:\n{plan}"
)

CRITIQUE_INSTRUCTION = (
    "Critique the draft below for factual accuracy, grounding in the provided "
    "context, and completeness. List concrete issues only. Do not rewrite the "
    "answer.\n\nPLAN:\n{plan}\n\nDRAFT:\n{draft}"
)

REVISE_INSTRUCTION = (
    "Write the final answer to the user's question above. Fix every issue in "
    "the critique. Do not mention the plan, draft, or critique. Output only "
    "the final answer.\n\nPLAN:\n{plan}\n\nDRAFT:\n{draft}\n\nCRITIQUE:\n"
    "{critique}"
)
