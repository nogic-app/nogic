import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, FileText } from "lucide-react";
import { Citation } from "./Citation.tsx";

interface SourceFooterItem {
  label: ReactNode;
  onClick: () => Promise<void>;
}

export function SourceFooter({
  label,
  items,
}: {
  label: string;
  items: SourceFooterItem[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
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

  async function openSource(item: SourceFooterItem) {
    setError(null);
    try {
      await item.onClick();
    } catch (cause) {
      console.error("Failed to open law PDF", cause);
      setError("Could not open this law PDF.");
    }
  }

  return (
    <div ref={containerRef} className="mt-3 w-full">
      <div className="flex items-center gap-2">
        <span className="text-meta text-[var(--text-secondary)]">{label}</span>
        <div className="flex items-center gap-1">
          {items.map((_, index) => (
            <span
              key={index}
              title={`Law source ${index + 1}`}
              className="text-[var(--text-secondary)]"
            >
              <FileText size={13} aria-hidden="true" />
            </span>
          ))}
        </div>
        <button
          type="button"
          aria-label="Show law sources"
          aria-controls={panelId}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          className="flex h-5 w-5 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors duration-[120ms] hover:text-[var(--text-primary)]"
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
          {items.map((item, i) => (
            <li key={i}>
              <Citation
                onClick={() => openSource(item)}
                mono={false}
                className="flex w-full px-3 py-0.5 text-start text-[10px] font-medium leading-tight text-[var(--text-primary)] opacity-60 transition-opacity duration-200 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                {item.label}
              </Citation>
            </li>
          ))}
        </ul>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-meta text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
