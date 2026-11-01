import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "./ui/button.tsx";
import { FactoryResetModal } from "./FactoryResetModal.tsx";
import { appDataDir } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { TesseractRequirement } from "./TesseractRequirement.tsx";

const COMMANDS: ReadonlyArray<{ command: string; description: string }> = [
  { command: "/add-law", description: "Add a custom law PDF to the local library." },
  { command: "/add-plant", description: "Add a custom plant with provenance to the verified table." },
  { command: '/plant "<name>"', description: "Look up a verified plant directly, bypassing the LLM." },
  { command: "/help", description: "List available commands and their usage." },
];


export function SettingsAdvanced() {
  const { t } = useTranslation();
  const [resetOpen, setResetOpen] = useState(false);
  const [ollamaAddress, setOllamaAddress] = useState("http://localhost:11434");
  const [dataPath, setDataPath] = useState<string>(t("settings.loading"));

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const path = await appDataDir();
        if (mounted) setDataPath(path);
      } catch {
        if (mounted) setDataPath("Data path unavailable");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-7">
      <section>
        <h3 className="text-title font-medium text-[var(--text-primary)]">
          {t("settings.dataFolder")}
        </h3>
        <p className="mt-0.5 text-meta text-[var(--text-secondary)]">
          {t("settings.dataFolderDescription")}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5">
          <p className="font-mono text-meta text-[var(--text-secondary)]">
            {dataPath}
          </p>
          <a
            href="#"
            onClick={async (event) => {
              event.preventDefault();
              if (!dataPath || dataPath === t("settings.loading")) {
                return;
              }
              try {
                await openPath(dataPath);
              } catch (error) {
                console.error("Failed to open the data folder.", error);
                window.alert(`Nogic could not open the data folder: ${String(error)}`);
              }
            }}
            className="text-meta text-[var(--text-secondary)] hover:text-[var(--accent)] hover:underline"
          >
            {t("settings.openFolder")}
          </a>
        </div>
      </section>

      <section>
        <h3 className="text-title font-medium text-[var(--text-primary)]">
          {t("settings.ollamaAddress")}
        </h3>
        <p className="mt-0.5 text-meta text-[var(--text-secondary)]">
          {t("settings.ollamaAddressDescription")}
        </p>
        <div className="mt-3">
          <input
            type="text"
            value={ollamaAddress}
            onChange={(event) => setOllamaAddress(event.target.value)}
            className="block w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sec text-[var(--text-primary)] font-mono outline-none focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--focus)]"
          />
        </div>
      </section>

      <section>
        <h3 className="text-title font-medium text-[var(--text-primary)]">
          {t("settings.commands")}
        </h3>
        <ul className="mt-3 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {COMMANDS.map((command) => (
            <li key={command.command} className="flex justify-between gap-4 px-0 py-3">
              <span className="font-mono text-sec text-[var(--text-primary)]">
                {command.command}
              </span>
              <p className="min-w-0 text-meta text-[var(--text-secondary)]">
                {command.command === "/add-law"
                  ? t("settings.addLawDescription")
                  : command.command === "/add-plant"
                    ? t("settings.addPlantDescription")
                    : command.command.startsWith("/plant")
                      ? t("settings.plantLookupDescription")
                      : t("settings.helpDescription")}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <TesseractRequirement />

      <section>
        <Button
          type="button"
          variant="outline"
          onClick={() => setResetOpen(true)}
          className="border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white"
        >
          <RotateCw size={16} aria-hidden="true" />
          {t("settings.factoryReset")}
        </Button>
      </section>

      <FactoryResetModal open={resetOpen} onClose={() => setResetOpen(false)} />
    </div>
  );
}
