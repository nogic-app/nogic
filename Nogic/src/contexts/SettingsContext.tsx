import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import i18n from "../i18n.ts";
import { isRecord, requestSidecar } from "../sidecarRequest.ts";

export type Theme = "system" | "light" | "dark";

export interface Settings {
  /** "system" follows the Windows theme; light/dark pin the choice. */
  theme: Theme;
  /** When false, the Sources footer is hidden beneath assistant answers. */
  showSources: boolean;
  /** When true, Enter sends and Shift+Enter adds a line; otherwise Ctrl+Enter sends. */
  sendWithEnter: boolean;
  /** Name used in the welcome greeting. */
  userName: string;
  /** Whether global keyboard shortcuts are active. */
  enableShortcuts: boolean;
  /** Interface language label selected in General settings. */
  language: string;
  /** Ollama model used for new chats; null until the user chooses one. */
  activeModel: string | null;
  /** Model used when the active model is unavailable. */
  fallbackModel: string | null;
}

interface SettingsContextValue extends Settings {
  setTheme: (theme: Theme) => void;
  setShowSources: (showSources: boolean) => void;
  setSendWithEnter: (sendWithEnter: boolean) => void;
  setUserName: (userName: string) => void;
  setEnableShortcuts: (enableShortcuts: boolean) => void;
  setLanguage: (language: string) => void;
  setActiveModel: (model: string | null) => void;
  setFallbackModel: (model: string | null) => void;
}

const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  showSources: true,
  sendWithEnter: true,
  userName: "",
  enableShortcuts: true,
  language: "English",
  activeModel: null,
  fallbackModel: null,
};

/** Map UI language labels to locale codes. */
const LANG_MAP: Record<string, string> = {
  English: "en",
  Français: "fr",
  العربية: "ar",
  Español: "es",
  Português: "pt",
};

const THEMES: ReadonlyArray<Theme> = ["system", "light", "dark"];

const SettingsContext = createContext<SettingsContextValue | null>(null);

function booleanValue(value: unknown): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

/** Validate the flat key/value rows returned by the settings table. */
function storedSettings(value: unknown): Partial<Settings> {
  if (!isRecord(value)) return {};
  const next: Partial<Settings> = {};
  if (THEMES.includes(value.theme as Theme)) {
    next.theme = value.theme as Theme;
  }
  if (typeof value.language === "string" && value.language in LANG_MAP) {
    next.language = value.language;
  }
  if (typeof value.userName === "string") {
    next.userName = value.userName;
  }
  if (typeof value.activeModel === "string") {
    next.activeModel = value.activeModel.trim() || null;
  }
  if (typeof value.fallbackModel === "string") {
    next.fallbackModel = value.fallbackModel.trim() || null;
  }
  const showSources = booleanValue(value.showSources);
  if (showSources !== undefined) next.showSources = showSources;
  const sendWithEnter = booleanValue(value.sendWithEnter);
  if (sendWithEnter !== undefined) next.sendWithEnter = sendWithEnter;
  const enableShortcuts = booleanValue(value.enableShortcuts);
  if (enableShortcuts !== undefined) next.enableShortcuts = enableShortcuts;
  return next;
}

function settingsRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

/**
 * Holds the app-wide General settings. SQLite is the durable store: values are
 * loaded on mount and every change is written through `save_setting`.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    void requestSidecar("get_settings", {}, settingsRecord)
      .then((stored) => {
        if (cancelled) return;
        setSettings((current) => ({ ...current, ...storedSettings(stored) }));
      })
      .catch((error: unknown) => {
        console.error("Could not load the saved settings.", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSetting = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((current) => ({ ...current, [key]: value }));
      void requestSidecar("save_setting", {
        key,
        value: String(value),
      }).catch((error: unknown) => {
        console.error(`Could not save the ${String(key)} setting.`, error);
      });
    },
    [],
  );

  // Model choices are nullable. An empty value clears the stored preference so
  // the app falls back to the first installed model instead of a stale name.
  const updateModelSetting = useCallback(
    (key: "activeModel" | "fallbackModel", value: string | null) => {
      const model = value?.trim() ? value.trim() : null;
      setSettings((current) => ({ ...current, [key]: model }));
      void requestSidecar("save_setting", {
        key,
        value: model ?? "",
      }).catch((error: unknown) => {
        console.error(`Could not save the ${key} setting.`, error);
      });
    },
    [],
  );

  // Apply the effective theme to <html> so Tailwind's `dark:` variants and the
  // token overrides in tokens.css switch together. "system" keeps following
  // the OS while the app is open.
  useEffect(() => {
    const root = document.documentElement;
    const query = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const isDark =
        settings.theme === "dark" ||
        (settings.theme === "system" && query.matches);
      root.classList.toggle("dark", isDark);
    };

    apply();
    if (settings.theme !== "system") return;

    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [settings.theme]);

  // Apply language and RTL direction when language changes.
  useEffect(() => {
    const locale = LANG_MAP[settings.language] ?? "en";
    i18n.changeLanguage(locale);

    const root = document.documentElement;
    if (locale === "ar") {
      root.dir = "rtl";
      root.classList.add("rtl");
    } else {
      root.dir = "ltr";
      root.classList.remove("rtl");
    }
  }, [settings.language]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      ...settings,
      setTheme: (theme) => updateSetting("theme", theme),
      setShowSources: (showSources) => updateSetting("showSources", showSources),
      setSendWithEnter: (sendWithEnter) =>
        updateSetting("sendWithEnter", sendWithEnter),
      setUserName: (userName) => updateSetting("userName", userName),
      setEnableShortcuts: (enableShortcuts) =>
        updateSetting("enableShortcuts", enableShortcuts),
      setLanguage: (language) => updateSetting("language", language),
      setActiveModel: (model) => updateModelSetting("activeModel", model),
      setFallbackModel: (model) => updateModelSetting("fallbackModel", model),
    }),
    [settings, updateSetting, updateModelSetting],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used inside a SettingsProvider.");
  }
  return context;
}
