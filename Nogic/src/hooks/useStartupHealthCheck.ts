import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listenSidecar as listen } from "@/sidecarEvents.ts";
import { isRecord, isTauriCallbackIdError } from "@/sidecarRequest.ts";

const BOOT_PING_ID = "boot_ping";
const BOOT_PING_TIMEOUT_MS = 10_000;

export type StartupHealth = "checking" | "ready" | "failed";

/**
 * Ping the sidecar once on startup. The packaged backend can take several
 * seconds to unpack, so the check waits up to 10 seconds for a `pong` before
 * declaring the engine unavailable. Any transport error fails immediately.
 */
export function useStartupHealthCheck(): StartupHealth {
  const [health, setHealth] = useState<StartupHealth>("checking");

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    let stopListening: (() => void) | undefined;
    let timer: number | undefined;

    const finish = (next: StartupHealth) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      stopListening?.();
      if (!cancelled) setHealth(next);
    };

    const startTimer = window.setTimeout(() => {
      void (async () => {
        try {
          const unlisten = await listen<string>("python-message", (event) => {
            let payload: unknown;
            try {
              payload = JSON.parse(event.payload);
            } catch {
              return;
            }
            if (!isRecord(payload) || payload.id !== BOOT_PING_ID) return;
            if (payload.type === "error") {
              finish("failed");
              return;
            }
            if (payload.type !== "response") return;
            finish(
              isRecord(payload.data) && payload.data.message === "pong"
                ? "ready"
                : "failed",
            );
          });

          if (cancelled || settled) {
            unlisten();
            return;
          }
          stopListening = unlisten;
          timer = window.setTimeout(() => finish("failed"), BOOT_PING_TIMEOUT_MS);
          await invoke("send_to_sidecar", {
            message: JSON.stringify({ action: "ping", id: BOOT_PING_ID }),
          });
        } catch (error) {
          if (cancelled && isTauriCallbackIdError(error)) return;
          console.error("The startup health check could not reach the sidecar.", error);
          finish("failed");
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      settled = true;
      window.clearTimeout(startTimer);
      if (timer !== undefined) window.clearTimeout(timer);
      stopListening?.();
    };
  }, []);

  return health;
}
