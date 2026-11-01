import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/contexts/SettingsContext.tsx";
import { useSystemUsage } from "@/hooks/useSystemUsage.ts";
import { isModelLoaded, useLoadedModels } from "@/hooks/useLoadedModels.ts";
import { isRecord, requestSidecar } from "@/sidecarRequest.ts";
import { usagePercentage } from "@/types/systemUsage.ts";
import { UsageBar } from "./UsageBar.tsx";

const POLL_INTERVAL_MS = 2000;
const SPEED_TEST_TIMEOUT_MS = 180_000;

interface SpeedResult {
  ttft: number;
  tokens_per_sec: number;
  tokens: number;
  model: string;
  duration: number;
}

function isSpeedResult(value: unknown): value is SpeedResult {
  return (
    isRecord(value) &&
    typeof value.ttft === "number" &&
    typeof value.tokens_per_sec === "number" &&
    typeof value.tokens === "number" &&
    typeof value.model === "string"
  );
}

function formatGb(value: number | null | undefined): string {
  return value == null ? "—" : `${value.toFixed(1)} GB`;
}

/**
 * Settings -> Usage. Every number is measured: system stats come from the Rust
 * shell (sysinfo + NVML) and the speed test answers a real prompt.
 */
export function SettingsUsage() {
  const { t } = useTranslation();
  const { activeModel } = useSettings();
  const usage = useSystemUsage(POLL_INTERVAL_MS);
  const loadedModels = useLoadedModels(POLL_INTERVAL_MS);
  const isLoaded = isModelLoaded(loadedModels, activeModel);

  const [speedResult, setSpeedResult] = useState<SpeedResult | null>(null);
  const [isSpeedTestRunning, setIsSpeedTestRunning] = useState(false);
  const [speedError, setSpeedError] = useState("");

  const ramPercent = usage
    ? usagePercentage(usage.ram_used_gb, usage.ram_total_gb)
    : null;
  const vramPercent = usage
    ? usagePercentage(usage.vram_used_gb, usage.vram_total_gb)
    : null;

  const runSpeedTest = async () => {
    if (isSpeedTestRunning || !activeModel) return;
    setIsSpeedTestRunning(true);
    setSpeedError("");
    try {
      const result = await requestSidecar(
        "run_speed_test",
        { model: activeModel },
        isSpeedResult,
        SPEED_TEST_TIMEOUT_MS,
      );
      setSpeedResult(result);
    } catch (error) {
      console.error("The speed test failed.", error);
      setSpeedError(
        error instanceof Error
          ? error.message
          : t("usage.speedTestFailed", "The speed test failed."),
      );
    } finally {
      setIsSpeedTestRunning(false);
    }
  };

  return (
    <div className="space-y-7">
      <section className="rounded-lg bg-[var(--bg-muted)] p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-meta text-[var(--text-secondary)]">
              {t("usage.activeModel", "Active model")}
            </p>
            <p className="mt-1 truncate font-mono text-sec text-[var(--text-primary)]">
              {activeModel ?? t("usage.noModel", "No model selected")}
            </p>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-2.5 py-1 text-[11px] uppercase tracking-wide ${
              isLoaded
                ? "bg-[var(--accent-subtle)] text-[var(--accent)]"
                : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
            }`}
            aria-live="polite"
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${
                isLoaded ? "bg-[var(--accent)]" : "bg-[var(--text-tertiary)]"
              }`}
            />
            {isLoaded
              ? t("usage.loaded", "Loaded")
              : t("usage.notLoaded", "Not loaded")}
          </span>
        </div>
        <p className="mt-3 text-meta text-[var(--text-secondary)]">
          {usage?.gpu_name ?? t("usage.gpuUnknown", "GPU not detected")} · VRAM{" "}
          {formatGb(usage?.vram_used_gb)} / {formatGb(usage?.vram_total_gb)} ·
          RAM {formatGb(usage?.ram_used_gb)} / {formatGb(usage?.ram_total_gb)}
        </p>
      </section>

      <section className="space-y-4">
        <h3 className="text-title font-medium text-[var(--text-primary)]">
          {t("usage.system", "System")}
        </h3>
        <UsageBar
          label={t("usage.cpu", "CPU")}
          detail={usage ? `${usage.cpu_usage.toFixed(0)}%` : "—"}
          percent={usage ? usage.cpu_usage : null}
        />
        {usage?.gpu_usage != null && (
          <UsageBar
            label={t("usage.gpu", "GPU")}
            detail={`${usage.gpu_usage.toFixed(0)}%`}
            percent={usage.gpu_usage}
          />
        )}
        {usage?.igpu_usage != null && (
          <UsageBar
            label={
              usage.igpu_name ||
              t("usage.integratedGpu", "Integrated GPU")
            }
            detail={`${Math.round(usage.igpu_usage)}%`}
            percent={usage.igpu_usage}
          />
        )}
        <UsageBar
          label={t("usage.ram", "RAM")}
          detail={
            usage
              ? `${formatGb(usage.ram_used_gb)} / ${formatGb(usage.ram_total_gb)}`
              : "—"
          }
          percent={ramPercent}
        />
        <UsageBar
          label={t("usage.vram", "VRAM")}
          detail={
            usage?.vram_total_gb != null
              ? `${formatGb(usage.vram_used_gb)} / ${formatGb(usage.vram_total_gb)}`
              : "—"
          }
          percent={vramPercent}
          warning={vramPercent !== null && vramPercent > 80}
        />
      </section>

      <section>
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-title font-medium text-[var(--text-primary)]">
            {t("usage.speed", "Speed")}
          </h3>
          <button
            type="button"
            onClick={() => void runSpeedTest()}
            disabled={isSpeedTestRunning || !activeModel}
            className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-[var(--border)] px-3 text-meta text-[var(--text-secondary)] transition-colors duration-[120ms] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSpeedTestRunning && (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            )}
            {isSpeedTestRunning
              ? t("usage.running", "Running…")
              : t("usage.runSpeedTest", "Run speed test")}
          </button>
        </div>
        <div className="mt-3 rounded-lg border border-[var(--border)] px-4 py-3">
          <p className="text-meta text-[var(--text-secondary)]">
            {t("usage.lastAnswer", "Last answer")}
          </p>
          {speedResult ? (
            <>
              <p className="mt-1 font-mono text-sec text-[var(--text-primary)]">
                {speedResult.ttft.toFixed(2)} s{" "}
                {t("usage.ttftSuffix", "TTFT")} ·{" "}
                {speedResult.tokens_per_sec.toFixed(1)}{" "}
                {t("usage.tokensPerSec", "tokens/s")} · {speedResult.tokens}{" "}
                {t("usage.tokens", "tokens")}
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                {t("usage.measuredOn", {
                  model: speedResult.model,
                  defaultValue: "Measured on {{model}}",
                })}
              </p>
            </>
          ) : (
            <p className="mt-1 text-meta italic text-[var(--text-secondary)]">
              {t(
                "usage.noMeasurement",
                "No measurement yet. Run the speed test to measure the active model.",
              )}
            </p>
          )}
          {speedError && (
            <p role="alert" className="mt-2 text-meta text-[var(--danger)]">
              {speedError}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
