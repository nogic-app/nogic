import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Pill } from "./Pill.tsx";

/** Latin binomials stay LTR in JetBrains Mono, isolated so they never break RTL flow. */
export function Latin({ children }: { children: ReactNode }) {
  return (
    <span dir="ltr" className="font-mono" style={{ unicodeBidi: "isolate" }}>
      {children}
    </span>
  );
}

export interface Plant {
  latin: string;
  common: string;
  water: string;
  sun: string;
  sourceUrl: string;
  /** Verbatim quote. Never invent: use the TODO placeholder until sourced. */
  quote: string;
  verified: boolean;
}

export interface PlantLabels {
  verified: string;
  unverified: string;
  water: string;
  sun: string;
  source: string;
}

export const DEFAULT_PLANT_LABELS: PlantLabels = {
  verified: "Verified",
  unverified: "Unverified",
  water: "Water",
  sun: "Sun",
  source: "Source",
};

/**
 * Bulk-imported rows may carry several ` | `-joined provenance URLs.
 * The first one is the canonical source for the card and its link.
 */
export function primarySourceUrl(url: string): string {
  return url.split("|")[0]?.trim() ?? "";
}

/** Map a provenance URL to the name of the body that published it. */
export function sourceLabel(url: string): string {
  const primaryUrl = primarySourceUrl(url);
  let hostname: string;
  try {
    hostname = new URL(primaryUrl).hostname.toLowerCase();
  } catch {
    return primaryUrl;
  }
  if (hostname.endsWith("kew.org")) return "Kew POWO";
  if (hostname.endsWith("rhs.org.uk")) return "RHS";
  if (hostname.endsWith("ncsu.edu")) return "NC State Extension";
  return hostname.replace(/^www\./, "");
}

interface PlantCardProps {
  plant: Plant;
  labels?: PlantLabels;
  defaultOpen?: boolean;
}

export function PlantCard({
  plant,
  labels = DEFAULT_PLANT_LABELS,
  defaultOpen = false,
}: PlantCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  // Imported rows may leave trait or name fields blank. Treat whitespace as
  // absent so the card hides the row instead of rendering a dangling label.
  const latin = plant.latin.trim();
  const common = plant.common.trim();
  const water = plant.water.trim();
  const sun = plant.sun.trim();
  const quote = plant.quote.trim();
  const sourceUrl = primarySourceUrl(plant.sourceUrl);

  return (
    <li>
      <div
        className={cn(
          "rounded-lg border transition-colors",
          open ? "border-border bg-elevated shadow-quiet" : "border-transparent hover:bg-muted",
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-2 text-start text-body"
        >
          <Latin>{latin}</Latin>
          {common && (
            <>
              <span className="text-tertiary">·</span>
              <span>{common}</span>
            </>
          )}
          <span className="text-tertiary">·</span>
          <Pill variant={plant.verified ? "accent" : "warning"}>
            {plant.verified ? labels.verified : labels.unverified}
          </Pill>
          {water && (
            <>
              <span className="text-tertiary">·</span>
              <span className="text-secondary">
                {labels.water}: {water}
              </span>
            </>
          )}
        </button>

        {open && (
          <div className="space-y-3 border-t border-border px-3 pb-3 pt-3 text-sec">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {water && (
                <>
                  <dt className="text-secondary">{labels.water}</dt>
                  <dd>{water}</dd>
                </>
              )}
              {sun && (
                <>
                  <dt className="text-secondary">{labels.sun}</dt>
                  <dd>{sun}</dd>
                </>
              )}
              {sourceUrl && (
                <>
                  <dt className="text-secondary">{labels.source}</dt>
                  <dd className="min-w-0">
                    {sourceLabel(sourceUrl)}{" "}
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      dir="ltr"
                      className="inline-block max-w-full break-all rounded-md font-mono text-meta text-accent hover:underline"
                      style={{ unicodeBidi: "isolate" }}
                    >
                      {sourceUrl}
                    </a>
                  </dd>
                </>
              )}
            </dl>
            {quote && (
              <blockquote className="border-s-2 border-border-strong ps-3 italic text-secondary">
                <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
                  {quote}
                </span>
              </blockquote>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
