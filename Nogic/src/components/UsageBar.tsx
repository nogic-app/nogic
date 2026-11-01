interface UsageBarProps {
  label: string;
  detail: string;
  /** Real percentage, or null when the machine cannot report it. */
  percent: number | null;
  warning?: boolean;
}

/** A quiet usage bar bound directly to a measured percentage. */
export function UsageBar({ label, detail, percent, warning = false }: UsageBarProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sec text-[var(--text-primary)]">{label}</span>
        <span className="font-mono text-meta text-[var(--text-secondary)]">
          {detail}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent === null ? undefined : Math.round(percent)}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--bg-muted)]"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-200 ${
            warning ? "bg-[var(--warning)]" : "bg-[var(--accent)]"
          }`}
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
    </div>
  );
}
