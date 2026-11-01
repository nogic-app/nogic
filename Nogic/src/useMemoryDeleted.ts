import { useEffect } from "react";
import { listenSidecar as listen } from "@/sidecarEvents.ts";
import { isTauriCallbackIdError } from "@/sidecarRequest.ts";

/**
 * Settings -> Memory deletes chats inside the sidecar. The workspace cannot
 * see that write, so Settings emits `memory-deleted` after `delete_memory`
 * succeeds. This hook forwards the event to a stable reset callback.
 */
export function useMemoryDeleted(onDeleted: () => void): void {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const startTimer = window.setTimeout(() => {
      void (async () => {
        try {
          const stop = await listen("memory-deleted", onDeleted);
          if (cancelled) stop();
          else unlisten = stop;
        } catch (error) {
          if (cancelled && isTauriCallbackIdError(error)) return;
          console.error("Failed to listen for memory deletion events.", error);
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      unlisten?.();
    };
  }, [onDeleted]);
}
