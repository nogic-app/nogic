import { cn } from "@/lib/utils";

interface SettingsToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}

/**
 * Quiet switch used across Settings. The track turns accent green when on,
 * matching the composer toggles rather than introducing a new state colour.
 */
export function SettingsToggle({
  label,
  checked,
  onChange,
  description,
}: SettingsToggleProps) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <p className="text-body text-[var(--text-primary)]">{label}</p>
        {description ? (
          <p className="mt-0.5 text-meta text-[var(--text-secondary)]">
            {description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-[120ms]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
          checked
            ? "border-[var(--accent)] bg-[var(--accent)]"
            : "border-[var(--border-strong)] bg-[var(--bg-muted)]",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-3.5 w-3.5 rounded-full bg-[var(--bg-elevated)] shadow-quiet transition-transform duration-[120ms]",
            checked ? "translate-x-[17px]" : "translate-x-[3px]",
          )}
        />
      </button>
    </div>
  );
}
