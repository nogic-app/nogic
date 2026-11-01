import type { HardwareInfo } from "@/types/hardware";

export type HardwareTier = "T1" | "T2" | "T3" | "T4";

/** Mirror the backend tier thresholds so the UI and prompt agree. */
export function getHardwareTier(hardware: HardwareInfo | null): HardwareTier {
  const vram = hardware?.vram_gb ?? null;
  const ram = hardware?.total_ram_gb ?? 0;
  if (vram === null || vram === 0) return ram < 8 ? "T1" : "T2";
  if (vram < 4) return "T1";
  if (vram < 6) return "T2";
  if (vram < 8) return "T3";
  return "T4";
}

export function isExtractiveHardware(hardware: HardwareInfo | null): boolean {
  if (!hardware) return false;
  const tier = getHardwareTier(hardware);
  return tier === "T1" || tier === "T2";
}
