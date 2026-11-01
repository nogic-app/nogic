import type { Plant } from "@/components/PlantCard.tsx";

/** Mirrors the provenance schema in backend/data/plants.json. */
export interface PlantData {
  id: string;
  latin_name: string;
  /** Imported rows may leave descriptive fields blank or null. */
  common_name: string | null | undefined;
  water_need: string | null | undefined;
  sun_exposure: string | null | undefined;
  /** Optional label supplied by /add-plant; the card derives one from the URL. */
  source_name?: string | null | undefined;
  source_url: string;
  source_quote: string;
  verified: boolean;
  common_name_ar?: string | null;
  native_to_morocco?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOptionalText(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Only provenance-bearing fields are required. Trait fields such as
 * `water_need` and `sun_exposure` may be empty strings: the importer stores a
 * blank cell as "" rather than inventing data, and the card hides those rows.
 */
export function isPlantData(value: unknown): value is PlantData {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyText(value.id) &&
    isNonEmptyText(value.latin_name) &&
    isNonEmptyText(value.source_url) &&
    isNonEmptyText(value.source_quote) &&
    typeof value.verified === "boolean" &&
    isOptionalText(value.common_name) &&
    isOptionalText(value.water_need) &&
    isOptionalText(value.sun_exposure) &&
    isOptionalText(value.source_name) &&
    isOptionalText(value.common_name_ar) &&
    (value.native_to_morocco === undefined ||
      typeof value.native_to_morocco === "boolean")
  );
}

export function isPlantDataArray(value: unknown): value is PlantData[] {
  return Array.isArray(value) && value.every(isPlantData);
}

function text(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function capitalize(value: string): string {
  return value.length > 0
    ? value.charAt(0).toUpperCase() + value.slice(1)
    : "";
}

function formatWater(value: string | null | undefined): string {
  return capitalize(text(value));
}

function formatSun(value: string | null | undefined): string {
  const normalized = text(value).toLowerCase();
  if (normalized === "full" || normalized === "full sun") return "Full sun";
  if (normalized === "partial" || normalized === "partial shade") {
    return "Partial shade";
  }
  if (normalized === "shade") return "Shade";
  return capitalize(normalized);
}

export function toPlantCard(plant: PlantData): Plant {
  return {
    latin: text(plant.latin_name),
    common: text(plant.common_name),
    water: formatWater(plant.water_need),
    sun: formatSun(plant.sun_exposure),
    sourceUrl: text(plant.source_url),
    quote: text(plant.source_quote),
    verified: plant.verified,
  };
}
