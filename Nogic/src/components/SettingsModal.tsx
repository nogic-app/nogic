import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsGeneral } from "./SettingsGeneral.tsx";
import { SettingsModels } from "./SettingsModels.tsx";
import { SettingsMemory } from "./SettingsMemory.tsx";
import { SettingsAdvanced } from "./SettingsAdvanced.tsx";
import { SettingsAbout } from "./SettingsAbout.tsx";
import { SettingsUsage } from "./SettingsUsage.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { useTranslation } from "react-i18next";

export type SettingsTab =
  | "general"
  | "models"
  | "usage"
  | "memory"
  | "advanced"
  | "about";

const TABS: ReadonlyArray<SettingsTab> = [
  "general",
  "models",
  "usage",
  "memory",
  "advanced",
  "about",
];

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** Tab shown when the modal opens. */
  initialTab?: SettingsTab;
}

/**
 * Settings is a fixed, non-draggable modal over the workspace. It is
 * deliberately not a route: the main window stays where it is and closing
 * the modal returns the user to the chat they were in.
 */
export function SettingsModal({
  open,
  onClose,
  initialTab = "general",
}: SettingsModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const activeLabel = t(`settings.${activeTab}`);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("settings.title")}
        className="flex h-[600px] w-[800px] max-h-[calc(100vh-32px)] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl bg-[var(--bg)] shadow-xl"
      >
        <nav
          aria-label="Settings sections"
          className="flex w-[200px] shrink-0 flex-col border-e border-[var(--border)] px-3 py-6"
        >
          <p className="px-3 pb-4 text-title font-medium text-[var(--text-primary)]">
            {t("settings.title")}
          </p>
          <ul className="space-y-0.5">
            {TABS.map((tab) => (
              <li key={tab}>
                <button
                  type="button"
                  aria-current={activeTab === tab ? "page" : undefined}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "block w-full rounded-md px-3 py-1.5 text-start text-sec transition-colors duration-[120ms]",
                    activeTab === tab
                      ? "bg-[var(--accent-subtle)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]",
                  )}
                >
                  {t(`settings.${tab}`)}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
            <h2 className="text-title font-medium text-[var(--text-primary)]">
              {activeLabel}
            </h2>
            <button
              type="button"
              aria-label={t("settings.close")}
              title={t("settings.close")}
              onClick={onClose}
              className="sidebar-icon-button rounded-md p-1"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <ErrorBoundary>
              {activeTab === "general" ? <SettingsGeneral /> : null}
              {activeTab === "models" ? <SettingsModels /> : null}
              {activeTab === "usage" ? <SettingsUsage /> : null}
              {activeTab === "memory" ? <SettingsMemory /> : null}
              {activeTab === "advanced" ? <SettingsAdvanced /> : null}
              {activeTab === "about" ? <SettingsAbout /> : null}
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}
