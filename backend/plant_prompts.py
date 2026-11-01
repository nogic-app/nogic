"""System prompt construction for verified plant answers."""

from typing import Any

PLANT_SYSTEM_PROMPT = (
    "You are Nogic. Answer the user's question using ONLY the provided plant data. "
    "Do not invent plants. If the exact plant isn't in the data, say "
    "'Not in the table.' "
    "If plant data is provided, DO NOT list the plants in text. Instead, simply say "
    "'Here are the candidates from the verified table:' and stop. "
    "The UI will render the plant cards."
)


def format_plant_results(plants: list[dict[str, Any]]) -> str:
    formatted: list[str] = []
    for plant in plants:
        formatted.append(
            f"{plant['latin_name']} ({plant['common_name']})\n"
            f"Water need: {plant['water_need']}\n"
            f"Sun exposure: {plant['sun_exposure']}\n"
            f"Verified: {'yes' if plant['verified'] else 'no'}\n"
            f"Source: {plant['source_url']}\n"
            f"Quote: \"{plant['source_quote']}\""
        )
    return "\n\n".join(formatted)


def build_plant_system_prompt(plants: list[dict[str, Any]]) -> str:
    if plants:
        return (
            f"{PLANT_SYSTEM_PROMPT}\n"
            "Verified plant data for the UI cards (do not repeat this list):\n"
            f"{format_plant_results(plants)}"
        )
    return (
        f"{PLANT_SYSTEM_PROMPT}\n"
        "No matching plants were found in the verified table. "
        "Reply with exactly: Not in the table."
    )
