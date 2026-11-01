import { useState } from "react";
import type { ChatItem } from "../sidebarData.ts";

interface CreateProjectModalProps {
  chats: ChatItem[];
  open: boolean;
  onClose: () => void;
  onSave: (name: string, chatIds: string[]) => Promise<void>;
}

export function CreateProjectModal({
  chats,
  open,
  onClose,
  onSave,
}: CreateProjectModalProps) {
  const [name, setName] = useState("");
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  if (!open) return null;

  const toggleChat = (chatId: string) => {
    setSelectedChatIds((current) =>
      current.includes(chatId)
        ? current.filter((id) => id !== chatId)
        : [...current, chatId],
    );
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || selectedChatIds.length === 0 || isSaving) return;
    setIsSaving(true);
    try {
      await onSave(trimmedName, selectedChatIds);
      setName("");
      setSelectedChatIds([]);
      onClose();
    } catch (error) {
      console.error("Failed to save the project.", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[rgba(31,31,29,0.2)] p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="create-project-title" className="w-full max-w-md rounded-xl border border-border bg-[var(--bg-elevated)] p-6 shadow-xl">
        <h2 id="create-project-title" className="text-lead font-medium text-primary">Create project</h2>
        <label className="mt-5 block text-meta text-secondary" htmlFor="project-name">Project Name</label>
        <input
          id="project-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sec text-primary outline-none focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--focus)]"
          autoFocus
        />
        <p className="mt-5 text-meta text-secondary">Unassigned chats</p>
        <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
          {chats.filter((chat) => chat.project_id === null).length === 0 ? (
            <p className="text-meta text-tertiary">No unassigned chats.</p>
          ) : chats.filter((chat) => chat.project_id === null).map((chat) => (
            <label key={chat.id} className="flex items-center gap-2 text-sec text-primary">
              <input
                type="checkbox"
                checked={selectedChatIds.includes(chat.id)}
                onChange={() => toggleChat(chat.id)}
                className="accent-[var(--accent)]"
              />
              <span className="truncate">{chat.title}</span>
            </label>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sec text-secondary hover:bg-[var(--bg-muted)]">Cancel</button>
          <button type="button" disabled={!name.trim() || selectedChatIds.length === 0 || isSaving} onClick={() => void save()} className="rounded-md bg-[var(--accent)] px-3 py-2 text-sec text-white disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}
