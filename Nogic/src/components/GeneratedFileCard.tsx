import { useEffect, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  FileType as FileTypeIcon,
  RotateCcw,
} from "lucide-react";
import { requestSidecar } from "@/sidecarRequest.ts";

export type GeneratedFileType = "PDF" | "DOCX" | "XLSX";
export type GeneratedFileStatus = "success" | "missing" | "error";

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

interface GeneratedFileCardProps {
  fileName: string;
  fileType: GeneratedFileType;
  filePath: string;
  fileSize: number;
  status: GeneratedFileStatus;
  onRetry?: () => void;
  onOpen: () => void | Promise<void>;
  onSaveAs: () => void | Promise<void>;
  errorMessage?: string;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function typeLabel(fileType: GeneratedFileType): string {
  if (fileType === "DOCX") return "Word";
  if (fileType === "XLSX") return "Excel";
  return "PDF";
}

function TypeIcon({ fileType }: { fileType: GeneratedFileType }) {
  if (fileType === "XLSX") return <FileSpreadsheet size={16} aria-hidden="true" />;
  if (fileType === "DOCX") return <FileTypeIcon size={16} aria-hidden="true" />;
  return <FileText size={16} aria-hidden="true" />;
}

export function GeneratedFileCard({
  fileName,
  fileType,
  filePath,
  fileSize,
  status,
  onRetry,
  onOpen,
  onSaveAs,
  errorMessage,
}: GeneratedFileCardProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState(status);

  useEffect(() => {
    setCurrentStatus(status);
    if (status !== "success" || !filePath) return;
    let active = true;
    void requestSidecar<boolean>(
      "check_file_exists",
      { file_path: filePath },
      isBoolean,
    )
      .then((exists) => {
        if (active) setCurrentStatus(exists ? "success" : "missing");
      })
      .catch((error: unknown) => {
        console.error("Could not verify a generated file.", error);
      });
    return () => {
      active = false;
    };
  }, [filePath, status]);

  async function runAction(action: () => void | Promise<void>) {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      console.error("A generated-file action failed.", error);
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  if (currentStatus === "missing") {
    return (
      <section className="mt-3 rounded-lg border border-border bg-elevated p-4">
        <p className="text-sec italic text-secondary">File moved or deleted</p>
        {onRetry && (
          <button
            type="button"
            className="mt-3 rounded-md border border-border px-3 py-1.5 text-sec text-primary transition-colors hover:bg-[var(--bg-muted)]"
            onClick={onRetry}
          >
            Create again
          </button>
        )}
      </section>
    );
  }

  if (currentStatus === "error") {
    return (
      <section className="mt-3 rounded-lg border border-border bg-elevated p-4">
        <p className="text-sec font-medium text-primary">Could not create the file</p>
        <p className="mt-1 text-meta text-secondary">
          {errorMessage || "The model could not finish this document."}
        </p>
        {onRetry && (
          <button
            type="button"
            className="mt-3 rounded-md border border-border px-3 py-1.5 text-sec text-primary transition-colors hover:bg-[var(--bg-muted)]"
            onClick={onRetry}
          >
            <RotateCcw className="mr-1.5 inline" size={14} aria-hidden="true" />
            Try again
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="mt-3 rounded-lg border border-border bg-elevated p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-11 min-w-14 items-center justify-center gap-1.5 rounded-md bg-[var(--accent-subtle)] px-2 text-[var(--accent)]">
          <TypeIcon fileType={fileType} />
          <span className="text-meta font-semibold">{fileType}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sec font-semibold text-primary">{fileName}</p>
          <p className="mt-0.5 text-meta text-secondary">
            {typeLabel(fileType)} · {formatFileSize(fileSize)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sec font-medium text-white transition-opacity hover:opacity-90"
            onClick={() => void runAction(onOpen)}
          >
            Open
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sec text-primary transition-colors hover:bg-[var(--bg-muted)]"
            onClick={() => void runAction(onSaveAs)}
          >
            <Download size={14} aria-hidden="true" />
            Save as...
          </button>
        </div>
      </div>
      {actionError && (
        <p className="mt-2 text-meta text-[var(--danger)]">{actionError}</p>
      )}
      <p className="mt-3 break-all text-[11px] text-[var(--text-tertiary)]">
        Saved in {filePath}
      </p>
    </section>
  );
}
