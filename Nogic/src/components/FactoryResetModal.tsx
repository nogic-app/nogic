import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button.tsx";
import { invoke } from "@tauri-apps/api/core";
import { listenSidecar as listen } from "@/sidecarEvents.ts";

interface FactoryResetModalProps {
  open: boolean;
  onClose: () => void;
}

export function FactoryResetModal({ open, onClose }: FactoryResetModalProps) {
  const [confirm, setConfirm] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  if (!open) return null;

  const isConfirmed = confirm === "RESET";

  const handleReset = async () => {
    setIsResetting(true);
    const requestId = `factory_reset:${crypto.randomUUID()}`;
    try {
      await new Promise<void>(async (resolve, reject) => {
        const stop = await listen<string>("python-message", (event) => {
          let payload: { id?: unknown; type?: unknown; error?: unknown };
          try {
            payload = JSON.parse(event.payload) as typeof payload;
          } catch {
            return;
          }
          if (payload.id !== requestId) return;
          stop();
          if (payload.type === "response") resolve();
          else reject(new Error(typeof payload.error === "string" ? payload.error : "Reset failed."));
        });
        await invoke("send_to_sidecar", {
          message: JSON.stringify({ action: "factory_reset", id: requestId }),
        });
      });
      // factory_reset deletes the SQLite database, so the stored user name (the
      // onboarding marker) is gone and the wizard returns after the restart.
      await invoke("restart_app");
    } catch (error) {
      console.error("Failed to factory reset Nogic.", error);
      window.alert(`Nogic could not reset the app: ${String(error)}`);
      setIsResetting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-md flex-col rounded-xl bg-[var(--bg-elevated)] shadow-xl border border-[var(--border)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h2 className="text-title font-medium text-[var(--text-primary)]">
            Factory reset
          </h2>
          <button
            type="button"
            aria-label="Close factory reset"
            onClick={onClose}
            className="sidebar-icon-button rounded-md p-1"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="px-6 py-4">
          <p className="text-sec text-[var(--text-secondary)]">
            This will reset all Nogic settings and clear local data. This cannot
            be undone.
          </p>
          <p className="mt-3 text-meta text-[var(--text-secondary)]">
            To confirm, type{" "}
            <span className="font-mono text-[var(--text-primary)]">RESET</span>{" "}
            below:
          </p>
          <div className="mt-3">
            <input
              type="text"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="RESET"
              className="block w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sec text-[var(--text-primary)] font-mono uppercase outline-none focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--focus)]"
            />
          </div>
          <p className="mt-2 text-meta text-[var(--text-tertiary)]">
            Models installed in Ollama are not removed.
          </p>
        </div>
        <div className="border-t border-[var(--border)] px-6 py-3 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="accent"
            onClick={() => void handleReset()}
            disabled={!isConfirmed || isResetting}
            className="bg-[var(--danger)] border-[var(--danger)] text-white hover:opacity-90"
          >
            {isResetting ? "Resetting..." : "Reset Nogic"}
          </Button>
        </div>
      </div>
    </div>
  );
}