import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  FileSpreadsheet,
  FileText,
  FileType,
  Globe,
  Layers,
  Paperclip,
  Square,
  X,
} from "lucide-react";
import type { ChatModes } from "@/chatModes.ts";
import { useSettings } from "@/contexts/SettingsContext.tsx";
import { useTranslation } from "react-i18next";
import { FilePill, type FileAttachment } from "./FilePill.tsx";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

export type SkillTag = "pdf" | "word" | "excel";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  isStreaming: boolean;
  onSend: (modes: ChatModes, attachments: FileAttachment[], skill: SkillTag | null) => void;
  onStop: () => void;
  /** Retained for the workspace capability contract; images are not a composer skill. */
  supportsVision: boolean;
  /** False when the active Ollama model reports no thinking capability. */
  supportsThinking: boolean;
  /** Inline notice below the composer (e.g. Ollama offline). */
  notice?: ReactNode;
}

const MAX_LINES = 6;

const TOGGLE_BASE =
  "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sec transition-colors";
const TOGGLE_INACTIVE =
  "border-[var(--border)] text-secondary hover:bg-[var(--bg-muted)] hover:text-primary";
const TOGGLE_ACTIVE =
  "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]";

function toggleClass(active: boolean): string {
  return `${TOGGLE_BASE} ${active ? TOGGLE_ACTIVE : TOGGLE_INACTIVE}`;
}

