import { useEffect, useState, type ReactNode } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { cn } from "@/lib/utils";
import { SettingsToggle } from "./SettingsToggle.tsx";
import { useSettings, type Theme } from "@/contexts/SettingsContext.tsx";
import { useTranslation } from "react-i18next";

const THEMES: ReadonlyArray<{ value: Theme; key: string }> = [
  { value: "system", key: "windowsTheme" },
  { value: "light", key: "light" },
  { value: "dark", key: "dark" },
];

const LANGUAGES = [
  "English",
  "Français",
  "العربية",
  "Español",
  "Português",
] as const;

const SHORTCUTS = [
  { key: "newChat", keys: ["Ctrl", "N"] },
  { key: "focusComposer", keys: ["Ctrl", "L"] },
  { key: "openSettings", keys: ["Ctrl", ","] },
] as const;

interface SectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

function Section({ title, description, children }: SectionProps) {
  return (
    <section>
      <h3 className="text-sec font-medium text-[var(--text-primary)]">{title}</h3>
      {description ? (
        <p className="mt-0.5 text-meta text-[var(--text-secondary)]">
          {description}
        </p>
      ) : null}
      {children}
    </section>
  );
}

/** Group several switch rows behind quiet shared dividers. */
function ToggleGroup({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {children}
    </div>
  );
}

export function SettingsGeneral() {
  const {
    theme,
    setTheme,
    language,
    setLanguage,
    showSources,
    setShowSources,
    sendWithEnter,
    setSendWithEnter,
    userName,
    setUserName,
    enableShortcuts,
    setEnableShortcuts,
  } = useSettings();
  const { t } = useTranslation();
  const [launchOnStartup, setLaunchOnStartup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void isEnabled()
      .then((enabled) => {
        if (!cancelled) setLaunchOnStartup(enabled);
      })
      .catch((error: unknown) => {
        console.error("Could not read the startup setting.", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleStartup = async (enabled: boolean) => {
    setLaunchOnStartup(enabled);
    try {
      if (enabled) {
        await enable();
      } else {
        await disable();
      }
    } catch (error) {
      console.error("Could not update the startup setting.", error);
      setLaunchOnStartup(!enabled);
    }
  };

  return (
    <div className="space-y-7">
      <Section title={t("settings.appearance")} description={t("settings.appearanceDescription")}>
        <div
          role="group"
          aria-label="Appearance"
          className="mt-3 inline-flex rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-0.5"
        >
          {THEMES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={theme === option.value}
              onClick={() => setTheme(option.value)}
              className={cn(
                "rounded px-3 py-1 text-sec transition-colors duration-[120ms]",
                theme === option.value
                  ? "bg-[var(--accent-subtle)] text-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {t(`settings.${option.key}`)}
            </button>
          ))}
        </div>
        <div className="mt-4">
          <label
            htmlFor="settings-user-name"
            className="text-sec font-medium text-[var(--text-primary)]"
          >
            {t("settings.yourName")}
          </label>
          <p className="mt-0.5 text-meta text-[var(--text-secondary)]">
            {t("settings.yourNameDescription")}
          </p>
          <input
            id="settings-user-name"
            type="text"
            value={userName}
            onChange={(event) => setUserName(event.target.value)}
            className="mt-2 block w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sec text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--focus)]"
          />
        </div>
      </Section>

      <Section title={t("settings.language")} description={t("settings.chooseLanguage", "Choose the language for the interface.")}>
        <div
          role="group"
          aria-label="Language"
          className="mt-3 flex flex-wrap gap-2"
        >
          {LANGUAGES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={language === option}
              onClick={() => setLanguage(option)}
              className={cn(
                "rounded-md border px-3 py-1 text-sec transition-colors duration-[120ms]",
                language === option
                  ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t("settings.answers")}>
        <ToggleGroup>
          <SettingsToggle
            label={t("settings.showSources")}
            checked={showSources}
            onChange={setShowSources}
          />
          <SettingsToggle
            label={t("settings.sendWithEnter")}
            checked={sendWithEnter}
            onChange={setSendWithEnter}
          />
        </ToggleGroup>
      </Section>

      <Section title={t("settings.keyboardShortcuts")}>
        <ToggleGroup>
          <SettingsToggle
            label={t("settings.enableShortcuts")}
            checked={enableShortcuts}
            onChange={setEnableShortcuts}
          />
        </ToggleGroup>
        <ul
          aria-disabled={!enableShortcuts}
          className={cn(
            "mt-3 space-y-2 transition-opacity duration-[120ms]",
            !enableShortcuts && "opacity-40",
          )}
        >
          {SHORTCUTS.map((shortcut) => (
            <li
              key={shortcut.key}
              className="flex items-center justify-between gap-4 text-sec"
            >
              <span className="text-[var(--text-secondary)]">
                {t(`settings.${shortcut.key}`)}
              </span>
              <span className="flex items-center gap-1">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded border border-[var(--border)] bg-[var(--bg-muted)] px-1.5 py-0.5 font-mono text-meta text-[var(--text-secondary)]"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("settings.startup")}>
        <ToggleGroup>
          <SettingsToggle
            label={t("settings.launchOnStartup")}
            checked={launchOnStartup}
            onChange={(enabled) => void toggleStartup(enabled)}
          />
        </ToggleGroup>
      </Section>
    </div>
  );
}
