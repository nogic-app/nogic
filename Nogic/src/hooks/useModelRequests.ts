import { useCallback, useEffect, useRef, useState } from "react";
import { listenSidecar as listen } from "@/sidecarEvents.ts";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { isTauriCallbackIdError } from "@/sidecarRequest.ts";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onProgress?: (status: string) => void;
}

const REQUEST_TIMEOUT_MS = 15000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function responseError(payload: Record<string, unknown>, fallback: string): Error {
  return new Error(
    typeof payload.error === "string" ? payload.error : fallback,
  );
}

export function useModelRequests(onConnectionError: (message: string) => void) {
  const { t } = useTranslation();
  const pendingRequests = useRef(new Map<string, PendingRequest>());
  const listenerGeneration = useRef(0);
  const [listenerReady, setListenerReady] = useState(false);

  const request = useCallback(
    (
      action: string,
      fields: Record<string, string> = {},
      onProgress?: (progress: string) => void,
      requestId = `models:${crypto.randomUUID()}`,
    ): Promise<unknown> => {
      const requestGeneration = listenerGeneration.current;
      return new Promise((resolve, reject) => {
        let timer: number | undefined;
        const settle = {
          resolve: (value: unknown) => {
            if (timer !== undefined) window.clearTimeout(timer);
            resolve(value);
          },
          reject: (error: Error) => {
            if (timer !== undefined) window.clearTimeout(timer);
            reject(error);
          },
          onProgress,
        };
        pendingRequests.current.set(requestId, settle);
        timer = window.setTimeout(() => {
          if (!pendingRequests.current.has(requestId)) return;
          pendingRequests.current.delete(requestId);
          const message = "The Nogic engine did not respond. Please restart the app.";
          onConnectionError(message);
          settle.reject(new Error(message));
        }, REQUEST_TIMEOUT_MS);
        void invoke("send_to_sidecar", {
          message: JSON.stringify({ action, id: requestId, ...fields }),
        }).catch((reason: unknown) => {
          if (
            requestGeneration !== listenerGeneration.current &&
            isTauriCallbackIdError(reason)
          ) {
            return;
          }
          console.error("Could not reach the Nogic engine.", reason);
          pendingRequests.current.delete(requestId);
          const message = "Could not reach the Nogic engine. Please restart the app.";
          onConnectionError(message);
          settle.reject(new Error(message));
        });
      });
    },
    [onConnectionError],
  );

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listenerGeneration.current += 1;

    const startListening = async () => {
      try {
        const stopListening = await listen<string>("python-message", (event) => {
          let payload: unknown;
          try {
            payload = JSON.parse(event.payload);
          } catch (reason) {
            console.error("Received invalid JSON from the Python sidecar.", reason);
            return;
          }
          if (!isRecord(payload) || typeof payload.id !== "string") return;
          const pending = pendingRequests.current.get(payload.id);
          if (!pending) return;
          if (
            payload.type === "pull_progress" &&
            typeof payload.status === "string"
          ) {
            pending.onProgress?.(payload.status);
            return;
          }
          pendingRequests.current.delete(payload.id);
          if (payload.type === "response") {
            pending.resolve(payload.data);
          } else if (payload.type === "error") {
            pending.reject(responseError(payload, t("settings.modelRequestFailed")));
          } else {
            pending.reject(new Error("Received an unknown model response."));
          }
        });
        if (cancelled) {
          stopListening();
          return;
        }
        unlisten = stopListening;
        setListenerReady(true);
      } catch (reason) {
        if (cancelled && isTauriCallbackIdError(reason)) return;
        console.error("Failed to listen for model settings responses.", reason);
        onConnectionError("Could not connect to the local model service.");
      }
    };

    const startTimer = window.setTimeout(() => {
      void startListening();
    }, 0);
    return () => {
      cancelled = true;
      listenerGeneration.current += 1;
      window.clearTimeout(startTimer);
      unlisten?.();
      pendingRequests.current.clear();
    };
  }, [onConnectionError, t]);

  return { listenerReady, request };
}
