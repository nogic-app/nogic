import { invoke } from "@tauri-apps/api/core";
import { listenSidecar as listen } from "@/sidecarEvents.ts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isTauriCallbackIdError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return message.includes("Couldn't find callback id");
}

/**
 * Send one request to the Python sidecar and resolve with its `response` data.
 * Progress events are ignored; errors and timeouts reject with a clean message.
 */
export function requestSidecar<T = unknown>(
  action: string,
  fields: Record<string, unknown> = {},
  validate?: (data: unknown) => data is T,
  timeoutMs = 8000,
  requestId?: string,
): Promise<T> {
  const id = requestId ?? `${action}:${crypto.randomUUID()}`;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let stopListening: (() => void) | undefined;
    let timer: number | undefined;

    const settle = (complete: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      stopListening?.();
      complete();
    };

    void (async () => {
      try {
        const unlisten = await listen<string>("python-message", (event) => {
          let payload: unknown;
          try {
            payload = JSON.parse(event.payload);
          } catch {
            return;
          }
          if (!isRecord(payload) || payload.id !== id) return;

          if (payload.type === "response") {
            settle(() => {
              if (validate && !validate(payload.data)) {
                reject(
                  new Error(`The sidecar returned an invalid ${action} response.`),
                );
                return;
              }
              resolve(payload.data as T);
            });
          } else if (payload.type === "error") {
            settle(() =>
              reject(
                new Error(
                  typeof payload.error === "string"
                    ? payload.error
                    : `The sidecar could not complete ${action}.`,
                ),
              ),
            );
          }
        });

        if (settled) {
          unlisten();
          return;
        }
        stopListening = unlisten;
        timer = window.setTimeout(
          () => settle(() => reject(new Error(`The sidecar did not answer ${action}.`))),
          timeoutMs,
        );
        await invoke("send_to_sidecar", {
          message: JSON.stringify({ action, id, ...fields }),
        });
      } catch (error) {
        settle(() =>
          reject(error instanceof Error ? error : new Error(String(error))),
        );
      }
    })();
  });
}
