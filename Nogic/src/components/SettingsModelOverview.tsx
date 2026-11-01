import { useTranslation } from "react-i18next";
import type { HardwareInfo } from "@/types/hardware";
import { ErrorSurface } from "@/components/ErrorSurface.tsx";
import type { ErrorPayload } from "@/types/errors.ts";

interface SettingsModelOverviewProps {
  activeModel: string;
  capabilities: string[];
  fallbackModel: string;
  installedModels: string[];
  isRefreshing: boolean;
  onFallbackModelChange: (model: string) => void;
  onModelChange: (model: string) => void;
  status: "checking" | "running" | "offline";
  hardwareInfo: HardwareInfo | null;
  hardwareLoading: boolean;
  hardwareError: ErrorPayload | null;
  modelError: ErrorPayload | null;
  onRetryHardware: () => void;
  onRetryModels: () => void;
}

const NETWORK_ERROR: ErrorPayload = {
  bucket: "network",
  message: "The Nogic engine isn't running. Click Retry.",
  action: { kind: "retry", label: "Retry" },
};

const CAPABILITY_LABELS: Record<string, string> = {
  vision: "Vision",
  tools: "Tools",
  thinking: "Thinking",
};

/** Formats a possibly-null hardware value without ever calling .toFixed() on null. */
const fmt = (n: number | null | undefined, unit: string): string =>
  n == null ? `— ${unit}` : `${n.toFixed(1)} ${unit}`;

/**
 * A failed detection can resolve with the Rust fallback struct (empty strings
 * and zeroed memory) instead of rejecting. Treat that as "not detected" rather
 * than rendering a misleading "0.0 GB RAM".
 */
function hasDetectedHardware(info: HardwareInfo | null): info is HardwareInfo {
  if (!info) return false;
  return (
    info.cpu_name.trim().length > 0 ||
    Boolean(info.gpu_name) ||
    (info.total_ram_gb ?? 0) > 0
  );
}

export function SettingsModelOverview({
  activeModel,
  capabilities,
  fallbackModel,
  installedModels,
  isRefreshing,
  onFallbackModelChange,
  onModelChange,
  status,
  hardwareInfo,
  hardwareLoading,
  hardwareError,
  modelError,
  onRetryHardware,
  onRetryModels,
}: SettingsModelOverviewProps) {
  const { t } = useTranslation();
  const activeSelection = installedModels.includes(activeModel) ? activeModel : "";
  const fallbackSelection = installedModels.includes(fallbackModel)
    ? fallbackModel
    : "";
  const shownCapabilities = capabilities.filter(
    (capability) => capability in CAPABILITY_LABELS,
  );

  return (
    <>
      {hardwareError ? (
        <ErrorSurface payload={hardwareError} onRetry={onRetryHardware} />
      ) : modelError ? (
        <ErrorSurface payload={modelError} onRetry={onRetryModels} />
      ) : status === "offline" ? (
        <ErrorSurface payload={NETWORK_ERROR} onRetry={onRetryModels} />
      ) : null}
      <section>
        <div className="flex items-center gap-3">
          <h3 className="text-title font-medium text-[var(--text-primary)]">
            {t("settings.ollama")}
          </h3>
          <span
            className={`inline-flex items-center gap-2 rounded-full bg-[var(--bg-muted)] px-2.5 py-1 text-meta ${
              status === "offline"
                ? "text-[var(--danger)]"
                : "text-[var(--text-secondary)]"
            }`}
            aria-live="polite"
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${
                status === "running"
                  ? "bg-[var(--accent)]"
                  : status === "offline"
                    ? "bg-[var(--danger)]"
                    : "bg-[var(--text-tertiary)]"
              }`}
            />
            {status === "checking"
              ? t("settings.checking")
              : status === "running"
                ? t("settings.running")
                : t("settings.offline")}
          </span>
        </div>
        <p className="mt-1 text-meta text-[var(--text-secondary)]">
          {t("settings.ollamaDescription")}
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <label className="block text-meta text-[var(--text-secondary)]">
          {t("settings.model")}
          <select
            aria-label={t("settings.model")}
            value={activeSelection}
            disabled={installedModels.length === 0 || isRefreshing}
            onChange={(event) => {
              if (event.target.value) onModelChange(event.target.value);
            }}
            className="mt-1 block h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-sec text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--focus)] disabled:text-[var(--text-tertiary)]"
          >
            <option value="">
              {status === "offline"
                ? t("settings.ollamaOffline")
                : installedModels.length > 0
                  ? t("settings.chooseInstalledModel")
                  : t("settings.noInstalledModels")}
            </option>
            {installedModels.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-meta text-[var(--text-secondary)]">
          {t("settings.fallbackModel")}
          <select
            aria-label={t("settings.fallbackModel")}
            value={fallbackSelection}
            disabled={installedModels.length === 0 || isRefreshing}
            onChange={(event) => onFallbackModelChange(event.target.value)}
            className="mt-1 block h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 text-sec text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--focus)] disabled:text-[var(--text-tertiary)]"
          >
            <option value="">
              {status === "offline"
                ? t("settings.ollamaOffline")
                : installedModels.length > 0
                  ? t("settings.chooseInstalledModel")
                  : t("settings.noInstalledModels")}
            </option>
            {installedModels.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
      </section>

      {shownCapabilities.length > 0 ? (
        <section>
          <p className="text-meta text-[var(--text-secondary)]">
            {t("settings.capabilities", "Capabilities")}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {shownCapabilities.map((capability) => (
              <span
                key={capability}
                className="rounded-full bg-[var(--accent-subtle)] px-2 py-0.5 text-[11px] uppercase tracking-wide text-[var(--accent)]"
              >
                {CAPABILITY_LABELS[capability]}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex items-start justify-between gap-4 rounded-lg bg-[var(--bg-muted)] p-4">
        <div>
          <p className="text-meta text-[var(--text-secondary)]">
            {t("settings.yourMachine")}
          </p>
          {hardwareLoading ? (
            <p className="mt-1 font-mono text-sec text-[var(--text-primary)]">
              {t("settings.detectingHardware")}
            </p>
          ) : hardwareError || !hasDetectedHardware(hardwareInfo) ? (
            <p className="mt-1 font-mono text-sec text-[var(--text-primary)]">
              {t("settings.hardwareNotDetected")}
            </p>
          ) : (
            <>
              <p className="mt-1 font-mono text-sec text-[var(--text-primary)]">
                {hardwareInfo.gpu_name
                  ? `${hardwareInfo.gpu_name} · ${fmt(hardwareInfo.vram_gb, "GB VRAM")} · ${fmt(hardwareInfo.total_ram_gb, "GB RAM")}`
                  : `GPU not detected · ${fmt(hardwareInfo.total_ram_gb, "GB RAM")}`}
              </p>
              {hardwareInfo.detection_warnings.length > 0 && (
                <p className="mt-1 text-[11px] text-[var(--text-tertiary)] italic">
                  ⚠ {hardwareInfo.detection_warnings.join(" ")}
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}
