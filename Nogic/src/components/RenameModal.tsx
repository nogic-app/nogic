import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface RenameModalProps {
  open: boolean;
  kind: "chat" | "project";
  currentName: string;
  onClose: () => void;
  onSave: (name: string) => void;
}

export function RenameModal({
  open,
  kind,
  currentName,
  onClose,
  onSave,
}: RenameModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(currentName);

  useEffect(() => {
    if (open) setName(currentName);
  }, [currentName, open]);

  if (!open) return null;

  const title = kind === "chat" ? t("sidebar.renameChat") : t("sidebar.renameProject");
  const label = kind === "chat" ? t("sidebar.chatName") : t("sidebar.projectName");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-dialog-title"
        className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (trimmed) onSave(trimmed);
        }}
      >
        <h2 id="rename-dialog-title" className="text-title font-medium text-[var(--text-primary)]">
          {title}
        </h2>
        <label htmlFor="rename-item-name" className="mt-4 block text-sec text-[var(--text-secondary)]">
          {label}
        </label>
        <input
          id="rename-item-name"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-1 block w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sec text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--focus)]"
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-sec text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]"
            onClick={onClose}
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sec text-white disabled:opacity-40"
          >
            {t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
