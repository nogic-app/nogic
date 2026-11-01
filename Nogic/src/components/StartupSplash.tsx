import { useTranslation } from "react-i18next";

/**
 * Shown while the sidecar unpacks and the first-run decision is read from
 * SQLite. The workspace must stay unmounted in this state: rendering it early
 * makes the Welcome screen flash at a first-time user before the wizard.
 */
export function StartupSplash() {
  const { t } = useTranslation();

  return (
    <section
      aria-label={t("startup.startingEngine")}
      aria-busy="true"
      className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[var(--bg)]"
    >
      <img src="/logo.png" alt="Nogic" className="h-12 w-auto opacity-90" />
      <p
        role="status"
        className="animate-pulse text-meta text-[var(--text-secondary)]"
      >
        {t("startup.startingEngine")}
      </p>
    </section>
  );
}
