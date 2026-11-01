import { FileImage, FileSpreadsheet, FileText, X } from "lucide-react";

export interface FileAttachment {
  name: string;
  path: string;
  type: string;
  size: number;
}

interface FilePillProps {
  file: FileAttachment;
  onRemove?: () => void;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ type }: { type: string }) {
  const normalized = type.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(normalized)) {
    return <FileImage size={16} aria-hidden="true" />;
  }
  if (["xls", "xlsx", "csv"].includes(normalized)) {
    return <FileSpreadsheet size={16} aria-hidden="true" />;
  }
  return <FileText size={16} aria-hidden="true" />;
}

export function FilePill({ file, onRemove }: FilePillProps) {
  const tooLarge = file.size > MAX_FILE_SIZE;
  return (
    <div
      className={`flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-2 ${
        tooLarge
          ? "border-[var(--danger)] bg-[var(--danger)]/10 text-[var(--danger)]"
          : "border-[var(--border)] bg-[var(--bg-muted)] text-[var(--text-primary)]"
      }`}
    >
      <FileIcon type={file.type} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sec font-medium" title={file.name}>
          {file.name}
        </p>
        <p className="text-meta text-secondary">
          {tooLarge
            ? `Too Large · ${file.type.toUpperCase()} · ${formatSize(file.size)}`
            : `${file.type.toUpperCase()} · ${formatSize(file.size)}`}
        </p>
      </div>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${file.name}`}
          onClick={onRemove}
          className="shrink-0 rounded p-0.5 text-tertiary hover:bg-[var(--bg-elevated)] hover:text-primary"
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
