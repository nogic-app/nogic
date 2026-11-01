import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { isTauriCallbackIdError } from "@/sidecarRequest.ts";
import { listenSidecar as listen } from "@/sidecarEvents.ts";
import { Button } from "./ui/button.tsx";
import { SettingsToggle } from "./SettingsToggle.tsx";
import { DeleteMemoryModal } from "./DeleteMemoryModal.tsx";
import { appDataDir, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";

interface SavedFile {
  name: string;
  type: string;
  size: number;
  date: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SettingsMemory() {
  const { t } = useTranslation();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [remember, setRemember] = useState(true);
  const [savedFiles, setSavedFiles] = useState<SavedFile[]>([]);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [filesRefresh, setFilesRefresh] = useState(0);
  const [facts, setFacts] = useState<string[]>([
    "Prefers native Moroccan plants",
    "Working on Villa Souissi project",
    "Uses French for law queries",
  ]);
  const [memoryPath, setMemoryPath] = useState<string>(t("settings.loading"));

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const path = await join(await appDataDir(), "memory");
        if (mounted) setMemoryPath(path);
      } catch {
        if (mounted) setMemoryPath("Memory path unavailable");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let stopListening: (() => void) | undefined;
    const requestId = `memory:${crypto.randomUUID()}`;
    const startTimer = window.setTimeout(() => {
      void (async () => {
        try {
          stopListening = await listen<string>("python-message", (event) => {
            let payload: unknown;
            try {
              payload = JSON.parse(event.payload);
            } catch (error) {
              console.error("Received invalid saved-files response.", error);
              return;
            }
            if (
              !payload ||
              typeof payload !== "object" ||
              (payload as { id?: unknown }).id !== requestId
            ) return;
            const message = payload as { type?: unknown; data?: unknown; error?: unknown };
            if (message.type === "response" && Array.isArray(message.data)) {
              const files = message.data.filter((file): file is SavedFile =>
                typeof file === "object" &&
                file !== null &&
                typeof (file as SavedFile).name === "string" &&
                typeof (file as SavedFile).type === "string" &&
                typeof (file as SavedFile).size === "number" &&
                typeof (file as SavedFile).date === "string",
              );
              if (mounted) setSavedFiles(files);
            } else if (message.type === "error") {
              console.error(
                "The Python sidecar could not load saved files.",
                message.error,
              );
              if (mounted) setFilesError("Unable to load saved files.");
            }
          });
          if (!mounted) {
            stopListening();
            return;
          }
          await invoke("send_to_sidecar", {
            message: JSON.stringify({ action: "get_saved_files", id: requestId }),
          });
        } catch (error) {
          if (!mounted && isTauriCallbackIdError(error)) return;
          console.error("Failed to load saved files.", error);
          if (mounted) setFilesError("Unable to load saved files.");
        }
      })();
    }, 0);
    return () => {
      mounted = false;
      window.clearTimeout(startTimer);
      stopListening?.();
    };
  }, [filesRefresh]);

  const openMemoryFolder = async () => {
    if (!memoryPath || memoryPath === t("settings.loading")) {
      return;
    }
    try {
      await openPath(memoryPath);
    } catch (error) {
      console.error("Failed to open the memory folder.", error);
      window.alert(`Nogic could not open the memory folder: ${String(error)}`);
    }
  };

  const removeFact = (fact: string) => {
    setFacts((current) => current.filter((item) => item !== fact));
  };

  return (
    <div className="space-y-7">
      <section>
        <SettingsToggle
          label={t("settings.rememberAcrossChats")}
          description={t("settings.rememberAcrossChatsDescription")}
          checked={remember}
          onChange={setRemember}
        />
      </section>

      <section>
        <h3 className="text-title font-medium text-[var(--text-primary)]">
          {t("settings.savedItems")}
        </h3>
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]">
          <ul className="divide-y divide-[var(--border)] border-b border-[var(--border)]">
            {filesError ? (
              <li className="px-4 py-4 text-meta text-[var(--danger)]">{filesError}</li>
            ) : savedFiles.length === 0 ? (
              <li className="px-4 py-4 text-meta text-[var(--text-secondary)]">
                No files saved yet. Attach a file in a chat to see it here.
              </li>
            ) : savedFiles.map((item) => (
              <li key={item.name} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="font-mono text-sec text-[var(--text-primary)]">
                    {item.name}
                  </p>
                  <p className="mt-0.5 text-meta text-[var(--text-secondary)]">
                    {item.type} · {formatSize(item.size)} · {item.date}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h3 className="text-title font-medium text-[var(--text-primary)]">
          {t("settings.location")}
        </h3>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5">
          <p className="font-mono text-meta text-[var(--text-secondary)]">
            {memoryPath}
          </p>
          <div className="flex items-center gap-2">
            <a
              href="#"
              onClick={(event) => {
                event.preventDefault();
                void openMemoryFolder();
              }}
              className="text-meta text-[var(--text-secondary)] hover:text-[var(--accent)] hover:underline"
            >
              {t("settings.openFolder")}
            </a>
          </div>
        </div>
        <p className="mt-1 text-meta text-[var(--text-tertiary)]">
          {t("settings.storedOnlyMachine")}
        </p>
      </section>

      <section>
        <h3 className="text-title font-medium text-[var(--text-primary)]">
          {t("settings.rememberedFacts")}
        </h3>
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]">
          <ul className="divide-y divide-[var(--border)] border-b border-[var(--border)]">
            {facts.map((fact) => (
              <li key={fact} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <p className="min-w-0 text-meta text-[var(--text-secondary)]">
                  {fact}
                </p>
                <button
                  type="button"
                  aria-label={t("settings.removeFact", { fact })}
                  onClick={() => setFacts((current) => current.filter((item) => item !== fact))}
                  className="rounded-md p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--bg-muted)]"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-1 text-meta text-[var(--text-tertiary)]">
          {t("settings.rememberedFactsDescription")}
        </p>
      </section>

      <section>
        <Button
          type="button"
          variant="outline"
          onClick={() => setDeleteOpen(true)}
          className="border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white"
        >
          <Trash2 size={16} aria-hidden="true" />
          {t("settings.deleteMemory")}
        </Button>
      </section>

      <DeleteMemoryModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          setFilesRefresh((value) => value + 1);
          void emit("memory-deleted").catch((error: unknown) => {
            console.error("Failed to notify the workspace about deleted memory.", error);
          });
        }}
      />
    </div>
  );
}