export function Composer({
  value,
  onChange,
  isStreaming,
  onSend,
  onStop,
  supportsThinking,
  notice,
}: ComposerProps) {
  const { sendWithEnter } = useSettings();
  const { t } = useTranslation();
  const ref = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isDeepThink, setIsDeepThink] = useState<boolean>(false);
  const [isWeb, setIsWeb] = useState<boolean>(false);
  const [isThink, setIsThink] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [attachedSkill, setAttachedSkill] = useState<SkillTag | null>(null);

  // Close the skills menu on outside click or Escape.
  useEffect(() => {
    if (!isMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isMenuOpen]);

  // Auto-grow up to 6 lines, then scroll.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 22.4;
    const max = lineHeight * MAX_LINES;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [value]);

  const canSend = !isStreaming && (
    value.trim().length > 0 ||
    attachments.length > 0 ||
    attachedSkill !== null
  );

  const send = () => {
    if (!canSend) return;
    onSend({ think: isThink, deep_think: isDeepThink, web: isWeb }, attachments, attachedSkill);
    setAttachments([]);
    setAttachedSkill(null);
  };

  const attachFile = async (imagesOnly: boolean) => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: imagesOnly ? "Images" : "Documents",
          extensions: imagesOnly
            ? ["png", "jpg", "jpeg", "gif", "webp"]
            : ["pdf", "txt", "docx", "xlsx", "xls", "csv"],
        }],
      });
      if (typeof selected !== "string") return;
      const file = await invoke<{ name: string; size: number; type: string }>("get_file_metadata", {
        filePath: selected,
      });
      setAttachments((current) => [
        ...current.filter((item) => item.path !== selected),
        { ...file, path: selected },
      ]);
      setIsMenuOpen(false);
    } catch (error) {
      console.error("Failed to save the attached file.", error);
      window.alert(`Nogic could not save that file: ${String(error)}`);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;

    if (sendWithEnter) {
      // Enter sends; Shift+Enter keeps the default newline behaviour.
      if (e.shiftKey) return;
      e.preventDefault();
      send();
      return;
    }

    // Enter inserts a newline; Ctrl+Enter (or Cmd+Enter) sends.
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="w-full">
      <div className="rounded-lg border border-border bg-elevated shadow-quiet transition-shadow focus-within:border-border-strong focus-within:shadow-[0_0_0_2px_var(--focus)]">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {attachments.map((file) => (
              <FilePill
                key={file.path}
                file={file}
                onRemove={() => setAttachments((current) =>
                  current.filter((item) => item.path !== file.path)
                )}
              />
            ))}
          </div>
        )}
        {attachedSkill && (
          <div className="flex px-4 pt-3">
            <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-2.5 py-2 text-[var(--text-primary)]">
              <span aria-hidden="true">
                {attachedSkill === "pdf" ? <FileText size={16} /> : attachedSkill === "word" ? <FileType size={16} /> : <FileSpreadsheet size={16} />}
              </span>
              <span className="text-sec font-medium">
                {attachedSkill === "pdf" ? "PDF report" : attachedSkill === "word" ? "Word document" : "Excel document"}
              </span>
              <button
                type="button"
                aria-label="Remove document skill"
                onClick={() => setAttachedSkill(null)}
                className="rounded p-0.5 text-tertiary hover:bg-[var(--bg-elevated)] hover:text-primary"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
        <textarea
          id="chat-composer"
          ref={ref}
          dir="auto"
          rows={1}
          value={value}
          placeholder={t("composer.placeholder")}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className="block w-full resize-none bg-transparent px-4 pb-1 pt-3 text-body text-primary placeholder:text-tertiary focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <div className="flex min-w-0 items-center gap-1">
            <div ref={menuRef} className="relative shrink-0">
              <button
                type="button"
                aria-label={t("composer.attach")}
                aria-haspopup="menu"
                aria-expanded={isMenuOpen}
                onClick={() => setIsMenuOpen((open) => !open)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-secondary transition-colors hover:bg-[var(--bg-muted)] hover:text-primary"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              {isMenuOpen && (
                <div
                  role="menu"
                  aria-label="Skills"
                  className="absolute bottom-full start-0 z-20 mb-2 w-48 rounded-md border border-border bg-[var(--bg-elevated)] p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sec hover:bg-[var(--bg-muted)] hover:text-primary"
                    onClick={() => void attachFile(false)}
                  >
                    <Paperclip size={14} aria-hidden="true" />
                    Add File
                  </button>
                  <div role="separator" className="my-1 border-t border-border" />
                  <p className="px-2 pb-1 pt-1 text-meta uppercase tracking-wide text-tertiary">
                    Skills
                  </p>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sec hover:bg-[var(--bg-muted)] hover:text-primary"
                    onClick={() => {
                      setIsMenuOpen(false);
                      setAttachedSkill("pdf");
                    }}
                  >
                    <FileText size={14} aria-hidden="true" />
                    Generate PDF
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sec hover:bg-[var(--bg-muted)] hover:text-primary"
                    onClick={() => {
                      setIsMenuOpen(false);
                      setAttachedSkill("word");
                    }}
                  >
                    <FileType size={14} aria-hidden="true" />
                    Generate Word
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sec hover:bg-[var(--bg-muted)] hover:text-primary"
                    onClick={() => {
                      setIsMenuOpen(false);
                      setAttachedSkill("excel");
                    }}
                  >
                    <FileSpreadsheet size={14} aria-hidden="true" />
                    Generate Excel
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label="DeepThink"
              aria-pressed={isDeepThink}
              onClick={() => setIsDeepThink((active) => !active)}
              className={toggleClass(isDeepThink)}
            >
              <Layers size={14} aria-hidden="true" />
              DeepThink
            </button>
            <button
              type="button"
              aria-label="Web search"
              aria-pressed={isWeb}
              onClick={() => setIsWeb((active) => !active)}
              className={toggleClass(isWeb)}
            >
              <Globe size={14} aria-hidden="true" />
              Web
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <div className="relative">
              <select
                aria-label="Reasoning mode"
                value={isThink ? "think" : "fast"}
                onChange={(event) => setIsThink(event.target.value === "think")}
                className={`h-8 cursor-pointer appearance-none rounded-md border                 ps-2.5 pe-7 text-sec transition-colors focus:outline-none focus-visible:border-[var(--border-strong)] ${
                  isThink
                    ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]"
                    : "border-[var(--border)] bg-transparent text-secondary hover:bg-[var(--bg-muted)] hover:text-primary"
                }`}
              >
                <option value="fast" className="bg-[var(--bg-elevated)] text-[var(--text-primary)]">
                  Fast
                </option>
                <option value="think" className="bg-[var(--bg-elevated)] text-[var(--text-primary)]">
                  Think
                </option>
              </select>
              <ChevronDown
                size={12}
                aria-hidden="true"
                className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-tertiary"
              />
            </div>
            <button
              type="button"
              aria-label={isStreaming ? "Stop generating" : t("composer.send")}
              disabled={!isStreaming && !canSend}
              onClick={isStreaming ? onStop : send}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {isStreaming ? (
                <Square size={16} fill="currentColor" aria-hidden="true" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M8 13V3M3.5 7.5 8 3l4.5 4.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
      {notice && <p className="mt-2 text-sec text-secondary">{notice}</p>}
      {attachedSkill && !supportsThinking && (
        <p className="mt-2 text-meta text-[var(--warning)]">
          {t("composer.simpleModelWarning")}
        </p>
      )}
    </div>
  );
}
