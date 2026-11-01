import { useSettings } from "@/contexts/SettingsContext.tsx";
import { useSystemUsage } from "@/hooks/useSystemUsage.ts";
import { isModelLoaded, useLoadedModels } from "@/hooks/useLoadedModels.ts";
import { usagePercentage } from "@/types/systemUsage.ts";
import { useTranslation } from "react-i18next";

const POLL_INTERVAL_MS = 5000;

interface SidebarUsageWidgetProps {
  onOpenUsage: () => void;
}

function MiniBar({
  label,
  detail,
  percent,
  warning,
  unavailable,
}: {
  label: string;
  detail: string;
  percent: number | null;
  warning: boolean;
  unavailable: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
          {label}
        </span>
        <span className="font-mono text-[10px] text-[var(--text-secondary)]">
          {detail}
        </span>
      </div>
      <div
        className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--bg-muted)]"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent === null ? undefined : Math.round(percent)}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-200 ${
            unavailable
              ? "bg-[var(--text-tertiary)]"
              : warning
                ? "bg-[var(--warning)]"
                : "bg-[var(--accent)]"
          }`}
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Live usage at the bottom of the sidebar. Values are the real system readings;
 * VRAM reports 0 GB while no model is loaded, and "—" when the shell cannot
 * measure a value.
 */
export function SidebarUsageWidget({ onOpenUsage }: SidebarUsageWidgetProps) {
  const { t } = useTranslation();
  const { activeModel } = useSettings();
  const usage = useSystemUsage(POLL_INTERVAL_MS);
  const loadedModels = useLoadedModels(POLL_INTERVAL_MS);
  const isLoaded = isModelLoaded(loadedModels, activeModel);
  const unavailable = usage === null;

  // Without a loaded model there is no model-held VRAM to report.
  const vramUsed =
    usage === null ? null : isLoaded ? usage.vram_used_gb : 0;
  const vramTotal = usage === null ? null : usage.vram_total_gb;
  const vramPercent = usagePercentage(vramUsed, vramTotal);
  const ramPercent =
    usage === null
      ? null
      : usagePercentage(usage.ram_used_gb, usage.ram_total_gb);
  const vramWarning = vramPercent !== null && vramPercent > 80;

  const gb = (value: number | null) =>
    value === null ? "—" : `${value.toFixed(1)}`;

  return (
    <div className="group relative min-w-0 flex-1">
      <div
        tabIndex={0}
        role="group"
        aria-label={t("usage.widgetLabel", "System usage")}
        className="min-w-0 cursor-default rounded-md px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
      >
        <MiniBar
          label={t("usage.vram", "VRAM")}
          detail={`${gb(vramUsed)}/${gb(vramTotal)} GB`}
          percent={vramPercent}
          warning={vramWarning}
          unavailable={unavailable}
        />
        <div className="mt-1.5">
          <MiniBar
            label={t("usage.ram", "RAM")}
            detail={`${gb(unavailable ? null : usage.ram_used_gb)}/${gb(
              unavailable ? null : usage.ram_total_gb,
            )} GB`}
            percent={ramPercent}
            warning={false}
            unavailable={unavailable}
          />
        </div>
      </div>

      <div
        role="dialog"
        aria-label={t("usage.widgetLabel", "System usage")}
        className="invisible absolute bottom-full start-0 z-40 mb-2 w-56 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 opacity-0 shadow-xl transition-opacity duration-[120ms] group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        <p className="text-meta font-medium text-[var(--text-primary)]">
          {t("usage.system", "System")}
        </p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-secondary)]">
          {activeModel ?? t("usage.noModel", "No model selected")}
        </p>
        <dl className="mt-2 space-y-1 text-[11px] text-[var(--text-secondary)]">
          <div className="flex justify-between gap-2">
            <dt>{t("usage.cpu", "CPU")}</dt>
            <dd className="font-mono">
              {unavailable ? "—" : `${usage.cpu_usage.toFixed(0)}%`}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>{t("usage.ram", "RAM")}</dt>
            <dd className="font-mono">
              {gb(unavailable ? null : usage.ram_used_gb)} /{" "}
              {gb(unavailable ? null : usage.ram_total_gb)} GB
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>{t("usage.vram", "VRAM")}</dt>
            <dd className="font-mono">
              {gb(vramUsed)} / {gb(vramTotal)} GB
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>{t("usage.gpu", "GPU")}</dt>
            <dd className="font-mono">
              {usage?.gpu_usage == null
                ? "—"
                : `${usage.gpu_usage.toFixed(0)}%`}
            </dd>
          </div>
          {usage?.igpu_usage != null && (
            <div className="flex justify-between gap-2">
              <dt>
                {usage.igpu_name ||
                  t("usage.integratedGpu", "Integrated GPU")}
              </dt>
              <dd className="font-mono">
                {Math.round(usage.igpu_usage)}%
              </dd>
            </div>
          )}
        </dl>
        {!isLoaded && !unavailable && (
          <p className="mt-2 text-[11px] italic text-[var(--text-tertiary)]">
            {t("usage.modelNotLoaded", "Active model is not loaded.")}
          </p>
        )}
        <button
          type="button"
          onClick={onOpenUsage}
          className="mt-2 w-full rounded-md border border-[var(--border)] px-2 py-1 text-start text-meta text-[var(--text-secondary)] transition-colors duration-[120ms] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        >
          {t("usage.openUsage", "Open usage →")}
        </button>
      </div>
    </div>
  );
}
