import { useEffect, useId, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listenSidecar as listen } from "@/sidecarEvents.ts";
import { open } from "@tauri-apps/plugin-dialog";
import { isTauriCallbackIdError } from "@/sidecarRequest.ts";

interface SelectedFile {
  path: string;
  name: string;
  size: number;
}

type UploadStatus = "idle" | "selected" | "saved" | "cancelled";
type CountrySelection = "MA" | "FR" | "US" | "EU" | "UK" | "OTHER";

const NAME_PLACEHOLDERS: Record<CountrySelection, string> = {
  MA: "e.g. Loi 12.90",
  FR: "e.g. Code de l'urbanisme",
  US: "e.g. 18 U.S.C. § 1",
  EU: "e.g. Regulation (EU) 2016/679",
  UK: "e.g. Environmental Protection Act",
  OTHER: "e.g. Saudi Labor Law",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(error: unknown): string {
  if (isRecord(error) && typeof error.userMessage === "string") {
    return error.userMessage;
  }
  return error instanceof Error ? error.message : String(error);
}

export function LawUploadCard() {
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [name, setName] = useState("");
  const [country, setCountry] = useState<CountrySelection>("MA");
  const [otherCountryCode, setOtherCountryCode] = useState("");
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState("");
  const nameInputId = useId();
  const countryInputId = useId();
  const otherCountryInputId = useId();
  const awaitingResponse = useRef(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const startListening = async () => {
      try {
        const stopListening = await listen<string>("python-message", (event) => {
          let payload: unknown;
          try {
            payload = JSON.parse(event.payload);
          } catch {
            return;
          }
          if (!isRecord(payload) || payload.id !== "add_1") return;
          if (!awaitingResponse.current) return;

          if (payload.type === "error") {
            awaitingResponse.current = false;
            setIsSaving(false);
            setStatus("selected");
            setError(
              typeof payload.userMessage === "string"
                ? payload.userMessage
                : typeof payload.error === "string"
                ? payload.error
                : "The law could not be saved.",
            );
            return;
          }
          if (payload.type !== "response" || !isRecord(payload.data)) return;

          awaitingResponse.current = false;
          setIsSaving(false);
          const responseName =
            typeof payload.data.law_name === "string"
              ? payload.data.law_name
              : name.trim();
          setSavedName(responseName);
          setStatus("saved");
          setError(null);
        });

        if (cancelled) {
          stopListening();
          return;
        }
        unlisten = stopListening;
      } catch (cause) {
        if (cancelled && isTauriCallbackIdError(cause)) return;
        console.error("Failed to listen for the law upload response.", cause);
      }
    };

    const startTimer = window.setTimeout(() => {
      void startListening();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      unlisten?.();
    };
  }, [name]);

  async function chooseFile() {
    setError(null);
    try {
      const selection = await open({
        multiple: false,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      const path = Array.isArray(selection) ? selection[0] : selection;
      if (!path) return;
      if (!path.toLowerCase().endsWith(".pdf")) {
        setError("Choose a PDF file.");
        return;
      }

      const filename = path.split(/[\\/]/).pop() ?? path;
      const size = await invoke<number>("law_file_size", {
        sourcePath: path,
      }).catch(() => 0);
      setFile({ path, name: filename, size });
      setStatus("selected");
    } catch (cause) {
      console.error("Failed to open the PDF picker.", cause);
      setError("Could not open the file picker.");
    }
  }

  function removeFile() {
    awaitingResponse.current = false;
    setIsSaving(false);
    setFile(null);
    setName("");
    setError(null);
    setStatus("idle");
  }

  function cancel() {
    awaitingResponse.current = false;
    setIsSaving(false);
    setFile(null);
    setName("");
    setError(null);
    setStatus("cancelled");
  }

  async function save() {
    if (!file || !name.trim() || isSaving) return;
    const countryCode =
      country === "OTHER"
        ? otherCountryCode.trim().toUpperCase() || "INT"
        : country;
    if (
      country === "OTHER" &&
      countryCode !== "INT" &&
      !/^[A-Z]{2}$/.test(countryCode)
    ) {
      setError("Enter a 2-letter country code.");
      return;
    }
    awaitingResponse.current = true;
    setIsSaving(true);
    setError(null);
    try {
      const validatedPath = await invoke<string>("copy_law_file", {
        sourcePath: file.path,
      });
      await invoke("send_to_sidecar", {
        message: JSON.stringify({
          action: "add_law",
          id: "add_1",
          file_path: validatedPath,
          law_name: name,
          country: countryCode,
        }),
      });
    } catch (cause) {
      awaitingResponse.current = false;
      setIsSaving(false);
      console.error("Failed to save the law PDF.", cause);
      setStatus("selected");
      setError(errorMessage(cause));
    }
  }

  if (status === "saved") {
    return (
      <div className="w-full max-w-[560px] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <p className="text-[14px] leading-[1.6] text-[var(--text-primary)]">
          Saved. <span className="font-medium">{savedName}</span> is now in your
          library, and I will cite it by that name.
        </p>
        <p className="mt-3 text-[12px] text-[var(--text-secondary)]">
          Library · {file?.name ?? "PDF"} ·{" "}
          {file ? formatFileSize(file.size) : "Unknown size"}
        </p>
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div className="w-full max-w-[560px] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <p className="text-[14px] text-[var(--text-secondary)]">
          Cancelled. Nothing was added.
        </p>
      </div>
    );
  }

  const canSave = Boolean(file) && name.trim().length > 0 && !isSaving;

  return (
    <div className="w-full max-w-[560px] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <h2 className="text-[16px] font-medium leading-[1.3] text-[var(--text-primary)]">
        Add a law
      </h2>
      <p className="mt-1 text-sm leading-[1.6] text-[var(--text-secondary)]">
        Nogic will read the PDF and cite it by the name you give it.
      </p>

      <div className="mt-4">
        <label
          htmlFor={countryInputId}
          className="mb-1 block text-sm text-[var(--text-primary)]"
        >
          Country
        </label>
        <select
          id={countryInputId}
          value={country}
          onChange={(event) =>
            setCountry(event.target.value as CountrySelection)
          }
          disabled={isSaving}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)] disabled:opacity-60"
        >
          <option value="MA">Morocco</option>
          <option value="FR">France</option>
          <option value="US">United States</option>
          <option value="EU">European Union</option>
          <option value="UK">United Kingdom</option>
          <option value="OTHER">International / Other</option>
        </select>
      </div>

      {country === "OTHER" && (
        <div className="mt-3">
          <label
            htmlFor={otherCountryInputId}
            className="mb-1 block text-sm text-[var(--text-primary)]"
          >
            2-letter country code
          </label>
          <input
            id={otherCountryInputId}
            type="text"
            value={otherCountryCode}
            onChange={(event) =>
              setOtherCountryCode(event.target.value.toUpperCase())
            }
            placeholder="e.g. SA"
            maxLength={2}
            autoCapitalize="characters"
            disabled={isSaving}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)] disabled:opacity-60"
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => void chooseFile()}
        disabled={isSaving}
        className="mt-4 flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-muted)] px-6 py-8 text-center transition-colors hover:bg-[var(--accent-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
      >
        <span className="text-sm text-[var(--text-primary)]">
          Drop the PDF here, or choose a file
        </span>
        <span className="text-[12px] text-[var(--text-secondary)]">
          PDF only
        </span>
      </button>

      {file && (
        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate font-mono text-[13px] text-[var(--text-primary)]">
              {file.name}
            </p>
            <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
              {formatFileSize(file.size)}
            </p>
          </div>
          <button
            type="button"
            onClick={removeFile}
            disabled={isSaving}
            className="shrink-0 text-[13px] text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      )}

      <div className="mt-4">
        <label
          htmlFor={nameInputId}
          className="mb-1 block text-sm text-[var(--text-primary)]"
        >
          Name
        </label>
        <input
          id={nameInputId}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={NAME_PLACEHOLDERS[country]}
          dir="auto"
          disabled={isSaving}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)] disabled:opacity-60"
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[13px] text-[var(--danger)]">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={cancel}
          className="h-8 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 text-[13px] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSave}
          className="h-8 rounded-md bg-[var(--accent)] px-3 text-[13px] text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-40"
        >
          {isSaving ? "Processing..." : "Save"}
        </button>
      </div>
      {isSaving && (
        <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
          Running OCR and extracting text. This may take a minute for scanned
          documents...
        </p>
      )}
    </div>
  );
}
