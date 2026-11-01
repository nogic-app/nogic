import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button.tsx";
import { invoke } from "@tauri-apps/api/core";
import { listenSidecar as listen } from "@/sidecarEvents.ts";

interface DeleteMemoryModalProps {
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}

type MemoryItem = "Chat memory" | "PDFs and documents" | "Images" | "Other files";

const ITEMS: ReadonlyArray<MemoryItem> = [
  "Chat memory",
  "PDFs and documents",
  "Images",
  "Other files",
];

type CheckedState = {
  [key in MemoryItem]: boolean;
};

export function DeleteMemoryModal({ open, onClose, onDeleted }: DeleteMemoryModalProps) {
  const [checked, setChecked] = useState<CheckedState>({
    "Chat memory": false,
    "PDFs and documents": false,
    Images: false,
    "Other files": false,
  });
  const [isDeleting, setIsDeleting] = useState(false);

  if (!open) return null;

  const handleDelete = async () => {
    const categories = ITEMS.flatMap((item) => {
      if (!checked[item]) return [];
      return item === "Chat memory" ? ["chats"] : ["files"];
    });
    if (categories.length === 0) return;
    setIsDeleting(true);
    const requestId = `delete_memory:${crypto.randomUUID()}`;
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
          else reject(new Error(typeof payload.error === "string" ? payload.error : "Delete failed."));
        });
        await invoke("send_to_sidecar", {
          message: JSON.stringify({ action: "delete_memory", id: requestId, categories }),
        });
      });
      onDeleted?.();
      onClose();
    } catch (error) {
      console.error("Failed to delete selected memory.", error);
      window.alert(`Nogic could not delete that memory: ${String(error)}`);
    } finally {
      setIsDeleting(false);
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
            Delete memory
          </h2>
          <button
            type="button"
            aria-label="Close delete memory"
            onClick={onClose}
            className="sidebar-icon-button rounded-md p-1"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="px-6 py-4">
          <p className="text-sec text-[var(--text-secondary)]">
            Choose what to delete from Nogic\u2019s memory:
          </p>
          <div className="mt-4 space-y-3">
            {ITEMS.map((label) => (
              <label key={label} className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checked[label]}
                  onChange={() =>
                    setChecked((current) => ({
                      ...current,
                      [label]: !current[label],
                    }))
                  }
                  className="rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--focus)]"
                />
                <span className="text-body text-[var(--text-primary)]">{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="border-t border-[var(--border)] px-6 py-3 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="accent"
            onClick={() => void handleDelete()}
            disabled={isDeleting || !ITEMS.some((item) => checked[item])}
            className="bg-[var(--danger)] border-[var(--danger)] text-white hover:opacity-90"
          >
            {isDeleting ? "Deleting..." : "Delete selected"}
          </Button>
        </div>
      </div>
    </div>
  );
}