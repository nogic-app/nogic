/** Live machine usage returned by the Rust `get_system_usage` command. */
export interface SystemUsage {
  cpu_usage: number;
  ram_used_gb: number;
  ram_total_gb: number;
  /** null when NVML cannot report this machine's VRAM. */
  vram_used_gb: number | null;
  vram_total_gb: number | null;
  gpu_usage: number | null;
  gpu_name: string | null;
  /** Windows WMI 3D engine utilization; null when no integrated GPU exists. */
  igpu_usage: number | null;
  igpu_name: string | null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isSystemUsage(value: unknown): value is SystemUsage {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    isFiniteNumber(record.cpu_usage) &&
    isFiniteNumber(record.ram_used_gb) &&
    isFiniteNumber(record.ram_total_gb) &&
    (record.vram_used_gb === null || isFiniteNumber(record.vram_used_gb)) &&
    (record.vram_total_gb === null || isFiniteNumber(record.vram_total_gb)) &&
    (record.gpu_usage === null || isFiniteNumber(record.gpu_usage)) &&
    (record.gpu_name === null || typeof record.gpu_name === "string") &&
    (record.igpu_usage === null || isFiniteNumber(record.igpu_usage)) &&
    (record.igpu_name === null || typeof record.igpu_name === "string")
  );
}

/** Real usage percentage, or null when the machine cannot report it. */
export function usagePercentage(
  used: number | null | undefined,
  total: number | null | undefined,
): number | null {
  if (used == null || total == null || total <= 0) return null;
  return Math.min(100, Math.max(0, (used / total) * 100));
}
