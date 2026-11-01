import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PillVariant = "accent" | "warning" | "danger" | "muted";

const styles: Record<PillVariant, string> = {
  accent: "bg-accent-subtle text-accent",
  warning: "bg-[color-mix(in_srgb,var(--warning)_15%,transparent)] text-warning",
  danger: "bg-muted text-danger",
  muted: "bg-muted text-secondary",
};

export function Pill({ variant = "muted", children }: { variant?: PillVariant; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center whitespace-nowrap rounded-full px-2 text-meta font-medium",
        styles[variant],
      )}
    >
      {children}
    </span>
  );
}
