import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Globe } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { WebSource } from "@/types/webSources.ts";

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
/** Compact favicon row for Web-mode answers, with an expandable source list. */
export function WebSources({ sources }: { sources: WebSource[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);
  return (
    <div ref={containerRef} className="mt-3 w-full">
      <div className="flex items-center gap-2">
        <span className="text-meta text-[var(--text-secondary)]">Web sources</span>
        <div className="flex items-center gap-1">
          {sources.map((source, index) => {
            const domain = hostnameOf(source.url);
            const showIcon = domain.length > 0 && !failedUrls.includes(source.url);
            return showIcon ? (
              <img
                key={`${source.url}-${index}`}
                src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
                alt={source.title}
                title={source.title}
                className="h-5 w-5 rounded-full border border-[var(--border)] bg-[var(--bg-muted)] object-cover"
                onError={() => setFailedUrls((current) => [...current, source.url])}
              />
            ) : (
              <span
                key={`${source.url}-${index}`}
                title={source.title}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-muted)] text-[var(--text-secondary)]"
              >
                <Globe size={12} aria-hidden="true" />
              </span>
            );
          })}
        </div>
        <button
          type="button"
          aria-label="Show web sources"
          aria-controls={panelId}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          className="flex h-5 w-5 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors duration-[120ms] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
        >
          <ChevronDown
            size={13}
            aria-hidden="true"
            className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      <div
        id={panelId}
        aria-hidden={!isOpen}
        inert={!isOpen}
        className={`overflow-hidden transition-all duration-200 motion-reduce:transition-none ${
          isOpen ? "mt-2 max-h-64 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <ul className="max-h-64 overflow-y-auto py-1">
          {sources.map((source, index) => (
            <li key={`${source.url}-${index}`}>
              <a
                href={source.url}
                rel="noreferrer"
                onClick={(event) => {
                  event.preventDefault();
                  void openUrl(source.url).catch((error: unknown) => {
                    console.error("Could not open a web source.", error);
                  });
                }}
                className="flex w-full flex-col gap-0.5 px-3 py-0.5 text-start opacity-60 transition-opacity duration-200 hover:opacity-100 focus-visible:opacity-100"
              >
                <span className="truncate text-[10px] font-medium leading-tight text-[var(--text-primary)]">
                  {source.title}
                </span>
                <span className="break-all font-mono text-[9px] leading-tight text-[var(--text-tertiary)]">
                  {source.url}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
