import { invoke } from "@tauri-apps/api/core";
import { listenSidecar as listen } from "@/sidecarEvents.ts";
import { openGeneratedFilePath } from "../generatedFile.ts";

export type ChatExportFormat = "pdf" | "word";

/** Matches the request id used by the sidebar export buttons. */
const EXPORT_REQUEST_ID = "exp_1";

/** Do not let a missing sidecar response block every later export click. */
const EXPORT_TIMEOUT_MS = 30_000;

let exportInFlight = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function alertExportFailure(format: ChatExportFormat, detail: string): void {
  window.alert(`Could not export this chat as ${format.toUpperCase()}.\n\n${detail}`);
}

async function openExportedFile(filePath: string, format: ChatExportFormat) {
  const label = format.toUpperCase();
  try {
    await openGeneratedFilePath(filePath);
  } catch (error) {
    console.error(`[export] Failed to open the exported ${label} file.`, error);
    window.alert(
      `The ${label} export was written to:\n${filePath}\n\n` +
        `but Nogic could not open it automatically.\n\n${String(error)}`,
    );
  }
}

/**
 * Ask the Python sidecar for a PDF/Word export, then open the returned file
 * with the system's default application.
 */
export async function exportChat(
  chatId: string,
  format: ChatExportFormat,
): Promise<void> {
  if (exportInFlight) {
    console.warn("[export] An export is already in progress; ignoring this click.");
    return;
  }
  exportInFlight = true;

  let settled = false;
  let unlisten: (() => void) | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const finish = () => {
    if (settled) return;
    settled = true;
    exportInFlight = false;
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    unlisten?.();
  };

  try {
    unlisten = await listen<string>("python-message", (event) => {
      if (settled) return;
      let payload: unknown;
      try {
        payload = JSON.parse(event.payload);
      } catch {
        return;
      }
      if (!isRecord(payload) || payload.id !== EXPORT_REQUEST_ID) return;

      if (payload.type === "error") {
        const detail =
          typeof payload.error === "string" ? payload.error : "Unknown sidecar error.";
        console.error(
          `[export] The Python sidecar failed to export the chat as ${format.toUpperCase()}.`,
          detail,
          payload,
        );
        finish();
        alertExportFailure(format, detail);
        return;
      }
      if (payload.type !== "response") return;

      const data = payload.data;
      if (
        !isRecord(data) ||
        typeof data.file_path !== "string" ||
        data.file_path.trim().length === 0
      ) {
        console.error("[export] Received an invalid export response from the Python sidecar.", payload);
        finish();
        alertExportFailure(format, "The sidecar returned no file path.");
        return;
      }

      const filePath = data.file_path;
      finish();
      void openExportedFile(filePath, format);
    });

    const message = {
      action: format === "pdf" ? "export_pdf" : "export_word",
      id: EXPORT_REQUEST_ID,
      chat_id: chatId,
    };

    timeoutId = setTimeout(() => {
      if (settled) return;
      console.error(`[export] Timed out waiting for the ${format.toUpperCase()} export.`);
      finish();
      alertExportFailure(format, "The sidecar did not answer within 30 seconds.");
    }, EXPORT_TIMEOUT_MS);

    await invoke("send_to_sidecar", { message: JSON.stringify(message) });
  } catch (error) {
    console.error(`[export] Failed to request a ${format.toUpperCase()} export.`, error);
    finish();
    alertExportFailure(format, String(error));
  }
}
