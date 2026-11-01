import type { ModelOption } from "@/modelCatalog.ts";
import type { HardwareInfo } from "@/types/hardware";

export type ModelFit = "recommended" | "tight" | "wont-fit" | "unknown";

export interface ModelRecommendation {
  model: ModelOption;
  fit: ModelFit;
  /** Only the first recommended model in the list carries the green badge. */
  featured: boolean;
}

/**
 * Decide whether a model fits the detected GPU.
 *
 * `hardware === null` means detection has not finished, so no claim is made.
 * A `vram_gb` of null/0 means CPU only: CPU models are recommended and GPU
 * models are reported as "Won't fit".
 */
export function modelFit(
  model: ModelOption,
  hardware: HardwareInfo | null,
): ModelFit {
  const vram = hardware?.vram_gb ?? 0;
  if (vram <= 0) {
    return model.cpuOnly ? "recommended" : "wont-fit";
  }

  if (model.requiredVramGb <= vram * 0.8) return "recommended";
  if (model.requiredVramGb <= vram) return "tight";
  return "wont-fit";
}

/** Filter, sort, and badge models against the detected VRAM and install state. */
export function recommendModels(
  models: ReadonlyArray<ModelOption>,
  hardware: HardwareInfo | null,
  installedModels: ReadonlyArray<string> = [],
): ModelRecommendation[] {
  const vram = hardware?.vram_gb ?? 0;
  const installed = new Set(installedModels);
  const ranked = models
    .map((model, index) => {
      const fit = modelFit(model, hardware);
      const isInstalled = installed.has(model.name);
      const visible = model.requiredVramGb <= vram || isInstalled;
      return { model, fit, index, isInstalled, visible };
    })
    .filter((entry) => entry.visible)
    .sort((a, b) => {
      if (a.isInstalled !== b.isInstalled) return a.isInstalled ? -1 : 1;
      const fitPriority = (fit: ModelFit) =>
        fit === "recommended" ? 0 : fit === "tight" ? 1 : 2;
      return (
        fitPriority(a.fit) - fitPriority(b.fit) ||
        a.model.requiredVramGb - b.model.requiredVramGb ||
        a.index - b.index
      );
    });

  return ranked.map(({ model, fit }, index) => ({
    model,
    fit,
    featured: index === 0 && fit === "recommended",
  }));
}
