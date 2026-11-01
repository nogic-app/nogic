import { useId } from "react";
import { cn } from "@/lib/utils";

export type WaterNeed = "low" | "medium" | "high";
export type SunExposure = "full" | "partial" | "shade";

export interface PlantFormValues {
  latinName: string;
  commonName: string;
  waterNeed: WaterNeed | "";
  sunExposure: SunExposure | "";
  sourceName: string;
  sourceUrl: string;
  sourceQuote: string;
}

export const EMPTY_PLANT_FORM: PlantFormValues = {
  latinName: "",
  commonName: "",
  waterNeed: "",
  sunExposure: "",
  sourceName: "",
  sourceUrl: "",
  sourceQuote: "",
};

export function isPlantFormComplete(values: PlantFormValues): boolean {
  return (
    values.latinName.trim().length > 0 &&
    values.waterNeed !== "" &&
    values.sunExposure !== "" &&
    values.sourceName.trim().length > 0 &&
    values.sourceUrl.trim().length > 0 &&
    values.sourceQuote.trim().length > 0
  );
}

const WATER_OPTIONS: ReadonlyArray<{ value: WaterNeed; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const SUN_OPTIONS: ReadonlyArray<{ value: SunExposure; label: string }> = [
  { value: "full", label: "Full" },
  { value: "partial", label: "Part" },
  { value: "shade", label: "Shade" },
];

const INPUT_CLASSES =
  "w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)] disabled:opacity-60";

const LABEL_CLASSES = "mb-1 block text-sm text-[var(--text-primary)]";

interface PlantUploadFormProps {
  values: PlantFormValues;
  isSaving: boolean;
  canSave: boolean;
  error: string | null;
  onChange: (patch: Partial<PlantFormValues>) => void;
  onCancel: () => void;
  onSave: () => void;
}

export function PlantUploadForm({
  values,
  isSaving,
  canSave,
  error,
  onChange,
  onCancel,
  onSave,
}: PlantUploadFormProps) {
  const latinInputId = useId();
  const commonInputId = useId();
  const sourceInputId = useId();
  const urlInputId = useId();
  const quoteInputId = useId();

  return (
    <div className="w-full max-w-[560px] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <h2 className="text-[16px] font-medium leading-[1.3] text-[var(--text-primary)]">
        Add a plant
      </h2>
      <p className="mt-1 text-sm leading-[1.6] text-[var(--text-secondary)]">
        Nogic will only suggest plants that are in this table, and cite the
        source you give.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={latinInputId} className={LABEL_CLASSES}>
            Latin name
          </label>
          <input
            id={latinInputId}
            type="text"
            value={values.latinName}
            onChange={(event) => onChange({ latinName: event.target.value })}
            placeholder="Genus species"
            disabled={isSaving}
            dir="ltr"
            className={`${INPUT_CLASSES} font-mono`}
          />
        </div>
        <div>
          <label htmlFor={commonInputId} className={LABEL_CLASSES}>
            Common name
          </label>
          <input
            id={commonInputId}
            type="text"
            value={values.commonName}
            onChange={(event) => onChange({ commonName: event.target.value })}
            placeholder="e.g. romarin"
            disabled={isSaving}
            className={INPUT_CLASSES}
          />
        </div>

        <div>
          <span className={LABEL_CLASSES}>Water</span>
          <div className="flex gap-1" role="group" aria-label="Water">
            {WATER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={values.waterNeed === option.value}
                onClick={() => onChange({ waterNeed: option.value })}
                disabled={isSaving}
                className={cn(
                  "h-8 flex-1 rounded-md border px-2 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-60",
                  values.waterNeed === option.value
                    ? "border-transparent bg-[var(--accent-subtle)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className={LABEL_CLASSES}>Sun</span>
          <div className="flex gap-1" role="group" aria-label="Sun">
            {SUN_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={values.sunExposure === option.value}
                onClick={() => onChange({ sunExposure: option.value })}
                disabled={isSaving}
                className={cn(
                  "h-8 flex-1 rounded-md border px-2 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-60",
                  values.sunExposure === option.value
                    ? "border-transparent bg-[var(--accent-subtle)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor={sourceInputId} className={LABEL_CLASSES}>
            Source
          </label>
          <input
            id={sourceInputId}
            type="text"
            value={values.sourceName}
            onChange={(event) => onChange({ sourceName: event.target.value })}
            placeholder="e.g. Kew POWO"
            disabled={isSaving}
            className={INPUT_CLASSES}
          />
        </div>
        <div>
          <label htmlFor={urlInputId} className={LABEL_CLASSES}>
            Source URL
          </label>
          <input
            id={urlInputId}
            type="text"
            value={values.sourceUrl}
            onChange={(event) => onChange({ sourceUrl: event.target.value })}
            placeholder="https://"
            disabled={isSaving}
            dir="ltr"
            className={INPUT_CLASSES}
          />
        </div>

        <div className="col-span-2">
          <label htmlFor={quoteInputId} className={LABEL_CLASSES}>
            Verbatim quote from the source
          </label>
          <textarea
            id={quoteInputId}
            value={values.sourceQuote}
            onChange={(event) => onChange({ sourceQuote: event.target.value })}
            placeholder="Paste the exact sentence that supports this entry."
            disabled={isSaving}
            rows={3}
            className={`${INPUT_CLASSES} resize-y`}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="h-8 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 text-[13px] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave || isSaving}
          className="h-8 rounded-md bg-[var(--accent)] px-3 text-[13px] text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-40"
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
