import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Pill } from "./Pill.tsx";
import { modelFit, type ModelRecommendation } from "@/modelRecommendations.ts";
import type { ModelOption } from "@/modelCatalog.ts";
import type { HardwareInfo } from "@/types/hardware";

/** Title + one-sentence explanation shared by every onboarding step. */
export function StepHeading({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h1 className="text-greet font-medium text-[var(--text-primary)]">
        {title}
      </h1>
      <p className="mt-2 max-w-[46ch] text-body text-[var(--text-secondary)]">
        {body}
      </p>
    </div>
  );
}

interface ModelRowProps {
  model: ModelOption;
  hardware: HardwareInfo | null;
  /** True for the first model that fits the detected hardware. */
  featured: boolean;
  selected: boolean;
  onSelect: () => void;
}

/** One selectable entry from the Settings model advisor. */
export function ModelRow({
  model,
  hardware,
  featured,
  selected,
  onSelect,
}: ModelRowProps) {
  const { t } = useTranslation();
  const fit = modelFit(model, hardware);
  // Only the first recommended model gets the green badge; later entries that
  // also fit stay quiet instead of repeating the same claim.
  const badge =
    fit === "recommended" && featured
      ? { label: t("settings.recommended"), variant: "accent" as const }
      : fit === "tight"
        ? { label: t("settings.tightFit"), variant: "warning" as const }
        : fit === "wont-fit"
          ? { label: t("settings.wontFit"), variant: "danger" as const }
          : null;
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-start transition-colors duration-[120ms]",
          selected
            ? "border-[var(--accent)] bg-[var(--accent-subtle)]"
            : "border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)]",
        )}
      >
        <span className="min-w-0">
          <span className="block font-mono text-sec font-medium text-[var(--text-primary)]">
            {model.name}
          </span>
          <span className="mt-0.5 block text-meta text-[var(--text-secondary)]">
            {model.sizeLabel}
          </span>
          <span className="mt-1 flex flex-wrap gap-1">
            {model.capabilities.map((capability) => (
              <span
                key={capability}
                className="rounded-full bg-[var(--accent-subtle)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--accent)]"
              >
                {capability}
              </span>
            ))}
          </span>
        </span>
        {badge ? <Pill variant={badge.variant}>{badge.label}</Pill> : null}
      </button>
    </li>
  );
}

export function OnboardingModelList({
  hardware,
  onSelect,
  recommendations,
  selectedModel,
}: {
  hardware: HardwareInfo | null;
  onSelect: (model: ModelOption) => void;
  recommendations: ModelRecommendation[];
  selectedModel: string;
}) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? recommendations : recommendations.slice(0, 5);

  return (
    <>
      <ul className="mt-5 space-y-2">
        {visible.map(({ model, featured }) => (
          <ModelRow
            key={model.name}
            model={model}
            hardware={hardware}
            featured={featured}
            selected={selectedModel === model.name}
            onSelect={() => onSelect(model)}
          />
        ))}
      </ul>
      {recommendations.length > 5 ? (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="mt-3 text-sec text-[var(--accent)] hover:underline"
        >
          {showAll
            ? t("settings.showLessModels")
            : t("settings.showAllModels", { count: recommendations.length })}
        </button>
      ) : null}
    </>
  );
}
