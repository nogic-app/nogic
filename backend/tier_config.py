"""Hardware tiers and context budgets for the 4 GB VRAM floor."""

from typing import Any

_T1 = {"max_law_articles": 3, "max_plants": 3, "num_predict": 512, "extractive": True}
_T2 = {"max_law_articles": 5, "max_plants": 4, "num_predict": 768, "extractive": True}
_T34 = {"max_law_articles": 8, "max_plants": 5, "num_predict": 1024, "extractive": False}
_BUDGETS = {"T1": _T1, "T2": _T2, "T3": _T34, "T4": _T34}


def get_tier(vram_gb: float | None, ram_gb: float) -> str:
    """Classify detected hardware into a model tier."""
    if vram_gb is None or vram_gb == 0:
        return "T1" if ram_gb < 8 else "T2"
    if vram_gb < 4:
        return "T1"
    if vram_gb < 6:
        return "T2"
    if vram_gb < 8:
        return "T3"
    return "T4"


def get_context_budget(tier: str) -> dict[str, Any]:
    """Return a copy so callers cannot mutate the shared budget."""
    return dict(_BUDGETS.get(tier, _T34))


def budget_for_hardware(hardware: object) -> tuple[str, dict[str, Any]]:
    """Resolve a tier and budget from the frontend hardware payload."""
    if not isinstance(hardware, dict):
        return "T4", get_context_budget("T4")
    vram = hardware.get("vram_gb")
    ram = hardware.get("total_ram_gb")
    vram_gb = float(vram) if isinstance(vram, (int, float)) else None
    ram_gb = float(ram) if isinstance(ram, (int, float)) else 0.0
    tier = get_tier(vram_gb, ram_gb)
    return tier, get_context_budget(tier)
